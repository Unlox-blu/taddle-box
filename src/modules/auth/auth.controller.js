'use strict';

const { apiResponse } = require('../../utils/response.util');
const config = require('../../config/app.config')

class AuthController {
  constructor({ authService }) {
    this.authSvc = authService;
  }

  sendOtpToEmail = async (req, res, next) => {
    try {
      const { email } = req.body;
      await this.authSvc.sendOtpToEmail({email});
      res.json(apiResponse(null, 'Otp send successfully'));
    } catch (error) {
      next(error);
    }
  };

  verifyOtpForEmail = async (req, res, next) => {
    try {
      const { email, otp } = req.body;
      await this.authSvc.verifyOtpForEmail({email, otp});
      res.json(apiResponse(null, 'Email verified successfully'));
    } catch (error) {
      next(error);
    }
  };

  usernameAvailable = async (req, res, next) => {
    try {
      const {username} = req.body
      const usernameToken = req.cookie?.user_name_token || null
      const token = await this.authSvc.usernameAvailable({username, usernameToken})

      res.cookie('user_name_token', token, {
        ...token.cookieOpts,
        // maxAge: config.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS 
        maxAge: 6 * 5 
      });
      res.json(apiResponse(null, 'Username is available'));

    } catch (error) {
      next(error)
    }
  }

  signUp = async (req, res, next) => {
    try {
      const userData = req.body;
      const usernameToken = req.cookie?.user_name_token || null
      const { user } = await this.authSvc.signUp({userData, usernameToken});
      res.status(201).json(apiResponse(user, 'Account created.'));
    } catch (error) {
      next(error);
    }
  };

  login = async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await this.authSvc.login({ email, password });

      res.cookie('access_token', result.accessToken, {
        ...result.cookieOpts,
        maxAge: config.ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.cookie('refresh_token', result.refreshToken, {
        ...result.cookieOpts,
        maxAge: config.REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS
      });
      res.json(apiResponse({ userId: result.userId, role: result.role }, 'Logged in successfully'));
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


  sendOtpToPhone = async (req, res, next) => {
    try {
      const { countryCode, phoneNumber } = req.body;
      await this.authSvc.sendOtpToPhone({countryCode, phoneNumber});
      res.json(apiResponse(null, 'Otp send successfully'));
    } catch (error) {
      next(error);
    }
  };

  verifyAndAddPhone = async (req, res, next) => {
    try {
      const userId = req.userId 
      const {otp, countryCode, phoneNumber} = res.body
      await this.authSvc.verifyAndAddPhone({userId, otp, countryCode, phoneNumber})
      res.json(apiResponse(null, 'Phone added successfully'));
    } catch (error) {
      next(error)
    }
  }

  // googleAuth = async (req, res, next) => {
  //   try {
  //     const result = await this.authSvc.googleAuth(req.body.idToken);
  //     res.cookie('access_token', result.accessToken, {
  //       ...result.cookieOpts,
  //       maxAge: 15 * 60 * 1000,
  //     });
  //     res.cookie('refresh_token', result.refreshToken, {
  //       ...result.cookieOpts,
  //       maxAge: 7 * 24 * 60 * 60 * 1000,
  //     });
  //     res.json(apiResponse({ userId: result.userId, role: result.role }, 'Google auth successful'));
  //   } catch (error) {
  //     next(error);
  //   }
  // };

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
