'use strict';

const { apiResponse } = require('../../utils/response.util');
const config = require('../../config/app.config')

class AuthController {
  constructor({ authService }) {
    this.authSvc = authService;
  }


  usernameAvailable = async (req, res, next) => {
    try {
      const {username} = req.body
      const token = await this.authSvc.usernameAvailable({username})
    
      res.json(apiResponse(null, 'Username is available'));

    } catch (error) {
      next(error)
    }
  }

  isEmailExist = async (req, res, next) => {
    try {
      const {email} = req.body
      const token = await this.authSvc.isEmailExist({email})
      
      res.json(apiResponse(null, 'Email is available'));

    } catch (error) {
      next(error)
    }
  }

  isPhoneExist = async (req, res, next) => {
    try {
      const {countryCode, phone} = req.body
      const token = await this.authSvc.isPhoneExist({countryCode, phone})
      
      res.json(apiResponse(null, 'Phone is available'));

    } catch (error) {
      next(error)
    }
  }

  sendOtp = async (req, res, next) => {
    try {
      const { email, countryCode, phone, socialToken } = req.body;
      const sessionData = await this.authSvc.sendOtp ({email, countryCode, phone, socialToken});

      res.cookie('verification_token', sessionData.verificationToken, {
        ...sessionData.cookieOpts,
        maxAge: config.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.json(apiResponse({ verificationToken: sessionData.verificationToken }, 'Otp send successfully'));
    } catch (error) {
      next(error);
    }
  };

  verifyOtp = async (req, res, next) => {
    try {
      const email = req.email 
      const countryCode = req.countryCode 
      const phone = req.phone 
      const {emailOtp, phoneOtp} = req.body
      await this.authSvc.verifyOtp({email, emailOtp, countryCode, phone, phoneOtp})

      res.json(apiResponse(null, 'OTP verified successfully'));
    } catch (error) {
      next(error)
    }
  }


  signUp = async (req, res, next) => {
    try {
      const userData = req.body;
      const email = req.email;
      const countryCode = req.countryCode;
      const phone = req.phone;
      const socialToken = userData.socialToken; // Extract from userData
      const { deviceId, pushToken, pushProvider, platform } = userData;
      
      const { user, sessionData, referrer, COOKIE_OPTS } = await this.authSvc.signUp({email, countryCode, phone, userData, socialToken, deviceId, pushToken, pushProvider, platform});

      res.clearCookie('verification_token', {...COOKIE_OPTS});
      res.cookie('access_token', sessionData.accessToken, {
        ...sessionData.cookieOpts,
        maxAge: config.ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.cookie('refresh_token', sessionData.refreshToken, {
        ...sessionData.cookieOpts,
        maxAge: config.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.json(apiResponse({user, sessionData, referrer}, 'Account created.'));
    } catch (error) {
      next(error);
    }
  };

  login = async (req, res, next) => {
    try {
      const { identifier, email, password, deviceId, pushToken, pushProvider, platform } = req.body;
      const result = await this.authSvc.login({ identifier: identifier || email, password, deviceId, pushToken, pushProvider, platform });

      if(!result.success){
        res.json(result)
        return
      }

      const {userData, sessionData} = result

      res.cookie('access_token', sessionData.accessToken, {
        ...sessionData.cookieOpts,
        maxAge: config.ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.cookie('refresh_token', sessionData.refreshToken, {
        ...sessionData.cookieOpts,
        maxAge: config.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.json(apiResponse({ ...userData, sessionData }, 'Logged in successfully'));
    } catch (error) {
      next(error);
    }
  };

  verifyLoginPin = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { pin } = req.body;
      await this.authSvc.verifyLoginPin({ userId, pin });

      res.json(apiResponse(null, 'Pin verified successfuly'));
    } catch (error) {
      next(error);
    }
  };

  setLoginPin = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { pin } = req.body;
      await this.authSvc.setLoginPin({ userId, pin });

      res.json(apiResponse(null, 'Pin Set successfuly'));
    } catch (error) {
      next(error);
    }
  };

  updateLoginPin = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { currentPin, newPin } = req.body;
      
      await this.authSvc.updateLoginPin({ userId, currentPin, newPin });

      res.json(apiResponse(null, 'Pin update successfuly'));
    } catch (error) {
      next(error);
    }
  };

  removeLoginPin = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { currentPin } = req.body;
      await this.authSvc.removeLoginPin({ userId, currentPin });

      res.json(apiResponse(null, 'Pin removed successfuly'));
    } catch (error) {
      next(error);
    }
  };

  googleAuth = async (req, res, next) => {
    try {
      const { idToken, deviceId, pushToken, pushProvider, platform } = req.body;
      const result = await this.authSvc.googleAuth(idToken, { deviceId, pushToken, pushProvider, platform });
      
      if (result.action === 'REGISTER_SOCIAL') {
        res.json(apiResponse(result, 'Social Registration Required'));
        return;
      }

      res.cookie('access_token', result.sessionData.accessToken, {
        ...result.sessionData.cookieOpts,
        maxAge: config.ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS,
      });
      res.cookie('refresh_token', result.sessionData.refreshToken, {
        ...result.sessionData.cookieOpts,
        maxAge: config.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS,
      });
      res.json(apiResponse({ user: result.userData, sessionData: result.sessionData }, 'Google auth successful'));
    } catch (error) {
      next(error);
    }
  };

  googleCallback = async (req, res, next) => {
    let returnUrl = 'taddlebox://google-auth';
    try {
      const { id_token: identityToken, state } = req.body;
      let deviceId;
      
      if (state) {
        try {
          const parsedState = JSON.parse(decodeURIComponent(state));
          if (parsedState.returnUrl) returnUrl = parsedState.returnUrl;
          if (parsedState.deviceId) deviceId = parsedState.deviceId;
        } catch (e) {
          console.error("Failed to parse state", e);
        }
      }

      const result = await this.authSvc.googleAuth(identityToken, { deviceId });
      const separator = returnUrl.includes('?') ? '&' : '?';

      if (result.action === 'REGISTER_SOCIAL') {
        const dataStr = encodeURIComponent(JSON.stringify(result.data));
        const redirectUri = `${returnUrl}${separator}action=REGISTER_SOCIAL&socialToken=${result.socialToken}&data=${dataStr}`;
        res.redirect(redirectUri);
        return;
      }
      
      const redirectUri = `${returnUrl}${separator}accessToken=${result.sessionData.accessToken}&refreshToken=${result.sessionData.refreshToken}&sessionId=${result.sessionData.sessionId || ''}`;
      res.redirect(redirectUri);
    } catch (error) {
      const separator = returnUrl ? (returnUrl.includes('?') ? '&' : '?') : '?';
      const base = returnUrl || 'taddlebox://google-auth';
      res.redirect(`${base}${separator}error=${encodeURIComponent(error.message || 'Authentication failed')}`);
    }
  };

  appleAuth = async (req, res, next) => {
    try {
      const { identityToken, fullName, deviceId, pushToken, pushProvider, platform } = req.body;
      const result = await this.authSvc.appleAuth(identityToken, fullName, { deviceId, pushToken, pushProvider, platform });
      
      if (result.action === 'REGISTER_SOCIAL') {
        res.json(apiResponse(result, 'Social Registration Required'));
        return;
      }

      res.cookie('access_token', result.sessionData.accessToken, {
        ...result.sessionData.cookieOpts,
        maxAge: config.ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS,
      });
      res.cookie('refresh_token', result.sessionData.refreshToken, {
        ...result.sessionData.cookieOpts,
        maxAge: config.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS,
      });
      res.json(apiResponse({ user: result.userData, sessionData: result.sessionData }, 'Apple auth successful'));
    } catch (error) {
      next(error);
    }
  };

  appleCallback = async (req, res, next) => {
    let returnUrl = 'taddlebox://apple-auth';
    try {
      const { id_token: identityToken, user, state } = req.body;
      
      if (state) {
        try {
          const parsedState = JSON.parse(decodeURIComponent(state));
          if (parsedState.returnUrl) returnUrl = parsedState.returnUrl;
        } catch (e) {
          console.error("Failed to parse state", e);
        }
      }

      let fullName = '';
      if (user) {
        try {
          const parsedUser = JSON.parse(user);
          fullName = parsedUser?.name?.firstName 
            ? `${parsedUser.name.firstName} ${parsedUser.name.lastName || ''}`.trim() 
            : undefined;
        } catch (e) {
          console.error("Failed to parse Apple user data", e);
        }
      }

      const result = await this.authSvc.appleAuth(identityToken, fullName);
      const separator = returnUrl.includes('?') ? '&' : '?';

      if (result.action === 'REGISTER_SOCIAL') {
        const dataStr = encodeURIComponent(JSON.stringify(result.data));
        const redirectUri = `${returnUrl}${separator}action=REGISTER_SOCIAL&socialToken=${result.socialToken}&data=${dataStr}`;
        res.redirect(redirectUri);
        return;
      }
      
      const redirectUri = `${returnUrl}${separator}accessToken=${result.sessionData.accessToken}&refreshToken=${result.sessionData.refreshToken}&sessionId=${result.sessionData.sessionId || ''}`;
      res.redirect(redirectUri);
    } catch (error) {
      const separator = returnUrl ? (returnUrl.includes('?') ? '&' : '?') : '?';
      const base = returnUrl || 'taddlebox://apple-auth';
      res.redirect(`${base}${separator}error=${encodeURIComponent(error.message || 'Authentication failed')}`);
    }
  };

  refreshToken = async (req, res, next) => {
    try {
      // Accept the refresh token from the body (mobile app keeps tokens in
      // SecureStore, not cookies) or the cookie (web). The service result
      // carries the new tokens under sessionData.
      const refreshToken = req.body?.refreshToken || req.cookies?.refresh_token;
      const sessionId = req.body?.sessionId;
      const result = await this.authSvc.refreshToken({refreshToken, sessionId});
      const { accessToken, refreshToken: nextRefreshToken, cookieOpts, sessionId: newSessionId, tokenExpiresAt } = result.sessionData;
      res.cookie('access_token', accessToken, {
        ...cookieOpts,
        maxAge: config.ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.cookie('refresh_token', nextRefreshToken, {
        ...cookieOpts,
        maxAge: config.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      // ALSO return the tokens in the body so API clients (the app, which
      // stores them in SecureStore) can rotate them — without this the app's
      // interceptor reads res.data.data.accessToken and gets nothing, so every
      // expired session silently fails to refresh.
      res.json(apiResponse({ accessToken, refreshToken: nextRefreshToken, sessionId: newSessionId, tokenExpiresAt }, 'Token refreshed'));
    } catch (error) {
      next(error);
    }
  };
  
  logout = async (req, res, next) => {
    try {
      const userId = req.userId;
      const sessionId = req.body?.sessionId;
      await this.authSvc.logout({userId, sessionId});
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      res.json(apiResponse(null, 'Logged out successfully'));
    } catch (error) {
      next(error);
    }
  };

  changePassword = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { currentPassword, email, countryCode, phone } = req.body;
      const result = await this.authSvc.requestChangePasswordOtp({ userId, currentPassword, email, countryCode, phone });
      res.json(apiResponse(result, 'OTP sent for verification'));
    } catch (error) {
      next(error);
    }
  };

  verifyChangePasswordOtp = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { emailOtp, phoneOtp } = req.body;
      const result = await this.authSvc.verifyChangePasswordOtp({ userId, emailOtp, phoneOtp });
      res.json(apiResponse(result, 'OTPs verified successfully'));
    } catch (error) {
      next(error);
    }
  };

  confirmChangePassword = async (req, res, next) => {
    try {
      const { changeToken, newPassword } = req.body;
      await this.authSvc.confirmChangePassword({ changeToken, newPassword });
      res.json(apiResponse(null, 'Password changed successfully'));
    } catch (error) {
      next(error);
    }
  }

  forgotPassword = async (req, res, next) => {
    try {
      const { identifier } = req.body;
      const result = await this.authSvc.forgotPassword({ identifier });
      res.json(apiResponse(result, 'OTPs have been sent to registered contact details.'));
    } catch (error) {
      next(error);
    }
  };

  verifyResetPasswordOtp = async (req, res, next) => {
    try {
      const { email, emailOtp, phoneOtp } = req.body;
      const result = await this.authSvc.verifyResetPasswordOtp({ email, emailOtp, phoneOtp });
      res.json(apiResponse(result, 'OTPs verified successfully'));
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req, res, next) => {
    try {
      const { token, password } = req.body;
      await this.authSvc.resetPassword({token, password});
      res.json(apiResponse(null, 'Password reset successfully'));
    } catch (error) {
      next(error);
    }
  };

  validateSessions = async (req, res, next) => {
    try {
      const { sessions } = req.body; // [{ userId, refreshToken, sessionId }]
      const results = await this.authSvc.validateSessions({ sessions: sessions || [] });
      res.json(apiResponse({ results }, 'Sessions validated'));
    } catch (error) {
      next(error);
    }
  };

  getMe = async (req, res, next) => {
    try {
      const userId = req.userId;
      const user = await this.authSvc.getMe({userId});
      res.json(apiResponse({ user }, 'Profile get successfully!'));
    } catch (error) {
      next(error);
    }
  };

  verifyPassword = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { password, email, countryCode, phone } = req.body;
      const result = await this.authSvc.verifyPassword({ userId, password, email, countryCode, phone });
      res.json(apiResponse(result, 'Password verified successfully'));
    } catch (error) {
      next(error);
    }
  };

  requestChangePhoneOtp = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { newCountryCode, newPhone } = req.body;
      const result = await this.authSvc.requestChangePhoneOtp({ userId, newCountryCode, newPhone });
      res.json(apiResponse(result, 'OTPs sent to email and phone successfully'));
    } catch (error) {
      next(error);
    }
  };

  verifyChangePhoneOtp = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { emailOtp, phoneOtp } = req.body;
      const result = await this.authSvc.verifyChangePhoneOtp({ userId, emailOtp, phoneOtp });
      res.json(apiResponse(result, 'Phone updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  requestChangeEmailOtp = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { newEmail } = req.body;
      const result = await this.authSvc.requestChangeEmailOtp({ userId, newEmail });
      res.json(apiResponse(result, 'OTPs sent to phone and email successfully'));
    } catch (error) {
      next(error);
    }
  };

  verifyChangeEmailOtp = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { emailOtp, phoneOtp } = req.body;
      const result = await this.authSvc.verifyChangeEmailOtp({ userId, emailOtp, phoneOtp });
      res.json(apiResponse(result, 'Email updated successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = AuthController;
