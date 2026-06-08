'use strict';

const router = require('express').Router();
const { authController } = require('../container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { otpRateLimiter } = require('../middlewares/rate-limiter.middleware');
const { validate } = require('../middlewares/validator.middleware');
const {
  signupSchema, loginSchema, googleAuthSchema,
  forgotPasswordSchema, resetPasswordSchema, changePasswordSchema,
  validateEmail,
  verifyOtpSchema,
  sendOtpSchema,
} = require('../validators/auth.validator');


router.post('/verify-email/send', otpRateLimiter, validate(sendOtpSchema), authController.sendVerificationEmail)
router.post('/verify-email/verify', validate(verifyOtpSchema), authController.verifyOtp)
router.post('/signup', validate(signupSchema), authController.signup);
router.post('/login', validate(loginSchema), authController.login);
// router.post('/google', validate(googleAuthSchema), authController.googleAuth);
router.post('/logout', verifyToken, authController.logout);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);
router.get('/me', verifyToken, authController.getMe);

module.exports = router;
