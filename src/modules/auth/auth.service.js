'use strict';

const config = require('../../config/app.config');
const redis = require('../../config/redis');
const crypto = require('crypto');
const { hashPassword, comparePassword } = require('../../utils/password.util');
const {
  generateAccessToken,
  generateRefreshToken,
  generateRandomToken,
  hashToken,
  verifyRefreshToken,
  generateVerificationToken,
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
  }) {
    this.authUserRepo = authUserRepository;
    this.verifyEmailRepo = verifyEmailRepository;
    this.walletSvc = walletService;
    this.xpSvc = xpService;
    this.taskSvc = taskService;
    this.activeStatusSvc = activeStatusService;
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

  async sendOtp({ email, countryCode, phone }) {
    try {

      const [existingEmail, existingPhone] = await Promise.all([
        this.authUserRepo.isEmailExist({ email }),
        this.authUserRepo.isPhoneExist({ countryCode, phone }),
        ]);
      if (existingEmail) throw createError('Email is already registered', 409);
      if (existingPhone) throw createError('Phone is already registered', 409);

      
      const verificationKey = `${OTP_PREFIX}:${email}:${countryCode}${phone}`;
      
      const emailOtp = crypto.randomInt(100000, 1000000).toString();
      const phoneOtp = crypto.randomInt(100000, 1000000).toString();
      
      const otpExpIn = new Date(Date.now() + parseInt(config.OTP_EXPIRES_IN, 10));
      const verificationObj = {
        email: {
          value: email,
          otp: emailOtp,
          isVerified: false,
        },
        phone: {
          countryCode,
          value: phone,
          otp: '123456', // phoneOtp
          isVerified: false,
        },
        otpExpIn,
      };

      await redis.setex(verificationKey, 60 * 5, JSON.stringify(verificationObj));

      const emailJobdata = {
        to: email,
        otp: emailOtp,
      };
      await addJob('email:otp-verification', emailJobdata);

      const { sessionData } = await this.#issueVerificationTokens({ email, countryCode, phone });

      return sessionData;
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
      if (verificationObj.email.otp !== emailOtp) {
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

  async signUp({ email, countryCode, phone, userData }) {
    try {
      const { name, username, password, dateOfBirth, location, college, interests } = userData;

      const verificationKey = `${OTP_PREFIX}:${email}:${countryCode}${phone}`;

      const cachedVerification = await redis.get(verificationKey);
      const verificationObj = cachedVerification ? JSON.parse(cachedVerification) : null;

      if (
        !verificationObj ||
        !verificationObj.phone.isVerified ||
        !verificationObj.email.isVerified
      )
        throw createError('Email and Phone is not verified!!', 400);

      const [existingEmail, existingUsername, existingPhone] = await Promise.all([
        this.authUserRepo.isEmailExist({ email }),
        this.authUserRepo.isUsernameExist({ username }),
        this.authUserRepo.isPhoneExist({ countryCode, phone }),
      ]);
      if (existingEmail) throw createError('Email is already registered', 409);
      if (existingPhone) throw createError('Phone is already registered', 409);
      if (existingUsername) throw createError('Username is already taken', 409);

      const passwordHash = await hashPassword(password);
      const newUser = await this.authUserRepo.create({
        name,
        username,
        email,
        countryCode,
        phone,
        passwordHash,
        dateOfBirth,
        location,
        college,
        interests,
        isVerified: true,
      });

      const userId = newUser.id;

      await this.authUserRepo.verifyEmail({ userId });
      await this.authUserRepo.verifyPhone({ userId });

      // Auto-create wallet for new user
      await this.walletSvc.createWallet({ userId });

      // // Auto-create XP wallet for new user
      await this.xpSvc.createXPwallet({ userId });

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

  async login({ email, password }) {
    try {
      const user = await this.authUserRepo.findByEmailLogin({ email });

      if (!user) throw createError('Invalid email or password', 401);
      if (user.isBanned) throw createError('Your account has been suspended', 403);
      if (!user.isActive) throw createError('Your account is deactivated', 403);
      if (!user.passwordHash) throw createError('Please sign in with Google', 400);

      const valid = await comparePassword(password, user.passwordHash);
      if (!valid) throw createError('Invalid email or password', 401);

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
        to: email,
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

      const payload = verifyRefreshToken(refreshToken);
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

  // Sends password reset email if email belongs to a password-based account.
  async forgotPassword({ email }) {
    try {
      const user = await this.authUserRepo.findByEmailUser({ email });

      if (user) {
        const rawToken = generateRandomToken();
        const tokenHash = hashToken(rawToken);
        const tokenExp = new Date(
          Date.now() + parseInt(config.PASSWORD_RESET_TOKEN_EXPIRES_IN, 10)
        );
        await this.authUserRepo.updatePasswordResetToken({ userId: user.id, tokenHash, tokenExp });

        const jobdata = {
          to: user.email,
          name: user.username,
          token: rawToken,
        };
        await addJob('email:password_reset', jobdata);
      }
    } catch (error) {
      throw error;
    }
  }

  // Resets password using a valid reset token.
  async resetPassword({ token, password }) {
    try {
      const tokenHash = hashToken(token);
      const user = await this.authUserRepo.findByPasswordResetToken(tokenHash);

      const currentTime = new Date(Date.now());
      if (!user || !user.passwordResetTokenExp || user.passwordResetTokenExp < currentTime) {
        throw createError('Password Reset Token is expired', 401);
      }

      const passwordHash = await hashPassword(password);

      const userId = user.id;
      await this.authUserRepo.updatePassword({ userId, passwordHash });

      const userDetail = await this.authUserRepo.findByIdUser({ userId });

      const jobdata = {
        to: userDetail.email,
        name: userDetail.username,
        title: 'Password Reset Successfully!',
        successMessage: 'Password Reset Successfully!',
      };
      await addJob('email:success', jobdata);
    } catch (error) {
      throw error;
    }
  }

  async getMe({ userId }) {
    try {
      const user = await this.authUserRepo.findByIdPrivate({ userId });
      if (!user) throw createError('User not found', 404);

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

  // Private
  async #issueTokens(user) {
    try {
      const userId = user.id;
      const role = user.role;
      const payload = { userId, role };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

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
      const verificationToken = generateVerificationToken(payload);
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
