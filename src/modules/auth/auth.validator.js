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
  password: z.string().optional(),
  dateOfBirth: z.coerce.date({ errorMap: () => ({ message: 'Invalid date of birth' }) }).max(ageLimit, `You must be at least ${minAge} years old`),
  location: z.string().min(1, "Location is required"),
  latitude: z.coerce.number({ required_error: 'Latitude is required' }),
  longitude: z.coerce.number({ required_error: 'Longitude is required' }),
  gender: z.enum(['male', 'female', 'other'], { required_error: 'Gender is required' }),
  occupation: z.enum(['Student', 'Working Professional', 'Self-employed / Freelancer', 'Other'], { required_error: 'Occupation Type is required' }),
  organization: z.string().optional(),
  interests: z.preprocess(typeCheck, z.array(z.string()).min(3, "Please select at least 3 interests").default([])),
  referralCode: z.string().trim().min(3).max(12).optional(),
  socialToken: z.string().optional(),
  deviceId: z.string().optional(),
  pushToken: z.string().optional(),
  pushProvider: z.string().optional(),
  platform: z.string().optional(),
}).strict().superRefine((data, ctx) => {
  if (!data.socialToken) {
    const result = passwordRules.safeParse(data.password);
    if (!result.success) {
      result.error.issues.forEach(issue => {
        ctx.addIssue({ ...issue, path: ['password'] });
      });
    }
  }
});

const loginIdentifierSchema = z.preprocess(transformToLowerCase, z.string().min(1, 'Email, Phone or Username is required'));

const loginSchema = z.object({
  identifier: loginIdentifierSchema.optional(),
  email: loginIdentifierSchema.optional(),
  password: z.string('Password must be string').min(1, 'Password is required'),
  deviceId: z.string().optional(),
  pushToken: z.string().optional(),
  pushProvider: z.string().optional(),
  platform: z.string().optional(),
}).strict().superRefine((data, ctx) => {
  if (!data.identifier && !data.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['identifier'],
      message: 'Email, Phone or Username is required',
    });
  }
});

const loginPinSchema = z.object({
  pin: z.string().regex(/^[0-9]{4}$/, 'PIN must be exactly 4 digits').optional(),
  currentPin: z.string().regex(/^[0-9]{4}$/, 'Current PIN must be exactly 4 digits').optional(),
  newPin: z.string().regex(/^[0-9]{4}$/, 'New PIN must be exactly 4 digits').optional(),
}).strict();

const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
  deviceId: z.string().optional(),
  pushToken: z.string().optional(),
  pushProvider: z.string().optional(),
  platform: z.string().optional(),
}).strict();

const appleAuthSchema = z.object({
  identityToken: z.string().min(1, 'Google ID token is required'),
  fullName: z.string().min(1, 'Full Name must have at least 1 character').optional(),
  deviceId: z.string().optional(),
  pushToken: z.string().optional(),
  pushProvider: z.string().optional(),
  platform: z.string().optional(),
}).strict();

const appleAuthCallbackSchema = z.object({
  id_token: z.string().min(1, 'Google ID token is required'),
  user: z.string().min(1, 'User must have at least 1 character').optional(),
  state: z.string().min(1, 'State must have at least 1 character').optional(),
}).strict();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordRules,
}).strict();

const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, 'Email, Phone or Username is required'),
}).strict();

const verifyResetPasswordOtpSchema = z.object({
  email: z.preprocess(transformToLowerCase, z.string().email('Invalid email address')),
  emailOtp: z.string().length(6, 'Email OTP must be 6 digits').regex(/^[0-9]+$/, 'Email OTP must be numeric'),
  phoneOtp: z.string().length(6, 'Phone OTP must be 6 digits').regex(/^[0-9]+$/, 'Phone OTP must be numeric').optional(),
}).strict();

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordRules,
}).strict();

const verifyPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  email: z.preprocess(transformToLowerCase, z.string().email('Invalid email address')).optional(),
  countryCode: z.string().optional(),
  phone: z.string().optional(),
}).strict();

const requestChangePasswordOtpSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  email: z.preprocess(transformToLowerCase, z.string().email('Invalid email address')),
  countryCode: z.string().optional(),
  phone: z.string().optional(),
}).strict();

const verifyChangePasswordOtpSchema = z.object({
  emailOtp: z.string().length(6, 'Email OTP must be 6 digits').regex(/^[0-9]+$/, 'Email OTP must be numeric'),
  phoneOtp: z.string().length(6, 'Phone OTP must be 6 digits').regex(/^[0-9]+$/, 'Phone OTP must be numeric').optional(),
}).strict();

const confirmChangePasswordSchema = z.object({
  changeToken: z.string().min(1, 'Token is required'),
  newPassword: passwordRules,
}).strict();

const requestChangePhoneOtpSchema = z.object({
  newCountryCode: z.string().min(1).regex(/^\+[0-9]{1,4}$/),
  newPhone: z.string().min(3).regex(/^[0-9]{3,15}$/),
}).strict();

const verifyChangePhoneOtpSchema = z.object({
  emailOtp: z.string().length(6, 'Email OTP must be 6 digits').regex(/^[0-9]+$/, 'Email OTP must be numeric'),
  phoneOtp: z.string().length(6, 'Phone OTP must be 6 digits').regex(/^[0-9]+$/, 'Phone OTP must be numeric'),
}).strict();

const requestChangeEmailOtpSchema = z.object({
  newEmail: z.preprocess(transformToLowerCase, z.string().email()),
}).strict();

const verifyChangeEmailOtpSchema = z.object({
  emailOtp: z.string().length(6, 'Email OTP must be 6 digits').regex(/^[0-9]+$/, 'Email OTP must be numeric'),
  phoneOtp: z.string().length(6, 'Phone OTP must be 6 digits').regex(/^[0-9]+$/, 'Phone OTP must be numeric').optional(), // Optional if they don't have a phone linked
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
  appleAuthSchema,
  appleAuthCallbackSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyPasswordSchema,
  requestChangePhoneOtpSchema,
  verifyChangePhoneOtpSchema,
  requestChangeEmailOtpSchema,
  verifyChangeEmailOtpSchema,
  requestChangePasswordOtpSchema,
  verifyChangePasswordOtpSchema,
  verifyResetPasswordOtpSchema,
  confirmChangePasswordSchema,
};
