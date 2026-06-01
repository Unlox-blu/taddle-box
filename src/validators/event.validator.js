'use strict';

const { z } = require('zod');
const { EVENT_TYPES } = require('../models/event.model');

const createEventSchema = z.object({
    title: z.string().min(3).max(200),
    description: z.string().max(5000).optional(),
    eventType: z.enum(EVENT_TYPES).default('online'),
    startTime: z.string().datetime('Invalid start time'),
    endTime: z.string().datetime('Invalid end time'),
    timezone: z.string().max(60).default('Asia/Kolkata'),
    location: z.record(z.unknown()).optional(),
    isFree: z.boolean().default(true),
    ticketPriceCents: z.number().int().min(0).optional(),
    currency: z.string().length(3).default('INR'),
    maxAttendees: z.number().int().positive().optional(),
    registrationDeadline: z.string().datetime().optional(),
    tags: z.array(z.string().max(50)).max(10).default([]),
    communityId: z.string().uuid().optional(),
  })
  .refine((d) => new Date(d.endTime) > new Date(d.startTime), {
    message: 'End time must be after start time',
    path: ['endTime'],
  })
  .refine((d) => d.isFree || (d.ticketPriceCents && d.ticketPriceCents > 0), {
    message: 'Paid events must have a ticket price greater than 0',
    path: ['ticketPriceCents'],
  });

// const updateEventSchema = createEventSchema.partial();

const updateEventSchema = z.object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().max(5000).optional().optional(),
    eventType: z.enum(EVENT_TYPES).default('online').optional(),
    startTime: z.string().datetime('Invalid start time').optional(),
    endTime: z.string().datetime('Invalid end time').optional(),
    timezone: z.string().max(60).default('Asia/Kolkata').optional(),
    location: z.record(z.unknown()).optional().optional(),
    isFree: z.boolean().default(true).optional(),
    ticketPriceCents: z.number().int().min(0).optional().optional(),
    currency: z.string().length(3).default('INR').optional(),
    maxAttendees: z.number().int().positive().optional().optional(),
    registrationDeadline: z.string().datetime().optional().optional(),
    tags: z.array(z.string().max(50)).max(10).default([]).optional(),
    communityId: z.string().uuid().optional().optional(),
  })
  .refine((d) => new Date(d.endTime) > new Date(d.startTime), {
    message: 'End time must be after start time',
    path: ['endTime'],
  })
  .refine((d) => d.isFree || (d.ticketPriceCents && d.ticketPriceCents > 0), {
    message: 'Paid events must have a ticket price greater than 0',
    path: ['ticketPriceCents'],
  });

module.exports = { createEventSchema, updateEventSchema };
