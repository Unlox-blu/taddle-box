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
  verifyOtpForEmail,
  sendOtpToEmailSchema,
  sendOtpToPhoneSchema,
  verifyOtpForPhoneSchema,
} = require('../validators/auth.validator');


router.post('/send-otp-email',        otpRateLimiter, validate(sendOtpToEmailSchema),  authController.sendOtpToEmail)
router.post('/verify-otp-email',      validate(verifyOtpForEmail),                authController.verifyOtpForEmail)
router.post('/signup',          validate(signupSchema),                   authController.signUp);
router.post('/login',           validate(loginSchema),                    authController.login);

router.post('/send-otp-phone',  otpRateLimiter,  verifyToken, validate(sendOtpToPhoneSchema),    authController.sendOtpToPhone)
router.post('/verify-otp-phone',        verifyToken, validate(verifyOtpForPhoneSchema),    authController.verifyAndAadPhone)
// router.post('/google',       validate(googleAuthSchema),               authController.googleAuth);
router.post('/logout',          verifyToken,                              authController.logout);
router.post('/refresh-token',                                             authController.refreshToken);
router.post('/change-password', verifyToken, validate(changePasswordSchema), authController.changePassword);
router.post('/forgot-password', validate(forgotPasswordSchema),           authController.forgotPassword);
router.post('/reset-password',  validate(resetPasswordSchema),            authController.resetPassword);
router.get('/me',               verifyToken,                              authController.getMe);

module.exports = router;
