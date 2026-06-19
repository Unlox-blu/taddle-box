'use strict';

const { createError } = require('../utils/error.util');
const EventModel = require('../models/event.model');

class EventService {
  constructor({ eventRepository, walletRepository, paymentIntegration, notificationService }) {
    this.eventRepo = eventRepository;
    this.walletRepo = walletRepository;
    this.paymentSvc = paymentIntegration;
    this.notifSvc = notificationService;
  }

  

  async create({userId: organizerId, body: data}) {
    try {
      const { communityId } = data;
      if (communityId) {
        // check validation
      }
      const event = await this.eventRepo.create({ ...data, organizerId });
      return EventModel.format(event);
    } catch (error) {
      throw error;
    }
  }

  async getById({eventId}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);
      return EventModel.format(event);
    } catch (error) {
      throw error;
    }
  }

  async update({eventId, userId, body: data}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);
      if (event.organizer_id !== userId)
        throw createError('Not authorized to update this event', 403);

      const { communityId } = data;
      if (communityId) {
        // check validation
      }

      const updated = await this.eventRepo.update(eventId, data);
      return EventModel.format(updated);
    } catch (error) {
      throw error;
    }
  }

  async remove({eventId, userId}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);
      if (event.organizer_id !== userId)
        throw createError('Not authorized to delete this event', 403);
      await this.eventRepo.softDelete(eventId);
    } catch (error) {
      throw error;
    }
  }

  async register({eventId, userId}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);
      if (event.status !== 'upcoming') throw createError('Event is not open for registration', 400);

      const existing = await this.eventRepo.getAttendee(eventId, userId);
      if (existing) throw createError('Already registered for this event', 409);

      if (event.max_attendees && event.attendee_count >= event.max_attendees) {
        await this.eventRepo.addAttendee(eventId, userId, { status: 'waitlisted' });
        return { status: 'waitlisted', message: 'Added to waitlist' };
      }

      if (event.is_free) {
        await this.eventRepo.addAttendee(eventId, userId, { status: 'registered' });
        await this.eventRepo.incrementAttendeeCount(eventId);
        return { status: 'registered', message: 'Registered successfully' };
      }

      const receipt = `evt_${eventId}_${userId}`.slice(0, 40);
      // const order = await this.paymentSvc.createOrder(event.ticket_price_cents, event.currency, receipt);
      // await this.eventRepo.addAttendee(eventId, userId, { status: 'registered', razorpayOrderId: order.id });

      return {
        status: 'payment_required',
        // orderId: order.id,
        // amount: order.amount,
        // currency: order.currency,
        // keyId: process.env.RAZORPAY_KEY_ID,
      };
    } catch (error) {
      throw error;
    }
  }

  async cancelRegistration({eventId, userId}) {
    try {
      const isAttendee = await this.eventRepo.getAttendee(eventId, userId);
      if (!isAttendee || isAttendee.status === 'cancelled')
        throw createError('You already cancelled', 409);

      await this.eventRepo.updateAttendeeStatus(eventId, userId, 'cancelled');
      await this.eventRepo.decrementAttendeeCount(eventId);
    } catch (error) {
      throw error;
    }
  }

  async getAttendees({userId, userRole, eventId, limit, offset}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);

      if (event.organizer_id !== userId && userRole === 'user')
        throw createError('You are not authorized', 403);

      return this.eventRepo.getAttendees(eventId, limit, offset);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = EventService;
