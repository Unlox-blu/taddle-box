'use strict';

const { apiResponse } = require('../utils/response.util');

class AuthController {
  constructor({ authService }) {
    this.authSvc = authService;
  }

  sendVerificationEmail = async (req, res, next) => {
    try {
      const { email } = req.body;
      await this.authSvc.sendVerificationEmail(email);
      res.json(apiResponse(null, 'Otp send successfully'));
    } catch (err) {
      next(err);
    }
  };

  verifyOtp = async (req, res, next) => {
    try {
      const { email, otp } = req.body;
      await this.authSvc.verifyOtp(email, otp);
      res.json(apiResponse(null, 'Email verified successfully'));
    } catch (err) {
      next(err);
    }
  };

  signup = async (req, res, next) => {
    try {
      const { name, username, email, password } = req.body;
      const { user } = await this.authSvc.signup({ name, username, email, password });
      res.status(201).json(apiResponse(user, 'Account created.'));
    } catch (err) {
      next(err);
    }
  };

  login = async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await this.authSvc.login({ email, password });

      res.cookie('access_token', result.accessToken, {
        ...result.cookieOpts,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie('refresh_token', result.refreshToken, {
        ...result.cookieOpts,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json(apiResponse({ userId: result.userId, role: result.role }, 'Logged in successfully'));
    } catch (err) {
      next(err);
    }
  };

  googleAuth = async (req, res, next) => {
    try {
      const result = await this.authSvc.googleAuth(req.body.idToken);
      res.cookie('access_token', result.accessToken, {
        ...result.cookieOpts,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie('refresh_token', result.refreshToken, {
        ...result.cookieOpts,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json(apiResponse({ userId: result.userId, role: result.role }, 'Google auth successful'));
    } catch (err) {
      next(err);
    }
  };

  logout = async (req, res, next) => {
    try {
      const userId = req.userId;
      await this.authSvc.logout(userId);
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      res.json(apiResponse(null, 'Logged out successfully'));
    } catch (err) {
      next(err);
    }
  };

  refreshToken = async (req, res, next) => {
    try {
      const { refresh_token } = req.cookies;
      const result = await this.authSvc.refreshToken(refresh_token);
      res.cookie('access_token', result.accessToken, {
        ...result.cookieOpts,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie('refresh_token', result.refreshToken, {
        ...result.cookieOpts,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json(apiResponse(null, 'Token refreshed'));
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (req, res, next) => {
    try {
      const { email } = req.body;
      await this.authSvc.forgotPassword(email);
      res.json(apiResponse(null, 'If that email exists, a reset link has been sent.'));
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req, res, next) => {
    try {
      const { token, password } = req.body;
      await this.authSvc.resetPassword(token, password);
      res.json(apiResponse(null, 'Password reset successfully'));
    } catch (err) {
      next(err);
    }
  };

  getMe = async (req, res, next) => {
    try {
      const userId = req.userId;
      const user = await this.authSvc.getMe(userId);
      res.json(apiResponse({ user }, 'Profile get successfully!'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = AuthController;
