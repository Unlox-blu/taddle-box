'use strict';

const { z } = require('zod');


const setThemeSchema = z.object({
  theme: z.enum(['light', 'dark'], { errorMap: () => ({ message: 'Invalid theme' }) })
}).strict();

const setAppLockSchema = z.object({
  pin: z.string().regex(/^[0-9]{4}$/, 'Invalid app lock'),
}).strict();

module.exports = { setThemeSchema, setAppLockSchema };
