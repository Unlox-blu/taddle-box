'use strict';

const { z } = require('zod');
const config = require('../../config/app.config')


const minAge = config.MIN_AGE_LIMIT  
const ageLimit = new Date();
ageLimit.setFullYear(ageLimit.getFullYear() - minAge);


const passwordRules = z
  .string('Password must be string')
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must not exceed 100 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const usernameRules = z
  .string('Username must be string')
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores');
  
const transformToLowerCase = (val) => typeof val === 'string' ? val.trim().toLowerCase() : val

const typeCheck = (val) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.values(val);
    }
    return val;
  }


const usernameSchema = z.object({
  username: usernameRules,
}).strict()

const emailSchema = z.object({
  email: z.preprocess(transformToLowerCase, z.string().email('Invalid email address')),
}).strict()

const phoneSchema = z.object({
  countryCode: z.string().min(1, "Phone number is required").regex(/^\+[0-9]{1,4}$/, "Country code contain digits followed by + only"),
  phone: z.string().min(3, "Phone number is required").regex(/^[0-9]{3,15}$/, "Phone number must contain digits only minimum 3 digits"),
}).strict()



const sendOtpSchema = z.object({
  email: z.preprocess(transformToLowerCase, z.string().email('Invalid email address')),
  countryCode: z.string().min(1, "Phone number is required").regex(/^\+[0-9]{1,4}$/, "Country code contain digits followed by + only"),
  phone: z.string().min(3, "Phone number is required").regex(/^[0-9]{3,15}$/, "Phone number must contain digits only minimum 3 digits"),
  socialToken: z.string().optional(),
}).strict()

const verifyOtp = z.object({
  emailOtp: z.string().length(6, "Otp must contain 6 numbers only").regex(/^[0-9]+$/, "otp can contain only numbers 0-9"),
  phoneOtp: z.string().length(6, "Otp must contain 6 numbers only").regex(/^[0-9]+$/, "otp can contain only numbers 0-9")
}).strict() 

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  username: usernameRules,
  email: z.preprocess(transformToLowerCase, z.string().email('Invalid email address')),
  countryCode: z.string().min(1, "Phone number is required").regex(/^\+[0-9]{1,4}$/, "Country code contain digits followed by + only"),
  phone: z.string().min(3, "Phone number is required").regex(/^[0-9]{3,15}$/, "Phone number must contain digits only minimum 3 digits"),
  password: passwordRules,
  dateOfBirth: z.coerce.date({ errorMap: () => ({ message: 'Invalid date of birth' }) }).max(ageLimit, `You must be at least ${minAge} years old`),
  location: z.string().min(1, "Location is required"),
  latitude: z.coerce.number({ required_error: 'Latitude is required' }),
  longitude: z.coerce.number({ required_error: 'Longitude is required' }),
  gender: z.enum(['male', 'female', 'other'], { required_error: 'Gender is required' }),
  occupation: z.enum(['Student', 'Working Professional', 'Self-employed / Freelancer', 'Other'], { required_error: 'Occupation Type is required' }),
  organization: z.string().optional(),
  interests: z.preprocess(typeCheck, z.array(z.string()).min(3, "Please select at least 3 interests").default([])),
  socialToken: z.string().optional(),
}).strict();

const loginSchema = z.object({
  email: z.preprocess(transformToLowerCase, z.string().email('Invalid email address')),
  password: z.string('Password must be string').min(1, 'Password is required'),
}).strict();

const loginPinSchema = z.object({
  pin: z.string().regex(/^[0-9]{4}$/, 'PIN must be exactly 4 digits').optional(),
  currentPin: z.string().regex(/^[0-9]{4}$/, 'Current PIN must be exactly 4 digits').optional(),
  newPin: z.string().regex(/^[0-9]{4}$/, 'New PIN must be exactly 4 digits').optional(),
}).strict();

const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordRules,
}).strict();

const forgotPasswordSchema = z.object({
  email: z.preprocess(transformToLowerCase, z.string().email('Invalid email address')),
}).strict();

const resetPasswordSchema = z.object({
  token: z.string('Token must be string').min(1, 'Reset token is required'),
  password: passwordRules,
}).strict();






module.exports = {
  usernameSchema,
  emailSchema,
  phoneSchema,
  sendOtpSchema,
  verifyOtp,
  signupSchema,
  loginSchema,
  loginPinSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
};
