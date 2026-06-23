'use strict';

const { z } = require('zod');

const passwordRules = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const usernameRules = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores');

const sendOtpSchema = z.object({
  email: z.string().email('Invalid email address').transform((val) => val.toLowerCase())
})

const verifyOtpSchema = z.object({
  email: z.string().email('Invalid email address').transform((val) => val.toLowerCase()),
  otp: z.string().length(4, "Otp must contain 4 numbers only").regex(/^[0-9]+$/, "otp can contain only numbers 0-9")
})  

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  username: usernameRules,
  countryCode: z.string().regex(/^\+\d{1,4}$/, 'Invalid country code'),
  phoneNumber: z.string().regex(/^\d{7,15}$/, 'Invalid phone number'),
  dateOfBirth: z.coerce.date({ errorMap: () => ({ message: 'Invalid date of birth' }) }),
  gender: z.transform((val) => val.toLowerCase()).enum(['male', 'female', 'other'], { errorMap: () => ({ message: 'Invalid gender' }) }).optional(),
  email: z.string().transform((val) => val.toLowerCase()).email('Invalid email address'),
  password: passwordRules,
});

const loginSchema = z.object({
  email: z.string().transform((val) => val.toLowerCase()).email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').transform((val) => val.toLowerCase()),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordRules,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordRules,
});


module.exports = {
  sendOtpSchema,
  verifyOtpSchema,
  signupSchema,
  loginSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
