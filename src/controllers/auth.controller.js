'use strict';

const { apiResponse } = require('../utils/response.util');

class AuthController {
  constructor({ authService }) {
    this.authSvc = authService;
  }

  signup = async (req, res, next) => {
    try {
      const { user } = await this.authSvc.signup(req.body);
      res.status(201).json(apiResponse(user, 'Account created. Please verify your email.'));
    } catch (err) { next(err); }
  };

  login = async (req, res, next) => {
    try {
      const result = await this.authSvc.login(req.body);
      res.cookie('access_token', result.accessToken, { ...result.cookieOpts, maxAge: 15 * 60 * 1000 });
      res.cookie('refresh_token', result.refreshToken, { ...result.cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
      res.json(apiResponse({ userId: result.userId, role: result.role }, 'Logged in successfully'));
    } catch (err) { next(err); }
  };

  googleAuth = async (req, res, next) => {
    try {
      const result = await this.authSvc.googleAuth(req.body.idToken);
      res.cookie('access_token', result.accessToken, { ...result.cookieOpts, maxAge: 15 * 60 * 1000 });
      res.cookie('refresh_token', result.refreshToken, { ...result.cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
      res.json(apiResponse({ userId: result.userId, role: result.role }, 'Google auth successful'));
    } catch (err) { next(err); }
  };

  logout = async (req, res, next) => {
    try {
      await this.authSvc.logout(req.userId);
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      res.json(apiResponse(null, 'Logged out successfully'));
    } catch (err) { next(err); }
  };

  refreshToken = async (req, res, next) => {
    try {
      const result = await this.authSvc.refreshToken(req.cookies.refresh_token);
      res.cookie('access_token', result.accessToken, { ...result.cookieOpts, maxAge: 15 * 60 * 1000 });
      res.cookie('refresh_token', result.refreshToken, { ...result.cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
      res.json(apiResponse(null, 'Token refreshed'));
    } catch (err) { next(err); }
  };

  forgotPassword = async (req, res, next) => {
    try {
      await this.authSvc.forgotPassword(req.body.email);
      res.json(apiResponse(null, 'If that email exists, a reset link has been sent.'));
    } catch (err) { next(err); }
  };

  resetPassword = async (req, res, next) => {
    try {
      await this.authSvc.resetPassword(req.body.token, req.body.password);
      res.json(apiResponse(null, 'Password reset successfully'));
    } catch (err) { next(err); }
  };

  verifyEmail = async (req, res, next) => {
    try {
      await this.authSvc.verifyEmail(req.params.token);
      res.json(apiResponse(null, 'Email verified successfully'));
    } catch (err) { next(err); }
  };

  getMe = async (req, res, next) => {
    try {
      const user = await this.authSvc.getMe(req.userId);
      res.json(apiResponse(user));
    } catch (err) { next(err); }
  };
}

module.exports = AuthController;
