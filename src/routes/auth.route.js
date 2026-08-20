'use strict';

const router = require('express').Router();
const { authController } = require('../modules/auth/auth.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { otpRateLimiter, otpTargetRateLimiter, authRateLimiter } = require('../middlewares/rate-limiter.middleware');
const { validateRequest } = require('../middlewares/validator.middleware');
const {
  usernameSchema,
  emailSchema,
  phoneSchema,
  sendOtpSchema,
  verifyOtp,
  signupSchema,
  loginSchema,
  loginPinSchema,
  googleAuthSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyPasswordSchema,
  requestChangePhoneOtpSchema,
  verifyChangePhoneOtpSchema,
  requestChangeEmailOtpSchema,
  verifyChangeEmailOtpSchema,
  requestChangePasswordOtpSchema,
  verifyChangePasswordOtpSchema,
  verifyResetPasswordOtpSchema,
  confirmChangePasswordSchema,
} = require('../modules/auth/auth.validator');
const { verifyOtpToken } = require('../middlewares/verification.middleware');


router.post(
  '/username', 
  validateRequest({ body: usernameSchema }),
  authController.usernameAvailable
);

router.post(
  '/email', 
  validateRequest({ body: emailSchema }),
  authController.isEmailExist
);

router.post(
  '/phone', 
  validateRequest({ body: phoneSchema }),
  authController.isPhoneExist
);


router.post(
  '/send-otp',
  otpRateLimiter,
  otpTargetRateLimiter,
  validateRequest({ body: sendOtpSchema }),
  authController.sendOtp
);

router.post(
  '/verify-otp',
  verifyOtpToken,
  validateRequest({ body: verifyOtp }),
  authController.verifyOtp
);


router.post(
  '/signup', 
  verifyOtpToken,
  validateRequest({ body: signupSchema }), 
  authController.signUp
);

router.post(
  '/login', 
  validateRequest({ body: loginSchema }), 
  authController.login
);

router.post(
  '/verify-loginpin',
  verifyToken,
  validateRequest({ body: loginPinSchema }),
  authController.verifyLoginPin
);

router.post(
  '/set-loginpin',
  verifyToken,
  validateRequest({ body: loginPinSchema }),
  authController.setLoginPin
);

router.put(
  '/update-loginpin',
  verifyToken,
  validateRequest({ body: loginPinSchema }),
  authController.updateLoginPin
);

router.delete(
  '/remove-loginpin',
  verifyToken,
  validateRequest({ body: loginPinSchema }),
  authController.removeLoginPin
);

// router.post('/google',       validateRequest({body: googleAuthSchema}),               authController.googleAuth);

router.post(
  '/logout', 
  verifyToken, 
  authController.logout
);router.post('/refresh-token', 
  authController.refreshToken
);

router.post('/validate-sessions', 
  authController.validateSessions
);

router.post(
  '/change-password',
  verifyToken,
  validateRequest({ body: requestChangePasswordOtpSchema }),
  authController.changePassword
);

router.post(
  '/verify-change-password-otp',
  verifyToken,
  validateRequest({ body: verifyChangePasswordOtpSchema }),
  authController.verifyChangePasswordOtp
);

router.post(
  '/confirm-change-password',
  verifyToken,
  validateRequest({ body: confirmChangePasswordSchema }),
  authController.confirmChangePassword
);

router.post(
  '/forgot-password',
  validateRequest({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

router.post(
  '/verify-reset-password-otp',
  authRateLimiter,
  validateRequest({ body: verifyResetPasswordOtpSchema }),
  authController.verifyResetPasswordOtp
);

router.post(
  '/reset-password',
  validateRequest({ body: resetPasswordSchema }),
  authController.resetPassword
);

router.post('/verify-password', verifyToken, validateRequest({ body: verifyPasswordSchema }), authController.verifyPassword);

router.post('/change-phone/request-otp', verifyToken, validateRequest({ body: requestChangePhoneOtpSchema }), authController.requestChangePhoneOtp);
router.patch('/change-phone/verify-update', verifyToken, validateRequest({ body: verifyChangePhoneOtpSchema }), authController.verifyChangePhoneOtp);

router.post('/change-email/request-otp', verifyToken, validateRequest({ body: requestChangeEmailOtpSchema }), authController.requestChangeEmailOtp);
router.patch('/change-email/verify-update', verifyToken, validateRequest({ body: verifyChangeEmailOtpSchema }), authController.verifyChangeEmailOtp);

// ─── Social Login Routes ──────────────────────────────────────────────────────
router.post('/google', authController.googleAuth);
router.post('/google/callback', authController.googleCallback);
router.post('/apple', authController.appleAuth);
router.post('/apple/callback', authController.appleCallback);

router.get(
  '/me', 
  verifyToken, 
  authController.getMe
);

module.exports = router;
