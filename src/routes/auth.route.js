'use strict';

const router = require('express').Router();
const { authController } = require('../modules/auth/auth.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { otpRateLimiter } = require('../middlewares/rate-limiter.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const {
  signupSchema, loginSchema, googleAuthSchema,
  forgotPasswordSchema, resetPasswordSchema, changePasswordSchema,
  validateEmail,
  verifyOtpForEmail,
  sendOtpToEmailSchema,
  sendOtpToPhoneSchema,
  verifyOtpForPhoneSchema,
  loginPinSchema,
} = require('../modules/auth/auth.validator');


router.post('/send-otp-email',        otpRateLimiter, validateRequest({body: sendOtpToEmailSchema}),  authController.sendOtpToEmail)
router.post('/verify-otp-email',      validateRequest({body: verifyOtpForEmail}),                authController.verifyOtpForEmail)
router.post('/username',                                                           authController.usernameAvailable )
router.post('/signup',                validateRequest({body: signupSchema}),                   authController.signUp);
router.post('/login',                 validateRequest({body: loginSchema}),                    authController.login);
router.post('/verify-loginpin',       verifyToken,     validateRequest({body: loginPinSchema}),       authController.verifyLoginPin);

router.post('/send-otp-phone',  otpRateLimiter,  verifyToken, validateRequest({body: sendOtpToPhoneSchema}),    authController.sendOtpToPhone)
router.post('/verify-otp-phone',        verifyToken, validateRequest({body: verifyOtpForPhoneSchema}),    authController.verifyAndAddPhone)
// router.post('/google',       validateRequest({body: googleAuthSchema}),               authController.googleAuth);
router.post('/logout',          verifyToken,                              authController.logout);
router.post('/refresh-token',                                             authController.refreshToken);
router.post('/change-password', verifyToken, validateRequest({body: changePasswordSchema}), authController.changePassword);
router.post('/forgot-password', validateRequest({body: forgotPasswordSchema}),           authController.forgotPassword);
router.post('/reset-password',  validateRequest({body: resetPasswordSchema}),            authController.resetPassword);
router.get('/me',               verifyToken,                              authController.getMe);

module.exports = router;
