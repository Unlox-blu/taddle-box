'use strict';

const { createError } = require('../../utils/error.util');
const config  = require('../../config/app.config');
const { generateEventInvite } = require('../../integrations/calendar/calendar.service');
const { addJob } = require('../../jobs/queues/job.queue');

class EventService {
  constructor({ eventRepository, walletRepository, userRepository, saveRepository, xpService }) {
    this.eventRepo = eventRepository;
    this.walletRepo = walletRepository;
    this.userRepo = userRepository;
    this.saveRepo = saveRepository;
    this.xpSvc = xpService || null;
  }

  async discover({ query, filter, limit, offset, userId, scope }) {
    try {
      const { event, total } = await this.eventRepo.search(query, filter, limit, offset, userId, scope);
      return { events: event, total };
    } catch (error) {
      throw error;
    }
  }

  async getById({eventId}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);
      return event;
    } catch (error) {
      throw error;
    }
  }

  async register({eventId, userId}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);

      if (event.status !== 'upcoming') 
        throw createError("Event registration is closed", 400);

      const existing = await this.eventRepo.getAttendee(eventId, userId);
      if (existing && existing.status !== 'cancelled') throw createError("Already registered for this event", 409);
      
      const status = (!event.maxAttendees || event.attendeeCount >= event.maxAttendees) ? 'registered' : 'waitlisted'

      if (event.isFree) { 
        await this.eventRepo.addAttendee(eventId, userId, { status: status });
        await this.eventRepo.incrementAttendeeCount(eventId);
      } else {
        // Paid events are paid with XP (never real money). The ticket price is
        // stored in rupees (ticket_price_cents) and converted to XP using the
        // same XP_PER_RUPEE rate the wallet uses.
        const xpPrice = Math.round(((event.ticketPriceCents || 0) / 100) * config.XP_PER_RUPEE);
        if (!this.xpSvc) throw createError('XP payments unavailable', 500);

        await this.xpSvc.debitXP({
          userId,
          xp: xpPrice,
          transactionType: 'spent',
          sourceType: `event_ticket_${eventId}`,
        });

        await this.eventRepo.addAttendee(eventId, userId, { status: status, razorpayOrderId: `xp:${xpPrice}` });
        await this.eventRepo.incrementAttendeeCount(eventId);
      }
      
      const timestamp = new Date(event.startTime);
      const eventDate = timestamp.toISOString().split('T')[0];
      const eventTime = timestamp.toISOString().split('T')[1]
      const location = JSON.stringify(event.location)
      
      const user = await this.userRepo.findByIdPrivate(userId)
      const jobdata = {
        to: user.email, 
        userName: user.name, 
        eventName: event.title, 
        eventDate: eventDate, 
        eventTime: eventTime, 
        eventLocation: location, 
        eventUrl: `${config.BASE_URL}/api/v1/events/${event.id}`
      }
      await addJob('email:event_registration_success', jobdata)

      if(status === 'registered') {
        const calendarData = {
          uid: event.id,
          startTime: event.startTime,
          endTime: event.endTime,
          title: event.title,
          description: `Invitation for ${event.title} event`
        }

        const icsContent = generateEventInvite(calendarData)
        const attachments = [{
                filename: 'event-invite.ics',
                content: icsContent,
                contentType: "text/calendar; method=REQUEST",
                }]
        await addJob('email:send_invitation_event', {...jobdata, attachments})
      }

      // A confirmed registration moves the attendee's Events score (+10);
      // waitlisted entries don't rank until promoted to registered.
      if (status === 'registered') {
        const { emitLeaderboardsChanged } = require('../../sockets/notification.socket');
        emitLeaderboardsChanged(userId, 'event_registration');
      }

      // Award XP for joining a free event
      if (event.isFree && this.xpSvc) {
        this.xpSvc.creditXP({
          userId,
          xp: 50,
          transactionType: 'earned',
          sourceType: `event_register_${eventId}`,
        }).catch(e => console.error('Failed to award event registration XP:', e));
      }

      return { status: status, message: 'Registered successfully' };
    } catch (error) {
      throw error;
    }
  }

  async saveEvent({eventId, userId}) {
    try {
      const isSaved = await this.saveRepo.findByUserIdAndEventId(userId, eventId)
      if(isSaved)
        throw createError("Event already saved", 409)
      
      await this.saveRepo.create(userId, eventId)
    } catch (error) {
      throw error
    }
  }

  async removeSavedEvent({eventId, userId}) {
    try {
      const isSaved = await this.saveRepo.findByUserIdAndEventId(userId, eventId)
      if(!isSaved)
        throw createError("You have not saved this event", 404);

      await this.saveRepo.hardDelete(userId, eventId)
    } catch (error) {
      throw error
    }
  }

  async cancelRegistration({eventId, userId}) {
    try {
      const isAttendee = await this.eventRepo.getAttendee(eventId, userId);
      if (!isAttendee || isAttendee.status === 'cancelled')
        throw createError("You have already cancelled your registration", 409);

      // Paid events were charged in XP (stored as "xp:<amount>" in the order
      // column) — refund the XP on cancellation so users aren't penalized.
      if (isAttendee.razorpay_order_id && String(isAttendee.razorpay_order_id).startsWith('xp:')) {
        const xpPrice = parseInt(String(isAttendee.razorpay_order_id).slice(3), 10);
        if (xpPrice > 0 && this.xpSvc) {
          this.xpSvc.creditXP({
            userId,
            xp: xpPrice,
            transactionType: 'earned',
            sourceType: `event_refund_${eventId}`,
          }).catch(e => console.error('Failed to refund event XP:', e));
        }
      }

      await this.eventRepo.updateAttendeeStatus(eventId, userId, 'cancelled');
      await this.eventRepo.decrementAttendeeCount(eventId);

      

    } catch (error) {
      throw error;
    }
  }

  async create({userId: organizerId, body: data}) {
    try {
      const { communityId } = data;
      if (communityId) {
        // check validation
      }
      const event = await this.eventRepo.create({ ...data, organizerId });
      return event;
    } catch (error) {
      throw error;
    }
  }

  async update({eventId, userId, body: data}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);
      if (event.organizerId !== userId)
        throw createError('Not authorized to update this event', 403);

      const { communityId } = data;
      if (communityId) {
        // check validation
      }

      const updated = await this.eventRepo.update(eventId, data);
      return updated;
    } catch (error) {
      throw error;
    }
  }

  async remove({eventId, userId}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);
      if (event.organizerId !== userId)
        throw createError('Not authorized to delete this event', 403);
      await this.eventRepo.softDelete(eventId);
    } catch (error) {
      throw error;
    }
  }




  async getAttendees({userId, userRole, eventId, limit, offset}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);

      if (event.organizerId !== userId && userRole === 'user')
        throw createError('You are not authorized', 403);

      return this.eventRepo.getAttendees(eventId, limit, offset);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = EventService;
