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
      const { email, countryCode, phone } = req.body;
      const sessionData = await this.authSvc.sendOtp ({email, countryCode, phone});

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
      
      const { user, sessionData, COOKIE_OPTS } = await this.authSvc.signUp({email, countryCode, phone, userData});

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

  appleAuth = async (req, res, next) => {
    try {
      const { identityToken, fullName } = req.body;
      const result = await this.authSvc.appleAuth(identityToken, fullName);
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
      await this.authSvc.forgotPassword({email});
      res.json(apiResponse(null, 'If that email exists, a reset link has been sent.'));
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
}

module.exports = AuthController;
