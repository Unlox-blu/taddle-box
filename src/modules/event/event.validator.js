'use strict';

const { z } = require('zod');
const { EVENT_TYPES } = require('./event.model');

const typeCheck = (val) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

const parseNumber = (val) => {
  if (typeof val === 'string') {
    const num = Number(val);
    return Number.isNaN(num) ? val : num;
  }
  return val;
};

const parseBoolean = (val) => {
  if (typeof val !== 'string') return val;

  const lower = val.toLowerCase();

  if (lower === 'true') return true;
  if (lower === 'false') return false;

  return val;
};

const baseEventSchema = {
  title: z
    .string({
      required_error: 'Title is required',
      invalid_type_error: 'Title must be a string',
    })
    .min(3, 'Title must be at least 3 characters')
    .max(200, 'Title must not exceed 200 characters'),

  description: z
    .string({
      invalid_type_error: 'Description must be a string',
    })
    .max(5000, 'Description must not exceed 5000 characters')
    .optional(),

  eventType: z.enum(EVENT_TYPES, {
    errorMap: () => ({ message: 'Invalid event type' }),
  }).default('online'),

  startTime: z
    .string({
      required_error: 'Start time is required',
      invalid_type_error: 'Start time must be a string',
    })
    .datetime('Invalid start time'),

  endTime: z
    .string({
      required_error: 'End time is required',
      invalid_type_error: 'End time must be a string',
    })
    .datetime('Invalid end time'),

  timezone: z
    .string({
      invalid_type_error: 'Timezone must be a string',
    })
    .max(60, 'Timezone must not exceed 60 characters')
    .default('Asia/Kolkata'),

  location: z.preprocess(
    typeCheck,
    z
      .record(z.unknown(), {
        invalid_type_error: 'Location must be an object',
      })
      .optional()
  ),

  isFree: z.preprocess(
    parseBoolean,
    z
      .boolean({
        invalid_type_error: 'isFree must be true or false',
      })
      .default(true)
  ),

  ticketPriceCents: z.preprocess(
    parseNumber,
    z
      .number({
        invalid_type_error: 'Ticket price must be a number',
      })
      .int('Ticket price must be a whole number')
      .min(0, 'Ticket price cannot be negative')
      .optional()
  ),

  currency: z
    .string({
      invalid_type_error: 'Currency must be a string',
    })
    .length(3, 'Currency must be a 3-letter ISO code')
    .default('INR'),

  maxAttendees: z.preprocess(
    parseNumber,
    z
      .number({
        invalid_type_error: 'Maximum attendees must be a number',
      })
      .int('Maximum attendees must be a whole number')
      .positive('Maximum attendees must be greater than 0')
      .optional()
  ),

  registrationDeadline: z
    .string({
      invalid_type_error: 'Registration deadline must be a string',
    })
    .datetime('Invalid registration deadline')
    .optional(),

  tags: z.preprocess(
    typeCheck,
    z
      .array(
        z
          .string({
            invalid_type_error: 'Each tag must be a string',
          })
          .max(50, 'Each tag must not exceed 50 characters'),
        {
          invalid_type_error: 'Tags must be an array',
        }
      )
      .max(10, 'You can add up to 10 tags')
      .default([])
  ),

  communityId: z
    .string({
      invalid_type_error: 'Community ID must be a string',
    })
    .uuid('Invalid community ID')
    .optional(),
};

const createEventSchema = z
  .object(baseEventSchema)
  .refine(
    (data) => new Date(data.endTime) > new Date(data.startTime),
    {
      message: 'End time must be after start time',
      path: ['endTime'],
    }
  )
  .refine(
    (data) => {
      if (data.isFree) return true;
      return data.ticketPriceCents != null && data.ticketPriceCents > 0;
    },
    {
      message: 'Paid events must have a ticket price greater than 0',
      path: ['ticketPriceCents'],
    }
  );

const updateEventSchema = z
  .object({
    title: baseEventSchema.title.optional(),
    description: baseEventSchema.description,
    eventType: baseEventSchema.eventType.optional(),
    startTime: baseEventSchema.startTime.optional(),
    endTime: baseEventSchema.endTime.optional(),
    timezone: baseEventSchema.timezone.optional(),
    location: baseEventSchema.location,
    isFree: z.preprocess(
      parseBoolean,
      z
        .boolean({
          invalid_type_error: 'isFree must be true or false',
        })
        .optional()
    ),
    ticketPriceCents: baseEventSchema.ticketPriceCents,
    currency: baseEventSchema.currency.optional(),
    maxAttendees: baseEventSchema.maxAttendees,
    registrationDeadline: baseEventSchema.registrationDeadline,
    tags: baseEventSchema.tags.optional(),
    communityId: baseEventSchema.communityId,
  })
  .refine(
    (data) => {
      if (!data.startTime || !data.endTime) return true;
      return new Date(data.endTime) > new Date(data.startTime);
    },
    {
      message: 'End time must be after start time',
      path: ['endTime'],
    }
  )
  .refine(
    (data) => {
      if (data.isFree === undefined || data.isFree) return true;
      return data.ticketPriceCents != null && data.ticketPriceCents > 0;
    },
    {
      message: 'Paid events must have a ticket price greater than 0',
      path: ['ticketPriceCents'],
    }
  );

const eventIdParamsSchema = z
  .object({
    eventId: z.string().uuid('Invalid event ID'),
  })
  .strict();

module.exports = {
  createEventSchema,
  updateEventSchema,
  eventIdParamsSchema,
};