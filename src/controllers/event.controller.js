'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class EventController {
  constructor({ eventService }) {
    this.eventSvc = eventService;
  }

  

  create = async (req, res, next) => {
    try {
      const userId = req.userId;
      const body = req.body
      const event = await this.eventSvc.create(userId, body);
      res.status(201).json(apiResponse(event, 'Event created'));
    } catch (err) {
      next(err);
    }
  };

  getById = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const event = await this.eventSvc.getById(eventId);
      res.json(apiResponse(event));
    } catch (err) {
      next(err);
    }
  };

  update = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      const body = req.body;
      const event = await this.eventSvc.update(eventId, userId, body);
      res.json(apiResponse(event, 'Event updated'));
    } catch (err) {
      next(err);
    }
  };

  remove = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      await this.eventSvc.remove(eventId, userId);
      res.json(apiResponse(null, 'Event deleted'));
    } catch (err) {
      next(err);
    }
  };

  register = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      const result = await this.eventSvc.register(eventId, userId);
      res.json(
        apiResponse(result.orderId ? result : null, result.message || 'Registration processed')
      );
    } catch (err) {
      next(err);
    }
  };

  cancelRegistration = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      await this.eventSvc.cancelRegistration(eventId, userId);
      res.json(apiResponse(null, 'Registration cancelled'));
    } catch (err) {
      next(err);
    }
  };

  getAttendees = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const userId = req.userId;
      const userRole = req.userRole;
      const { limit, offset, page } = getPaginationParams(req.query);
      const { rows, total } = await this.eventSvc.getAttendees(
        userId,
        userRole,
        eventId,
        limit,
        offset
      );
      res.json(apiResponse(rows, 'Attendees fetched', paginationMeta(total, page, limit)));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = EventController;
