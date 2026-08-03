'use strict';

const config = require('../../config/app.config');
const redis = require('../../config/redis');
const crypto = require('crypto');
const { hashPassword, comparePassword } = require('../../utils/password.util');
const {
  generateToken,
  generateRandomToken,
  hashToken,
  decodeToken,
} = require('../../utils/token.util');

const { createError } = require('../../utils/error.util');
const { addJob } = require('../../jobs/queues/job.queue');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
};

const OTP_PREFIX = 'otp:';
const USERNAME_PREFIX = 'reserved_username:';
const normalizePhone = (value = '') => String(value).replace(/\D/g, '');
const normalizeCountryCode = (value = '') => {
  const digits = normalizePhone(value);
  return digits ? `+${digits}` : '';
};

const FLAGS = {
  EMAIL_VERIFIED: 1 << 0, // 1
  PHONE_VERIFIED: 1 << 1, // 2
};

class AuthService {
  constructor({
    authUserRepository,
    verifyEmailRepository,
    walletService,
    xpService,
    taskService,
    activeStatusService,
    mediaRepository,
    storageIntegration,
  }) {
    this.authUserRepo = authUserRepository;
    this.verifyEmailRepo = verifyEmailRepository;
    this.walletSvc = walletService;
    this.xpSvc = xpService;
    this.taskSvc = taskService;
    this.activeStatusSvc = activeStatusService;
    this.mediaRepo = mediaRepository;
    this.storageSvc = storageIntegration;
  }

  async usernameAvailable({ username }) {
    try {
      const isUserNameExistDB = await this.authUserRepo.isUsernameExist({ username });

      if (isUserNameExistDB) throw createError('Username already taken', 400);

    } catch (error) {
      throw error;
    }
  }

  async isEmailExist({ email }) {
    try {
      const isEmailRegistered = await this.authUserRepo.isEmailExist({ email });

      if (isEmailRegistered) throw createError('Email is already registered', 400);

    } catch (error) {
      throw error;
    }
  }

  async isPhoneExist({ countryCode, phone }) {
    try {
      const isPhoneRegistered = await this.authUserRepo.isPhoneExist({ countryCode, phone });

      if (isPhoneRegistered) throw createError('Phone is already registered', 400);

    } catch (error) {
      throw error;
    }
  }

  async sendOtp({ email, countryCode, phone, socialToken }) {
    try {

      const [existingEmail, existingPhone] = await Promise.all([
        this.authUserRepo.isEmailExist({ email }),
        this.authUserRepo.isPhoneExist({ countryCode, phone }),
        ]);
      if (existingEmail) throw createError('Email is already registered', 409);
      if (existingPhone) throw createError('Phone is already registered', 409);

      let isEmailVerified = false;
      let verifiedEmail = email;
      if (socialToken) {
        try {
          const payload = decodeToken(socialToken);
          if (payload.email) {
            isEmailVerified = true;
            verifiedEmail = payload.email; // Enforce the token's email
          }
        } catch (e) {
          throw createError('Invalid or expired social token', 400);
        }
      }
      
      const verificationKey = `${OTP_PREFIX}:${verifiedEmail}:${countryCode}${phone}`;
      
      const emailOtp = crypto.randomInt(100000, 1000000).toString();
      const phoneOtp = crypto.randomInt(100000, 1000000).toString();
      
      const otpExpIn = new Date(Date.now() + parseInt(config.OTP_EXPIRES_IN, 10));
      const verificationObj = {
        email: {
          value: verifiedEmail,
          otp: emailOtp,
          isVerified: isEmailVerified,
        },
        phone: {
          countryCode,
          value: phone,
          otp: phoneOtp,
          isVerified: false,
        },
        otpExpIn,
      };

      await redis.setex(verificationKey, 60 * 5, JSON.stringify(verificationObj));

      if (!isEmailVerified) {
        const emailJobdata = {
          to: verifiedEmail,
          otp: emailOtp,
        };
        await addJob('email:otp-verification', emailJobdata);
      }

      const smsJobdata = {
        to: `${countryCode}${phone}`,
        otp: phoneOtp,
      };
      await addJob('sms:otp-verification', smsJobdata);

      const { sessionData } = await this.#issueVerificationTokens({ email: verifiedEmail, countryCode, phone });

      return sessionData;
    } catch (error) {
      throw error;
    }
  }

  async verifyPassword({ userId, password, email, countryCode, phone }) {
    try {
      const user = await this.authUserRepo.findByIdSecure({ userId });
      if (!user || !user.passwordHash) throw createError('Invalid user or password not set', 400);

      const valid = await comparePassword(password, user.passwordHash);
      if (!valid) throw createError('Incorrect password', 400);

      if (email && user.email.toLowerCase() !== email.toLowerCase()) {
        throw createError('Current email address does not match', 400);
      }

      if (phone && countryCode) {
        const registeredPhone = user.phone || user.phoneNumber;
        if (
          normalizePhone(registeredPhone) !== normalizePhone(phone) ||
          normalizeCountryCode(user.countryCode) !== normalizeCountryCode(countryCode)
        ) {
          throw createError('Current phone number does not match', 400);
        }
      }

      return { valid: true };
    } catch (error) {
      throw error;
    }
  }

  async requestChangePhoneOtp({ userId, newCountryCode, newPhone }) {
    try {
      const user = await this.authUserRepo.findByIdPrivate({ userId });
      if (!user) throw createError('User not found', 404);

      const existing = await this.authUserRepo.isPhoneExist({ countryCode: newCountryCode, phone: newPhone });
      if (existing && existing.id !== userId) throw createError('Phone is already registered by another user', 409);

      const emailOtp = crypto.randomInt(100000, 1000000).toString();
      const phoneOtp = crypto.randomInt(100000, 1000000).toString();
      const otpExpIn = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      const emailKey = `${OTP_PREFIX}:email:change_phone:${userId}`;
      await redis.setex(emailKey, 60 * 5, JSON.stringify({ email: user.email, otp: emailOtp, otpExpIn }));
      await addJob('email:otp-verification', { to: user.email, otp: emailOtp });

      const phoneKey = `${OTP_PREFIX}:phone:change_phone:${userId}`;
      await redis.setex(phoneKey, 60 * 5, JSON.stringify({ phone: newPhone, countryCode: newCountryCode, otp: phoneOtp, otpExpIn }));
      await addJob('sms:otp-verification', { to: `${newCountryCode}${newPhone}`, otp: phoneOtp });

      return { message: 'OTPs sent to registered email and new phone successfully' };
    } catch (error) {
      throw error;
    }
  }

  async verifyChangePhoneOtp({ userId, emailOtp, phoneOtp }) {
    try {
      const emailKey = `${OTP_PREFIX}:email:change_phone:${userId}`;
      const phoneKey = `${OTP_PREFIX}:phone:change_phone:${userId}`;

      const [cachedEmailData, cachedPhoneData] = await Promise.all([
        redis.get(emailKey),
        redis.get(phoneKey)
      ]);

      if (!cachedEmailData || !cachedPhoneData) throw createError('OTP is expired or invalid', 400);

      const emailData = JSON.parse(cachedEmailData);
      const phoneData = JSON.parse(cachedPhoneData);

      const currentTime = new Date();
      if (new Date(emailData.otpExpIn) < currentTime || new Date(phoneData.otpExpIn) < currentTime) {
        throw createError('OTP has expired', 400);
      }

      if (emailData.otp !== emailOtp) throw createError('Invalid Email OTP', 400);
      if (phoneData.otp !== phoneOtp) throw createError('Invalid Phone OTP', 400);

      await this.authUserRepo.updatePhone(userId, phoneData.countryCode, phoneData.phone);

      await Promise.all([
        redis.del(emailKey),
        redis.del(phoneKey)
      ]);

      return { message: 'Phone updated successfully' };
    } catch (error) {
      throw error;
    }
  }

  async requestChangeEmailOtp({ userId, newEmail }) {
    try {
      const user = await this.authUserRepo.findByIdPrivate({ userId });
      if (!user) throw createError('User not found', 404);

      const phoneDetails = await this.authUserRepo.findPhoneByUserId(user.id);
      const hasPhone = !!(phoneDetails && phoneDetails.phone && phoneDetails.countryCode);
      if (!hasPhone) throw createError('A registered phone number is required to change email', 400);

      const existing = await this.authUserRepo.isEmailExist({ email: newEmail });
      if (existing && existing.id !== userId) throw createError('Email is already registered by another user', 409);

      const emailOtp = crypto.randomInt(100000, 1000000).toString();
      const phoneOtp = crypto.randomInt(100000, 1000000).toString();
      const otpExpIn = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      const phoneKey = `${OTP_PREFIX}:phone:change_email:${userId}`;
      await redis.setex(phoneKey, 60 * 5, JSON.stringify({ phone: phoneDetails.phone, countryCode: phoneDetails.countryCode, otp: phoneOtp, otpExpIn }));
      await addJob('sms:otp-verification', { to: `${phoneDetails.countryCode}${phoneDetails.phone}`, otp: phoneOtp });

      const emailKey = `${OTP_PREFIX}:email:change_email:${userId}`;
      await redis.setex(emailKey, 60 * 5, JSON.stringify({ email: newEmail, otp: emailOtp, otpExpIn }));
      await addJob('email:otp-verification', { to: newEmail, otp: emailOtp });

      return { message: 'OTPs sent to registered phone and new email successfully' };
    } catch (error) {
      throw error;
    }
  }

  async verifyChangeEmailOtp({ userId, emailOtp, phoneOtp }) {
    try {
      const emailKey = `${OTP_PREFIX}:email:change_email:${userId}`;
      const phoneKey = `${OTP_PREFIX}:phone:change_email:${userId}`;

      const [cachedEmailData, cachedPhoneData] = await Promise.all([
        redis.get(emailKey),
        redis.get(phoneKey)
      ]);

      if (!cachedEmailData || !cachedPhoneData) throw createError('OTP is expired or invalid', 400);

      const emailData = JSON.parse(cachedEmailData);
      const phoneData = JSON.parse(cachedPhoneData);

      const currentTime = new Date();
      if (new Date(emailData.otpExpIn) < currentTime || new Date(phoneData.otpExpIn) < currentTime) {
        throw createError('OTP has expired', 400);
      }

      if (emailData.otp !== emailOtp) throw createError('Invalid Email OTP', 400);
      if (phoneData.otp !== phoneOtp) throw createError('Invalid Phone OTP', 400);

      await this.authUserRepo.updateEmail(userId, emailData.email);

      await Promise.all([
        redis.del(emailKey),
        redis.del(phoneKey)
      ]);

      return { message: 'Email updated successfully' };
    } catch (error) {
      throw error;
    }
  }

  async verifyOtp({ email, emailOtp, countryCode, phone, phoneOtp }) {
    try {
      const currentTime = new Date(Date.now());

      const verificationKey = `${OTP_PREFIX}:${email}:${countryCode}${phone}`;

      const cachedVerification = await redis.get(verificationKey);
      const verificationObj = cachedVerification ? JSON.parse(cachedVerification) : null;

      if (!verificationObj || new Date(verificationObj.otpExpIn) < currentTime) {
        throw createError('OTP is expired', 400);
      }

      // Verify email OTP
      if (!verificationObj.email.isVerified && verificationObj.email.otp !== emailOtp) {
        throw createError('Invalid email OTP', 400);
      }

      // Verify phone OTP
      if (verificationObj.phone.otp !== phoneOtp) {
        throw createError('Invalid phone OTP', 400);
      }

      // Mark both as verified
      verificationObj.email.isVerified = true;
      verificationObj.email.otp = null;

      verificationObj.phone.isVerified = true;
      verificationObj.phone.otp = null;

      await redis.setex(verificationKey, 60 * 5, JSON.stringify(verificationObj));

      return;
    } catch (error) {
      throw error;
    }
  }

  // Generates a short, unique, uppercase referral code (md5-based + retry on collision)
  async #generateReferralCode() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      const existing = await this.authUserRepo.findByReferralCode({ referralCode: code });
      if (!existing) return code;
    }
    // Extremely unlikely fallback
    return crypto.randomBytes(5).toString('hex').toUpperCase();
  }

  async signUp({ email, countryCode, phone, userData, socialToken }) {
    try {
      const { name, username, password, dateOfBirth, gender, location, latitude, longitude, occupation, organization, interests } = userData;

      // Refer & Earn: optional referral code entered at signup. Validate it
      // belongs to a real user (cannot refer yourself) and link the accounts.
      let referredBy = null;
      let enteredReferralCode = String(userData.referralCode || '').trim().toUpperCase();
      if (enteredReferralCode) {
        const referrer = await this.authUserRepo.findByReferralCode({ referralCode: enteredReferralCode });
        if (!referrer) throw createError('Invalid referral code', 400);
        referredBy = referrer.id;
      }

      let verifiedEmail = email;
      let socialProviderId = null;
      let socialProvider = null;
      let socialAvatarUrl = null;

      if (socialToken) {
        try {
          const payload = decodeToken(socialToken);
          verifiedEmail = payload.email; // Override email from frontend payload
          socialProvider = payload.provider;
          socialProviderId = payload.providerId;
          socialAvatarUrl = payload.avatarUrl;
        } catch (e) {
          throw createError('Invalid or expired social token', 400);
        }
      }

      const verificationKey = `${OTP_PREFIX}:${verifiedEmail}:${countryCode}${phone}`;

      const cachedVerification = await redis.get(verificationKey);
      const verificationObj = cachedVerification ? JSON.parse(cachedVerification) : null;

      if (
        !verificationObj ||
        !verificationObj.phone.isVerified ||
        !verificationObj.email.isVerified
      )
        throw createError('Email and Phone is not verified!!', 400);

      const [existingEmail, existingUsername, existingPhone] = await Promise.all([
        this.authUserRepo.isEmailExist({ email: verifiedEmail }),
        this.authUserRepo.isUsernameExist({ username }),
        this.authUserRepo.isPhoneExist({ countryCode, phone }),
      ]);
      if (existingEmail) throw createError('Email is already registered', 409);
      if (existingPhone) throw createError('Phone is already registered', 409);
      if (existingUsername) throw createError('Username is already taken', 409);

      const passwordHash = await hashPassword(password);
      
      const createData = {
        name,
        username,
        email: verifiedEmail,
        countryCode,
        phone,
        passwordHash,
        dateOfBirth,
        gender,
        location,
        latitude,
        longitude,
        occupation,
        organization,
        interests,
        isVerified: true,
      };

      if (socialProvider === 'google') createData.googleId = socialProviderId;
      if (socialProvider === 'apple') {
        createData.appleId = socialProviderId;
        createData.appleRefreshToken = 'placeholder_token_for_now';
      }

      // Every user gets their own referral code (used for the Share Referral button)
      createData.referralCode = await this.#generateReferralCode();
      createData.referredBy = referredBy;

      const newUser = await this.authUserRepo.create(createData);

      const userId = newUser.id;

      if (socialAvatarUrl) {
        try {
          // Download the image
          const response = await fetch(socialAvatarUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            
            // Upload to S3
            const s3Key = this.storageSvc.generateS3Key('avatars', userId, contentType);
            await this.storageSvc.uploadBuffer(s3Key, buffer, contentType);
            const cloudfrontUrl = `${config.CLOUDFRONT_DOMAIN}/${s3Key}`; // or rely on confirmUpload

            // Insert into media table
            const media = await this.mediaRepo.create({
              uploaderId: userId,
              mediaType: 'image',
              s3Key: s3Key,
              mimeType: contentType,
              sizeBytes: buffer.length,
              processingStatus: 'ready'
            });

            // Update user with media ID
            await this.authUserRepo.updateAvatar(userId, media.id);
            // Optionally update cloudfrontUrl if needed
            await this.mediaRepo.updateStatus(media.id, 'ready', cloudfrontUrl);
          }
        } catch (err) {
          console.error('Failed to download/upload social avatar:', err);
        }
      }

      await this.authUserRepo.verifyEmail({ userId });
      await this.authUserRepo.verifyPhone({ userId });

      // Auto-create wallet for new user
      await this.walletSvc.createWallet({ userId });

      // // Auto-create XP wallet for new user
      await this.xpSvc.createXPwallet({ userId });

      // Refer & Earn: reward the new user 500 XP for signing up with a code,
      // and reward the referrer with 500 XP + a notification too.
      if (referredBy) {
        try {
          await this.xpSvc.creditXP({
            userId,
            xp: 500,
            transactionType: 'reward',
            sourceType: 'referral_signup_bonus',
          });
          await this.xpSvc.creditXP({
            userId: referredBy,
            xp: 500,
            transactionType: 'reward',
            sourceType: 'referral_invite_bonus',
          });

          const { notificationService } = require('../notification/notification.container');
          if (notificationService) {
            await notificationService.create({
              recipientId: referredBy,
              senderId: userId,
              type: 'REFERRAL_REWARD',
              title: 'Referral bonus earned! 🎉',
              message: `${newUser.name} (@${newUser.username}) joined with your referral code — you earned 500 XP!`,
              resourceType: 'user',
              resourceId: userId,
            });
          }
        } catch (err) {
          console.error('Referral bonus failed:', err.message);
        }
      }

      // // Auto-create task for new user
      await this.taskSvc.createTask({ userId });

      // // Auto-create activeStatus for new user
      await this.activeStatusSvc.createStatus({ userId });

      const jobdata = {
        to: email,
        name: username
      }
      await addJob('email:welcome', jobdata);

      await redis.del(verificationKey);
      const { sessionData } = await this.#issueTokens(newUser);

      return { user: newUser, sessionData, COOKIE_OPTS };
    } catch (error) {
      throw error;
    }
  }

  async login({ identifier, email, password }) {
    try {
      const loginIdentifier = identifier || email;
      const user = await this.authUserRepo.findByIdentifierLogin({ identifier: loginIdentifier });

      if (!user) throw createError('Invalid login or password', 401);
      if (user.isBanned) throw createError('Your account has been suspended', 403);
      if (!user.isActive) throw createError('Your account is deactivated', 403);
      if (!user.passwordHash) throw createError('Please sign in with Google', 400);

      const valid = await comparePassword(password, user.passwordHash);
      if (!valid) throw createError('Invalid login or password', 401);

      const userId = user.id;
      const isVerified = await this.authUserRepo.getFlagByID({ userId });

      const isEmailVerified = (isVerified.flags & FLAGS.EMAIL_VERIFIED) !== 0;
      const isPhoneVerified = (isVerified.flags & FLAGS.PHONE_VERIFIED) !== 0;

      if (!isEmailVerified && !isPhoneVerified)
        return { success: false, message: 'Email and Phone are not verified', userId };

      if (!isEmailVerified) return { success: false, message: 'Email is not verified', userId };

      if (!isPhoneVerified) return { success: false, message: 'Phone is not verified', userId };

      const { userData, sessionData } = await this.#issueTokens(user);

      const jobdata = {
        to: user.email,
        name: user.name
      }
      await addJob('email:welcome', jobdata);

      return { success: true, userData, sessionData };
    } catch (error) {
      throw error;
    }
  }

  async verifyLoginPin({ userId, pin }) {
    try {
      const user = await this.authUserRepo.findByIdAppLock({ userId });

      if (!user.appLockEnabled) 
        throw createError('App lock is not enabled', 400);
      

      if (user.appLock !== pin) 
        throw createError('Invalid PIN', 401);
      
    } catch (error) {
      throw error;
    }
  }

  async setLoginPin({ userId, pin }) {
    try {
      const user = await this.authUserRepo.findByIdAppLock({ userId });

      if (user.appLockEnabled) throw createError('App lock PIN is already set', 400);

      await this.authUserRepo.setAppLock({ userId, pin });
    } catch (error) {
      throw error;
    }
  }

  async updateLoginPin({ userId, currentPin, newPin }) {
    try {
      const user = await this.authUserRepo.findByIdAppLock({ userId });

      if (!user.appLockEnabled) 
        throw createError('App lock is not enabled', 400);
      

      if (user.appLock !== currentPin) 
        throw createError('Current PIN is incorrect', 401);
      

      await this.authUserRepo.setAppLock({ userId, pin: newPin });
    } catch (error) {
      throw error;
    }
  }

  async removeLoginPin({ userId, currentPin }) {
    try {
      const user = await this.authUserRepo.findByIdAppLock({ userId });

      if (!user.appLockEnabled) 
        throw createError('App lock is not enabled', 400);

      if (user.appLock !== currentPin) 
        throw createError('Current PIN is incorrect', 401);

      await this.authUserRepo.removeAppLock({ userId });
    } catch (error) {
      throw error;
    }
  }

  // Authenticates or registers via Google ID token.
  // async googleAuth(idToken) {
  //   try {
  //     const { googleId, email, name, picture } = await this.googleSvc.verifyGoogleToken(idToken);

  //     let user = await this.authUserRepo.findByGoogleId(googleId);

  //     if (!user) {
  //       const existing = await this.authUserRepo.findByEmail(email);
  //       if (existing) {
  //         user = await this.authUserRepo.linkGoogleAccount(existing.id, googleId, picture);
  //       } else {
  //         const username = `${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`;
  //         user = await this.authUserRepo.createWithGoogle({
  //           name,
  //           username,
  //           email,
  //           googleId,
  //           googleAvatar: picture,
  //         });
  //         await this.walletRepo.create(user.id);
  //         this.emailSvc.sendWelcomeEmail(email, name).catch(console.error);
  //       }
  //     }

  //     if (user.is_banned) throw createError('Your account has been suspended', 403);
  //     return this.#issueTokens(user);
  //   } catch (error) {
  //     throw error;
  //   }
  // }

  // Rotates refresh token. Validates hash against DB.

  async refreshToken({ refreshToken }) {
    try {
      if (!refreshToken) throw createError('Refresh token is required', 401);

      const payload = decodeToken(refreshToken);
      const userId = payload.userId;
      const user = await this.authUserRepo.getRefreshTokenById({ userId });

      if (!user || user.refreshTokenHash !== hashToken(refreshToken)) {
        throw createError('Invalid refresh token', 401);
      }
      const { userData, sessionData } = this.#issueTokens(user);
      return { userData, sessionData };
    } catch (error) {
      throw error;
    }
  }

  // Clears refresh token in DB (invalidates all sessions for this token family).
  async logout({ userId }) {
    try {
      await this.authUserRepo.updateRefreshToken({ userId, tokenHash: null });
    } catch (error) {
      throw error;
    }
  }

  async changePassword({ userId, currentPassword, newPassword }) {
    try {
      const user = await this.authUserRepo.getPasswordByUserId({ userId });

      if (!user || !user.passwordHash) throw createError('Invalid current password', 400);

      const valid = await comparePassword(currentPassword, user.passwordHash);
      if (!valid) throw createError('Current password is incorrect', 400);

      const passwordHash = await hashPassword(newPassword);
      await this.authUserRepo.updatePassword({ userId, passwordHash });
    } catch (error) {
      throw error;
    }
  }

  async requestChangePasswordOtp({ userId, currentPassword, email, countryCode, phone }) {
    try {
      const user = await this.authUserRepo.getPasswordByUserId({ userId });
      if (!user || !user.passwordHash) throw createError('Invalid user or password not set', 400);

      const valid = await comparePassword(currentPassword, user.passwordHash);
      if (!valid) throw createError('Current password is incorrect', 400);

      // Get user email and phone details
      const userDetails = await this.authUserRepo.findByIdPrivate({ userId });
      const phoneDetails = await this.authUserRepo.findPhoneByUserId(userId);
      const hasPhone = !!(phoneDetails && phoneDetails.phone && phoneDetails.countryCode);
      
      // Verify provided email matches
      if (!email || email.toLowerCase() !== userDetails.email.toLowerCase()) {
        throw createError('Provided email does not match registered email', 400);
      }
      
      // Verify provided phone matches (if user has a phone)
      if (hasPhone) {
        if (!phone || !countryCode) {
          throw createError('Registered phone number and country code are required', 400);
        }
        if (phone !== phoneDetails.phone || countryCode !== phoneDetails.countryCode) {
          throw createError('Provided phone number does not match registered phone', 400);
        }
      }

      const emailOtp = crypto.randomInt(100000, 1000000).toString();
      const phoneOtp = crypto.randomInt(100000, 1000000).toString(); // Generated OTP
      const otpExpIn = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store Email OTP
      const emailKey = `${OTP_PREFIX}:email:change_password:${userId}`;
      await redis.setex(emailKey, 60 * 5, JSON.stringify({ email, otp: emailOtp, otpExpIn }));
      await addJob('email:otp-verification', { to: email, otp: emailOtp });

      // Store Phone OTP
      if (hasPhone) {
        const phoneKey = `${OTP_PREFIX}:phone:change_password:${userId}`;
        await redis.setex(phoneKey, 60 * 5, JSON.stringify({ phone: phoneDetails.phone, countryCode: phoneDetails.countryCode, otp: phoneOtp, otpExpIn }));
        await addJob('sms:otp-verification', { to: `${phoneDetails.countryCode}${phoneDetails.phone}`, otp: phoneOtp });
      }

      return { hasPhone, phone: hasPhone ? `${phoneDetails.countryCode}${phoneDetails.phone}` : undefined };
    } catch (error) {
      throw error;
    }
  }

  async verifyChangePasswordOtp({ userId, emailOtp, phoneOtp }) {
    try {
      const currentTime = new Date(Date.now());
      const userDetails = await this.authUserRepo.findByIdPrivate({ userId });
      if (!userDetails) throw createError('User not found', 404);

      // Verify Email OTP
      const emailKey = `${OTP_PREFIX}:email:change_password:${userId}`;
      const emailCached = await redis.get(emailKey);
      const emailData = emailCached ? JSON.parse(emailCached) : null;

      if (!emailData || new Date(emailData.otpExpIn) < currentTime) {
        throw createError('Email OTP has expired. Please request a new one.', 400);
      }
      if (emailData.otp !== emailOtp) {
        throw createError('Invalid Email OTP', 400);
      }

      // Verify Phone OTP (if user has phone)
      const phoneDetails = await this.authUserRepo.findPhoneByUserId(userId);
      let phoneKey = null;
      if (phoneDetails && phoneDetails.phone && phoneDetails.countryCode) {
        if (!phoneOtp) throw createError('Phone OTP is required', 400);
        phoneKey = `${OTP_PREFIX}:phone:change_password:${userId}`;
        const phoneCached = await redis.get(phoneKey);
        const phoneData = phoneCached ? JSON.parse(phoneCached) : null;
        
        if (!phoneData || new Date(phoneData.otpExpIn) < currentTime) {
          throw createError('Phone OTP has expired. Please request a new one.', 400);
        }
        if (phoneData.otp !== phoneOtp) {
          throw createError('Invalid Phone OTP', 400);
        }
      }

      const changeTokenPayload = { userId, purpose: 'change_password' };
      const changeToken = generateToken(changeTokenPayload, '5m');

      await redis.del(emailKey);
      if (phoneKey) await redis.del(phoneKey);

      return { changeToken };
    } catch (error) {
      throw error;
    }
  }

  async confirmChangePassword({ changeToken, newPassword }) {
    try {
      const decoded = decodeToken(changeToken);
      if (decoded.purpose !== 'change_password') {
        throw createError('Invalid token purpose', 400);
      }
      const userId = decoded.userId;

      // Update password
      const passwordHash = await hashPassword(newPassword);
      await this.authUserRepo.updatePassword({ userId, passwordHash });
    } catch (error) {
      throw error;
    }
  }

  // Sends password reset OTPs to both email and phone (if available).
  async forgotPassword({ identifier }) {
    try {
      const user = await this.authUserRepo.findByIdentifier(identifier);
      if (!user) throw createError('No account found with that email, phone or username', 404);

      const email = user.email;
      const phoneDetails = await this.authUserRepo.findPhoneByUserId(user.id);
      const hasPhone = !!(phoneDetails && phoneDetails.phone && phoneDetails.countryCode);

      const emailOtp = crypto.randomInt(100000, 1000000).toString();
      const phoneOtp = crypto.randomInt(100000, 1000000).toString(); // Generated OTP
      const otpExpIn = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store Email OTP
      const emailKey = `${OTP_PREFIX}:email:reset_password:${email}`;
      await redis.setex(emailKey, 60 * 5, JSON.stringify({ email, otp: emailOtp, otpExpIn }));
      await addJob('email:otp-verification', { to: email, otp: emailOtp });

      // Store Phone OTP (only if user has a phone number)
      if (hasPhone) {
        const phoneKey = `${OTP_PREFIX}:phone:reset_password:${phoneDetails.countryCode}${phoneDetails.phone}`;
        await redis.setex(phoneKey, 60 * 5, JSON.stringify({ phone: phoneDetails.phone, countryCode: phoneDetails.countryCode, otp: phoneOtp, otpExpIn }));
        await addJob('sms:otp-verification', { to: `${phoneDetails.countryCode}${phoneDetails.phone}`, otp: phoneOtp });
      }

      return { hasPhone, phone: hasPhone ? `${phoneDetails.countryCode}${phoneDetails.phone}` : undefined, email };
    } catch (error) {
      throw error;
    }
  }

  async verifyResetPasswordOtp({ email, emailOtp, phoneOtp }) {
    try {
      const currentTime = new Date(Date.now());
      const user = await this.authUserRepo.findByEmailUser({ email });
      if (!user) throw createError('User not found', 404);

      // Verify Email OTP
      const emailKey = `${OTP_PREFIX}:email:reset_password:${email}`;
      const emailCached = await redis.get(emailKey);
      const emailData = emailCached ? JSON.parse(emailCached) : null;

      if (!emailData || new Date(emailData.otpExpIn) < currentTime) {
        throw createError('Email OTP has expired. Please request a new one.', 400);
      }
      if (emailData.otp !== emailOtp) {
        throw createError('Invalid Email OTP', 400);
      }

      // Verify Phone OTP (if user has phone)
      const phoneDetails = await this.authUserRepo.findPhoneByEmail({ email });
      let phoneKey = null;
      if (phoneDetails && phoneDetails.phone && phoneDetails.countryCode) {
        if (!phoneOtp) throw createError('Phone OTP is required', 400);
        phoneKey = `${OTP_PREFIX}:phone:reset_password:${phoneDetails.countryCode}${phoneDetails.phone}`;
        const phoneCached = await redis.get(phoneKey);
        const phoneData = phoneCached ? JSON.parse(phoneCached) : null;
        
        if (!phoneData || new Date(phoneData.otpExpIn) < currentTime) {
          throw createError('Phone OTP has expired. Please request a new one.', 400);
        }
        if (phoneData.otp !== phoneOtp) {
          throw createError('Invalid Phone OTP', 400);
        }
      }

      const tokenPayload = { userId: user.id, email, purpose: 'reset_password' };
      const token = generateToken(tokenPayload, '5m');

      await redis.del(emailKey);
      if (phoneKey) await redis.del(phoneKey);

      return { token };
    } catch (error) {
      throw error;
    }
  }

  // Resets password by verifying OTPs then updating password.
  async resetPassword({ token, password }) {
    try {
      const decoded = decodeToken(token);
      if (decoded.purpose !== 'reset_password') {
        throw createError('Invalid token purpose', 400);
      }
      const userId = decoded.userId;

      // Update password
      const passwordHash = await hashPassword(password);
      await this.authUserRepo.updatePassword({ userId, passwordHash });
    } catch (error) {
      throw error;
    }
  }

  async getMe({ userId }) {
    try {
      const user = await this.authUserRepo.findByIdPrivate({ userId });
      if (!user) throw createError('User not found', 404);

      try {
        const xpWallet = await this.xpSvc.getXP({ userId });
        user.xp = xpWallet ? xpWallet.Xp : 0;
        const totalXp = xpWallet ? parseInt(xpWallet.totalXpEarned || 0, 10) : 0;
        user.totalXpEarned = totalXp;
        user.level = Math.floor(totalXp / 1000) + 1;
        user.rank = user.level > 10 ? 'Pro' : user.level > 5 ? 'Intermediate' : 'Beginner';
        user.xpToNext = user.level * 1000;
      } catch (err) {
        user.xp = 0;
        user.totalXpEarned = 0;
        user.level = 1;
        user.rank = 'Beginner';
        user.xpToNext = 1000;
      }

      try {
        const pool = require('../../config/database');
        const commRes = await pool.query(`SELECT COUNT(*) FROM community_members WHERE user_id = $1`, [userId]);
        user.communitiesJoinedCount = parseInt(commRes.rows[0].count, 10);
        
        const gamesRes = await pool.query(`SELECT games_played FROM game_stats WHERE user_id = $1`, [userId]);
        user.gamesPlayedCount = gamesRes.rows[0] ? parseInt(gamesRes.rows[0].games_played, 10) : 0;
      } catch(err) {
        user.communitiesJoinedCount = 0;
        user.gamesPlayedCount = 0;
      }

      const totalKeys = Object.keys(user).length;

      const completedKeys = Object.values(user).filter(
        (value) => value !== null && value !== undefined
      ).length;

      const completionPercentage = Math.round((completedKeys / totalKeys) * 100);

      await this.taskSvc.updateProfileCompletion(userId, completionPercentage);
      return user;
    } catch (error) {
      throw error;
    }
  }

  async googleAuth(idToken) {
    try {
      if (!process.env.GOOGLE_CLIENT_ID) {
        throw createError('Google login is temporarily unavailable', 503);
      }
      
      // In production, verify using google-auth-library
      // For now, decode JWT directly (mocking verification)
      const payloadBase64 = idToken.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      
      const { sub: googleId, email, name, picture } = payload;
      if (!email) throw createError('Invalid token', 400);

      // Check if user exists by googleId or email
      let user = await this.authUserRepo.findByEmailUser({ email });
      
      if (!user) {
        const socialToken = generateToken({ email, name: name || 'Google User', provider: 'google', providerId: googleId, avatarUrl: picture }, config.SOCIAL_TOKEN_EXPIRES_IN);
        return { success: false, action: 'REGISTER_SOCIAL', socialToken, data: { name: name || 'Google User', email } };
      } else if (!user.googleId) {
        // Link google account to existing user (assuming authUserRepo has a method or we'd just update it, mocked for now)
      }

      return await this.#issueTokens(user);
    } catch (error) {
      throw error;
    }
  }

  async appleAuth(identityToken, fullName) {
    try {
      // In production, verify using apple-signin-auth
      
      const payloadBase64 = identityToken.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      
      const { sub: appleId, email } = payload;
      
      let user = null;
      if (email) {
        user = await this.authUserRepo.findByEmailUser({ email });
      }

      if (!user) {
        const generatedEmail = email || `${appleId}@privaterelay.appleid.com`;
        const socialToken = generateToken({ email: generatedEmail, name: fullName || 'Apple User', provider: 'apple', providerId: appleId }, config.SOCIAL_TOKEN_EXPIRES_IN);
        return { success: false, action: 'REGISTER_SOCIAL', socialToken, data: { name: fullName || 'Apple User', email: generatedEmail } };
      }

      return await this.#issueTokens(user);
    } catch (error) {
      throw error;
    }
  }

  // Private
  async #issueTokens(user) {
    try {
      const userId = user.id;
      const role = user.role;
      const payload = { userId, role };
      const accessToken = generateToken(payload, config.ACCESS_TOKEN_EXPIRES_IN);
      const refreshToken = generateToken(payload, config.REFRESH_TOKEN_EXPIRES_IN);

      const tokenHash = hashToken(refreshToken);
      await this.authUserRepo.updateRefreshToken({ userId, tokenHash });
      await this.authUserRepo.updateLastLogin({ userId });

      const userData = {
        userId: user.id,
        role: user.role,
      };

      const sessionData = {
        accessToken,
        refreshToken,
        cookieOpts: COOKIE_OPTS,
      };
      return { userData, sessionData };
    } catch (error) {
      throw error;
    }
  }
  async #issueVerificationTokens({ email, countryCode, phone }) {
    try {
      const payload = { email, countryCode, phone };
      const verificationToken = generateToken(payload, config.VERIFICATION_TOKEN_EXPIRES_IN);
      const tokenHash = hashToken(verificationToken);

      const sessionData = {
        verificationToken,
        cookieOpts: COOKIE_OPTS,
      };
      return { sessionData };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AuthService;
