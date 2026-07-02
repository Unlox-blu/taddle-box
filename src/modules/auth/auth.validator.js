'use strict';

const { z } = require('zod');
const config = require('../../config/app.config')

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
  
const transformToLowerCase = (val) => typeof val === 'string' ? val.trim().toLowerCase() : val

const minAge = config.MIN_AGE_LIMIT  
const ageLimit = new Date();
ageLimit.setFullYear(ageLimit.getFullYear() - minAge);

const sendOtpToEmailSchema = z.object({
  email: z.string().email('Invalid email address').transform((val) => val.toLowerCase())
}).strict()

const verifyOtpForEmail = z.object({
  email: z.string().email('Invalid email address').transform((val) => val.toLowerCase()),
  otp: z.string().length(4, "Otp must contain 4 numbers only").regex(/^[0-9]+$/, "otp can contain only numbers 0-9")
}).strict()  

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  username: usernameRules,
  dateOfBirth: z.coerce.date({ errorMap: () => ({ message: 'Invalid date of birth' }) }).max(ageLimit, `You must be at least ${minAge} years old`),
  gender: z.preprocess(transformToLowerCase, z.enum(['male', 'female', 'other'], { errorMap: () => ({ message: 'Invalid gender' }) })),
  email: z.preprocess(transformToLowerCase, z.string().email('Invalid email address')),
  password: passwordRules,
}).strict();

const loginSchema = z.object({
  email: z.preprocess(transformToLowerCase, z.string().email('Invalid email address')),
  password: z.string().min(1, 'Password is required'),
}).strict();

const loginPinSchema = z.object({
  pin: z.string().regex(/^[0-9]{4}$/, 'Invalid app lock'),
}).strict();

const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').transform((val) => val.toLowerCase()),
}).strict();

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordRules,
}).strict();

const sendOtpToPhoneSchema = z.object({
  countryCode: z.string().regex(/^\+\d{1,4}$/, 'Invalid country code'),
  phoneNumber: z.string().regex(/^\d{7,15}$/, 'Invalid phone number'),
}).strict()

const verifyOtpForPhoneSchema = z.object({
  countryCode: z.string().regex(/^\+\d{1,4}$/, 'Invalid country code'),
  phoneNumber: z.string().regex(/^\d{7,15}$/, 'Invalid phone number'),
  otp: z.string().length(4, "Otp must contain 4 numbers only").regex(/^[0-9]+$/, "otp can contain only numbers 0-9")
}).strict()

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordRules,
}).strict();



module.exports = {
  sendOtpToEmailSchema,
  verifyOtpForEmail,
  signupSchema,
  loginSchema,
  loginPinSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  sendOtpToPhoneSchema,
  verifyOtpForPhoneSchema,
  changePasswordSchema,
};
