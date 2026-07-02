'use strict';

const config = require('../../config/app.config')
const { hashPassword, comparePassword } = require('../../utils/password.util');
const {
  generateAccessToken,
  generateRefreshToken,
  generateRandomToken,
  hashToken,
  verifyRefreshToken,
} = require('../../utils/token.util');

const { createError } = require('../../utils/error.util');
const { addEmailJob } = require('../../jobs/queues/email.queue');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
};

class AuthService {
  constructor({
    authUserRepository,
    verifyEmailRepository,
    walletService,
    xpService,
    taskService,
  }) {
    this.authUserRepo = authUserRepository;
    this.verifyEmailRepo = verifyEmailRepository;
    this.walletSvc = walletService;
    this.xpSvc = xpService;
    this.taskSvc = taskService;
  }

  async sendOtpToEmail({email}) {
    try {
      const isEmailExist = await this.authUserRepo.isEmailExist({email});
      if (isEmailExist) throw createError('Email is already registered', 409);
      const otp = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')
      .toString();
      const expIn = new Date(Date.now() + parseInt(config.OTP_EXPIRES_IN, 10));
      
      const otpSendBefore = await this.verifyEmailRepo.isEmailExist({email});
      
      if (otpSendBefore) {
        await this.verifyEmailRepo.updateOtp({ email, otp, expIn });
      }else{
        await this.verifyEmailRepo.create({ email, otp, expIn });
      }


      const jobdata = {
        to: email,
        otp: otp
      }
      await addEmailJob('otp-verification', jobdata)

    } catch (error) {
      throw error;
    }
  }

  async verifyOtpForEmail({email, otp}) {
    try {
      const emailOtp = await this.verifyEmailRepo.findByEmail({email});
      if (!emailOtp) throw createError('Otp did not generated for this email', 409);

      const currentTime = new Date(Date.now());
      if (!emailOtp.otp || !emailOtp.expIn || emailOtp.expIn < currentTime)
        throw createError('Otp is expired', 409);

      if (emailOtp.otp !== otp) throw createError('Invalied Otp', 409);

      const verificationExpiresAt = new Date(Date.now() +  parseInt(config.VALIDATE_OTP_VERIFICATION, 10));
      await this.verifyEmailRepo.makeVerified({email, verificationExpiresAt});
    } catch (error) {
      throw error;
    }
  }

  async signUp({userData}) {
    try {
      const {name, username, email, password, gender, dateOfBirth} = userData
      const isEmailVerified = await this.verifyEmailRepo.findByEmail({email});
      
      if (!isEmailVerified || !isEmailVerified.isVerified)
        throw createError('Verified the email first', 400);
      
      const currentTime = new Date(Date.now());
      if(!isEmailVerified.verificationExpiresAt || isEmailVerified.verificationExpiresAt < currentTime) 
        throw createError('Verified the email again', 403);

      const [existingEmail, existingUsername] = await Promise.all([
        this.authUserRepo.isEmailExist({email}),
        this.authUserRepo.isUsernameExist({username}),
      ]);
      if (existingEmail) throw createError('Email is already registered', 409);
      if (existingUsername) throw createError('Username is already taken', 409);

      const passwordHash = await hashPassword(password);
      const newUser = await this.authUserRepo.create({ name, username, email, gender, dateOfBirth, passwordHash, isVerified: true });

      // Delete the email verification row
      await this.verifyEmailRepo.hardDelete({email});

      // Auto-create wallet for new user
      await this.walletSvc.createWallet({userId: newUser.id});
      
      // // Auto-create XP wallet for new user
      await this.xpSvc.createXPwallet({ userId: newUser.id });

      await this.taskSvc.createTask({userId: newUser.id});

      const jobdata = {
        to: email,
        name: username
      }
      await addEmailJob('welcome', jobdata);

      return { user: newUser };
    } catch (error) {
      throw error;
    }
  }
  
  async login({ email, password }) {
    try {
      const user = await this.authUserRepo.findByEmailLogin({email});

      if (!user) throw createError('Invalid email or password', 401);
      if (user.is_banned) throw createError('Your account has been suspended', 403);
      if (!user.is_active) throw createError('Your account is deactivated', 403);
      if (!user.password_hash) throw createError('Please sign in with Google', 400);

      const valid = await comparePassword(password, user.password_hash);
      if (!valid) throw createError('Invalid email or password', 401);

      const result = await this.#issueTokens(user);


      const jobdata = {
        to: email,
        name: user.name
      }
      await addEmailJob('welcome_back', jobdata);

      return result;
    } catch (error) {
      throw error;
    }
  }

  async verifyLoginPin({ userId, pin }) {
    try {
      const user = await this.authUserRepo.findByIdAppLock({userId})
      console.log(user)
      if(!user.app_lock_enabled)
          throw createError('Pin lock not set', 400);
        
      if(user.app_lock !== pin)
          throw createError('Invalid lock pin', 401);
    } catch (error) {
      throw error;
    }
  }

  async sendOtpToPhone({countryCode, phoneNumber}) {
    try {
      // send otp to phone

    } catch (error) {
      throw error
    }
  }

  async verifyAndAddPhone({userId, otp, countryCode, phoneNumber}) {
    try {
      // verify phone first

      await this.authUserRepo.updatePhone(userId, countryCode, phoneNumber)
    } catch (error) {
      throw error
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
  
  async refreshToken({refreshToken}) {
    try {
      if (!refreshToken) throw createError('Refresh token missing', 401);

      const payload = verifyRefreshToken(refreshToken);
      const userId = payload.userId
      const user = await this.authUserRepo.getRefreshTokenById({userId});
      
      if (!user || user.refresh_token_hash !== hashToken(refreshToken)) {
        throw createError('Invalid refresh token', 401);
      }

      return this.#issueTokens(user);
    } catch (error) {
      throw error;
    }
  }

  // Clears refresh token in DB (invalidates all sessions for this token family).
  async logout({userId}) {
    try {
      await this.authUserRepo.updateRefreshToken({userId, tokenHash: null});
    } catch (error) {
      throw error;
    }
  }

  async changePassword({userId, currentPassword, newPassword}) {
    try {
      const user = await this.authUserRepo.getPasswordByUserId({userId})

      if(!user || !user.password_hash)
        throw createError("Invalid current password", 400)

      const valid = await comparePassword(currentPassword, user.password_hash);
      if (!valid) 
        throw createError('Invalid current password', 400);

      const passwordHash = await hashPassword(newPassword);
      await this.authUserRepo.updatePassword({userId, passwordHash});
    } catch (error) {
      throw error
    }
  }

  // Sends password reset email if email belongs to a password-based account.
  async forgotPassword({email}) {
    try {
      const user = await this.authUserRepo.findByEmailUser({email});
      
      if (user) {
        const rawToken = generateRandomToken();
        const tokenHash = hashToken(rawToken);
        const tokenExp = new Date(Date.now() + parseInt(config.PASSWORD_RESET_TOKEN_EXPIRES_IN, 10));
        await this.authUserRepo.updatePasswordResetToken({userId: user.id, tokenHash, tokenExp});

        const jobdata = {
          to: user.email, 
          name: user.username, 
          token: rawToken
        }
        await addEmailJob('password_reset', jobdata)
      }
      
    } catch (error) {
      throw error;
    }
  }

  // Resets password using a valid reset token.
  async resetPassword({token, password}) {
    try {
      const tokenHash = hashToken(token);
      const user = await this.authUserRepo.findByPasswordResetToken(tokenHash);

      const currentTime = new Date(Date.now());
      if (!user || !user.password_reset_token_exp || user.password_reset_token_exp < currentTime) {
        throw createError('Password Reset Token is expired', 401);
      }

      const passwordHash = await hashPassword(password);

      const userId = user.id
      await this.authUserRepo.updatePassword({userId, passwordHash});

      const userDetail = await this.authUserRepo.findByIdUser({userId})

      const jobdata = {
        to: userDetail.email, 
        name: userDetail.username, 
        title: 'Password Reset Successfully!',
        successMessage: 'Password Reset Successfully!'
      }
      await addEmailJob('success', jobdata)
    } catch (error) {
      throw error;
    }
  }

  async getMe({userId}) {
    try {
      const user = await this.authUserRepo.findByIdPrivate({userId});
      if (!user) throw createError('User not found', 404);

      const totalKeys = Object.keys(user).length;

      const completedKeys = Object.values(user).filter(
        value => value !== null && value !== undefined
      ).length;

      const completionPercentage = Math.round( (completedKeys / totalKeys) * 100 );

      await this.taskSvc.updateProfileCompletion(userId, completionPercentage)
      return user;
    } catch (error) {
      throw error;
    }
  }

  // Private
  async #issueTokens(user) {
    try {
      const userId = user.id
      const role = user.role
      const payload = { userId, role };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      const tokenHash = hashToken(refreshToken);
      await this.authUserRepo.updateRefreshToken({userId, tokenHash});
      await this.authUserRepo.updateLastLogin({userId});

      return {
        userId: user.id,
        role: user.role,
        accessToken,
        refreshToken,
        cookieOpts: COOKIE_OPTS,
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AuthService;
