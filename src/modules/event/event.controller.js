'use strict';

const { apiResponse } = require('../../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class EventController {
  constructor({ eventService }) {
    this.eventSvc = eventService;
  }

  getById = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const event = await this.eventSvc.getById({eventId});
      res.json(apiResponse(event, "Event fetched successfully!!"));
    } catch (error) {
      next(error);
    }
  };

  discover = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { q, filter } = req.query;
      const userId = req.userId || null;
      const { events, total } = await this.eventSvc.discover({ query: q, filter, limit, offset, userId });
      res.json(apiResponse(events, 'Events discovered', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };

  register = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      const result = await this.eventSvc.register({eventId, userId});
      res.json(
        apiResponse(result.orderId ? result : null, result.message || 'Registration processed')
      );
    } catch (error) {
      next(error);
    }
  };

  saveEvent = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      await this.eventSvc.saveEvent({eventId, userId});
      res.json(
        apiResponse(null,'Event saved successfully')
      );
    } catch (error) {
      next(error);
    }
  };

  removeSavedEvent = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      await this.eventSvc.removeSavedEvent({eventId, userId});
      res.json(
        apiResponse(null,'Event removed successfully')
      );
    } catch (error) {
      next(error);
    }
  };


  cancelRegistration = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      await this.eventSvc.cancelRegistration({eventId, userId});
      res.json(apiResponse(null, 'Registration cancelled'));
    } catch (error) {
      next(error);
    }
  };

  create = async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body
      const event = await this.eventSvc.create({userId, body});
      res.status(201).json(apiResponse(event, 'Event created'));
    } catch (error) {
      next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      const body = req.body;
      const event = await this.eventSvc.update({eventId, userId, body});
      res.json(apiResponse(event, 'Event updated'));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      await this.eventSvc.remove({eventId, userId});
      res.json(apiResponse(null, 'Event deleted'));
    } catch (error) {
      next(error);
    }
  };


  getAttendees = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { rows, total } = await this.eventSvc.getAttendees( {userId, userRole, eventId, limit, offset} );
      res.json(apiResponse(rows, 'Attendees fetched', paginationMeta(total, page, limit)));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = EventController;
