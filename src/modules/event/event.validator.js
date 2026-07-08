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
  }

const parseNumber  = (val) => {
  if (typeof val === 'string') {
      try {
        const num = Number(val);
        return Number.isNaN(num) ? val : num;
      } catch {
        return val;
      }
    }
    return val;
}  

const parseBoolean = (val) => {
  if (typeof val !== 'string') return val;

  const lower = val.toLowerCase();
  if (lower.toLowerCase() === 'true') return true;
  if (lower.toLowerCase() === 'false') return false;

  return val;
};

const createEventSchema = z.object({
    title: z.string().min(3).max(200),
    description: z.string().max(5000).optional(),
    eventType: z.enum(EVENT_TYPES).default('online'),
    startTime: z.string().datetime('Invalid start time'),
    endTime: z.string().datetime('Invalid end time'),
    timezone: z.string().max(60).default('Asia/Kolkata'),
    location: z.preprocess(typeCheck, z.record(z.unknown()).optional()),
    isFree: z.preprocess(parseBoolean, z.boolean().default(true)),
    ticketPriceCents: z.preprocess(parseNumber , z.number().int().min(0).optional()),
    currency: z.string().length(3).default('INR'),
    maxAttendees: z.preprocess(parseNumber , z.number().int().positive().optional()),
    registrationDeadline: z.string().datetime().optional(),
    tags: z.preprocess(typeCheck ,z.array(z.string().max(50)).max(10).default([])),
    communityId: z.string().uuid().optional(),
  })
  .refine((d) => {
    return new Date(d.endTime) > new Date(d.startTime)
  }, {
    message: 'End time must be after start time',
    path: ['endTime'],
  })
  .refine((d) => {
    if (d.isFree === undefined || d.isFree) return true;

    return d.ticketPriceCents != null && d.ticketPriceCents > 0;
  }, {
    message: 'Paid events must have a ticket price greater than 0',
    path: ['ticketPriceCents'],
  })

// const updateEventSchema = createEventSchema.partial();

const updateEventSchema = z.object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().max(5000).optional(),
    eventType: z.enum(EVENT_TYPES).default('online').optional(),
    startTime: z.string().datetime('Invalid start time').optional(),
    endTime: z.string().datetime('Invalid end time').optional(),
    timezone: z.string().max(60).default('Asia/Kolkata').optional(),
    location: z.preprocess(typeCheck, z.record(z.unknown()).optional()),
    isFree: z.preprocess(parseBoolean, z.boolean().default(true).optional()),
    ticketPriceCents: z.preprocess(parseNumber , z.number().int().min(0).optional()),
    currency: z.string().length(3).default('INR').optional(),
    maxAttendees: z.preprocess(parseNumber , z.number().int().positive().optional()),
    registrationDeadline: z.string().datetime().optional(),
    tags: z.preprocess(typeCheck ,z.array(z.string().max(50)).max(10).default([])).optional(),
    communityId: z.string().uuid().optional(),
  })
  .refine((d) => {
    return new Date(d.endTime) > new Date(d.startTime)
  }, {
    message: 'End time must be after start time',
    path: ['endTime'],
  })
  .refine((d) => {
    if (d.isFree === undefined || d.isFree) return true;

    return d.ticketPriceCents != null && d.ticketPriceCents > 0;
  }, {
    message: 'Paid events must have a ticket price greater than 0',
    path: ['ticketPriceCents'],
  })

  const eventIdParamsSchema = z.object({
    eventId: z.string().uuid({ message: "Invalid eventId format" })
  }).strict();

module.exports = { createEventSchema, updateEventSchema, eventIdParamsSchema };
