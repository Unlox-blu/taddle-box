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
      
      const { user, sessionData, COOKIE_OPTS } = await this.authSvc.signUp({email, countryCode, phone, userData, socialToken});

      res.clearCookie('verification_token', {...COOKIE_OPTS});
      res.cookie('access_token', sessionData.accessToken, {
        ...sessionData.cookieOpts,
        maxAge: config.ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.cookie('refresh_token', sessionData.refreshToken, {
        ...sessionData.cookieOpts,
        maxAge: config.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.json(apiResponse({user, sessionData}, 'Account created.'));
    } catch (error) {
      next(error);
    }
  };

  login = async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await this.authSvc.login({ email, password });

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
      const { idToken } = req.body;
      const result = await this.authSvc.googleAuth(idToken);
      
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
      
      if (state) {
        try {
          const parsedState = JSON.parse(decodeURIComponent(state));
          if (parsedState.returnUrl) returnUrl = parsedState.returnUrl;
        } catch (e) {
          console.error("Failed to parse state", e);
        }
      }

      const result = await this.authSvc.googleAuth(identityToken);
      const separator = returnUrl.includes('?') ? '&' : '?';

      if (result.action === 'REGISTER_SOCIAL') {
        const dataStr = encodeURIComponent(JSON.stringify(result.data));
        const redirectUri = `${returnUrl}${separator}action=REGISTER_SOCIAL&socialToken=${result.socialToken}&data=${dataStr}`;
        res.redirect(redirectUri);
        return;
      }
      
      const redirectUri = `${returnUrl}${separator}accessToken=${result.sessionData.accessToken}&refreshToken=${result.sessionData.refreshToken}`;
      res.redirect(redirectUri);
    } catch (error) {
      const separator = returnUrl ? (returnUrl.includes('?') ? '&' : '?') : '?';
      const base = returnUrl || 'taddlebox://google-auth';
      res.redirect(`${base}${separator}error=${encodeURIComponent(error.message || 'Authentication failed')}`);
    }
  };

  appleAuth = async (req, res, next) => {
    try {
      const { identityToken, fullName } = req.body;
      const result = await this.authSvc.appleAuth(identityToken, fullName);
      
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
      
      const redirectUri = `${returnUrl}${separator}accessToken=${result.sessionData.accessToken}&refreshToken=${result.sessionData.refreshToken}`;
      res.redirect(redirectUri);
    } catch (error) {
      const separator = returnUrl ? (returnUrl.includes('?') ? '&' : '?') : '?';
      const base = returnUrl || 'taddlebox://apple-auth';
      res.redirect(`${base}${separator}error=${encodeURIComponent(error.message || 'Authentication failed')}`);
    }
  };

  refreshToken = async (req, res, next) => {
    try {
      const { refresh_token: refreshToken } = req.cookies;
      const result = await this.authSvc.refreshToken({refreshToken});
      res.cookie('access_token', result.accessToken, {
        ...result.cookieOpts,
        maxAge: config.ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.cookie('refresh_token', result.refreshToken, {
        ...result.cookieOpts,
        maxAge: config.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.json(apiResponse(null, 'Token refreshed'));
    } catch (error) {
      next(error);
    }
  };
  
  logout = async (req, res, next) => {
    try {
      const userId = req.userId;
      await this.authSvc.logout({userId});
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      res.json(apiResponse(null, 'Logged out successfully'));
    } catch (error) {
      next(error);
    }
  };

  changePassword = async (req, res, next) => {
    try {
      const userId = req.userId
      const {currentPassword, newPassword} = req.body;
      await this.authSvc.changePassword({userId, currentPassword, newPassword});
      res.json(apiResponse(null, 'Password changed successfuly'));
    } catch (error) {
      next(error)
    }
  }

  forgotPassword = async (req, res, next) => {
    try {
      const { email } = req.body;
      const result = await this.authSvc.forgotPassword({email});
      res.json(apiResponse(result, 'If that email exists, an OTP has been sent.'));
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
      const { password } = req.body;
      const result = await this.authSvc.verifyPassword({ userId, password });
      res.json(apiResponse(result, 'Password verified successfully'));
    } catch (error) {
      next(error);
    }
  };

  sendPhoneOtp = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { countryCode, phone, purpose } = req.body;
      const result = await this.authSvc.sendPhoneOtp({ userId, countryCode, phone, purpose });
      res.json(apiResponse(result, 'OTP sent successfully'));
    } catch (error) {
      next(error);
    }
  };

  sendEmailOtp = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { email, purpose } = req.body;
      const result = await this.authSvc.sendEmailOtp({ userId, email, purpose });
      res.json(apiResponse(result, 'OTP sent successfully'));
    } catch (error) {
      next(error);
    }
  };

  verifyPhoneOtp = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { otp, purpose } = req.body;
      const result = await this.authSvc.verifySingleOtp({ userId, type: 'phone', otp, purpose });
      res.json(apiResponse(result, 'OTP verified successfully'));
    } catch (error) {
      next(error);
    }
  };

  verifyEmailOtp = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { otp, purpose } = req.body;
      const result = await this.authSvc.verifySingleOtp({ userId, type: 'email', otp, purpose });
      res.json(apiResponse(result, 'OTP verified successfully'));
    } catch (error) {
      next(error);
    }
  };

  updatePhone = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { changeToken, countryCode, phone } = req.body;
      const result = await this.authSvc.updatePhone({ userId, changeToken, countryCode, phone });
      res.json(apiResponse(result, 'Phone updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateEmail = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { changeToken, email } = req.body;
      const result = await this.authSvc.updateEmail({ userId, changeToken, email });
      res.json(apiResponse(result, 'Email updated successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = AuthController;
