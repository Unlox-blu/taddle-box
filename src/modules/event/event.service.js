'use strict';

const { createError } = require('../../utils/error.util');
const EventModel = require('./event.model');
const config  = require('../../config/app.config');
const { addEmailJob } = require('../../jobs/queues/email.queue');
const { generateEventInvite } = require('../../integrations/calendar/calendar.service');

class EventService {
  constructor({ eventRepository, walletRepository, userRepository, saveRepository, }) {
    this.eventRepo = eventRepository;
    this.walletRepo = walletRepository;
    this.userRepo = userRepository;
    this.saveRepo = saveRepository;
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

  async register({eventId, userId}) {
    try {
      const event = await this.eventRepo.findById(eventId);
      if (!event) throw createError('Event not found', 404);

      if (event.status !== 'upcoming') 
        throw createError('Event is not open for registration', 400);

      const existing = await this.eventRepo.getAttendee(eventId, userId);
      if (existing) throw createError('Already registered for this event', 409);
      
      const status = (!event.max_attendees || event.attendee_count >= event.max_attendees) ? 'registered' : 'waitlisted'

      if (event.is_free) { 
        await this.eventRepo.addAttendee(eventId, userId, { status: status });
        await this.eventRepo.incrementAttendeeCount(eventId);
      } else {
        // const receipt = `evt_${eventId}_${userId}`.slice(0, 40);
        // const order = await this.paymentSvc.createOrder(event.ticket_price_cents, event.currency, receipt);
  
        // await this.eventRepo.addAttendee(eventId, userId, { status: status, razorpayOrderId: order.id });
      }
      
      const timestamp = new Date(event.start_time);
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
      await addEmailJob('event_registration_success', jobdata)

      if(status === 'registered') {
        const calendarData = {
          uid: event.id,
          startTime: event.start_time,
          endTime: event.end_time,
          title: event.title,
          description: `Invitation for ${event.title} event`
        }

        const icsContent = generateEventInvite(calendarData)
        const attachments = [{
                filename: 'event-invite.ics',
                content: icsContent,
                contentType: "text/calendar; method=REQUEST",
                }]
        await addEmailJob('send_invitation_event', {...jobdata, attachments})
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
        throw createError("Event already not saved", 409)

      await this.saveRepo.hardDelete(userId, eventId)
    } catch (error) {
      throw error
    }
  }

  async cancelRegistration({eventId, userId}) {
    try {
      const isAttendee = await this.eventRepo.getAttendee(eventId, userId);
      if (!isAttendee || isAttendee.status === 'cancelled')
        throw createError('You already cancelled', 409);

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
