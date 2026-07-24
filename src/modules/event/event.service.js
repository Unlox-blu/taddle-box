'use strict';

const { createError } = require('../../utils/error.util');
const config  = require('../../config/app.config');
const { generateEventInvite } = require('../../integrations/calendar/calendar.service');
const { addJob } = require('../../jobs/queues/job.queue');

class EventService {
  constructor({ eventRepository, walletRepository, userRepository, saveRepository, }) {
    this.eventRepo = eventRepository;
    this.walletRepo = walletRepository;
    this.userRepo = userRepository;
    this.saveRepo = saveRepository;
  }

  async discover({ query, filter, limit, offset, userId }) {
    try {
      const { event, total } = await this.eventRepo.search(query, filter, limit, offset, userId);
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
        // const receipt = `evt_${eventId}_${userId}`.slice(0, 40);
        // const order = await this.paymentSvc.createOrder(event.ticket_price_cents, event.currency, receipt);
  
        // await this.eventRepo.addAttendee(eventId, userId, { status: status, razorpayOrderId: order.id });
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

      if(isAttendee.razorpay_payment_id || isAttendee.razorpay_order_id) {
        // Payment refund process
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
