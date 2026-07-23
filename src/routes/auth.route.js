'use strict';

const router = require('express').Router();
const { authController } = require('../modules/auth/auth.container');
const { verifyToken } = require('../middlewares/auth.middleware');
const { otpRateLimiter } = require('../middlewares/rate-limiter.middleware');
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
  appleAuthSchema,
  appleAuthCallbackSchema,
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
);

router.post(
  '/refresh-token', 
  authController.refreshToken
);

router.post(
  '/change-password',
  verifyToken,
  validateRequest({ body: changePasswordSchema }),
  authController.changePassword
);

router.post(
  '/forgot-password',
  validateRequest({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  validateRequest({ body: resetPasswordSchema }),
  authController.resetPassword
);

// ─── Social Login Routes ──────────────────────────────────────────────────────
router.post(
  '/google',
  validateRequest({ body: googleAuthSchema }), 
  authController.googleAuth
);
router.post(
  '/apple', 
  validateRequest({ body: appleAuthSchema }),
  authController.appleAuth
);
router.post(
  '/apple/callback', 
  validateRequest({ body: appleAuthCallbackSchema }),
  authController.appleCallback
);

router.get(
  '/me', 
  verifyToken, 
  authController.getMe
);

module.exports = router;
