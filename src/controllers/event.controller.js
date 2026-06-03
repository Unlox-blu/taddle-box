'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class EventController {
  constructor({ eventService }) {
    this.eventSvc = eventService;
  }

  browse = async (req, res, next) => {
    try {
      const { limit, offset, page } = getPaginationParams(req.query);
      const { events, total } = await this.eventSvc.browse(req.query, limit, offset);
      res.json(apiResponse(events, 'Events fetched', paginationMeta(total, page, limit)));
    } catch (err) { next(err); }
  };

  create = async (req, res, next) => {
    try {
      const userId = req.userId
      const event = await this.eventSvc.create(userId, req.body);
      res.status(201).json(apiResponse(event, 'Event created'));
    } catch (err) { 
      next(err); 
    }
  };

  getById = async (req, res, next) => {
    try {
      const {eventId} = req.params
      const event = await this.eventSvc.getById(eventId);
      res.json(apiResponse(event));
    } catch (err) { next(err); }
  };

  update = async (req, res, next) => {
    try {
      const {eventId} = req.params
      const userId = req.userId
      const body = req.body
      const event = await this.eventSvc.update(eventId, userId, body);
      res.json(apiResponse(event, 'Event updated'));
    } catch (err) { 
      next(err); 
    }
  };

  remove = async (req, res, next) => {
    try {
      await this.eventSvc.remove(req.params.eventId, req.userId);
      res.json(apiResponse(null, 'Event deleted'));
    } catch (err) { next(err); }
  };

  register = async (req, res, next) => {
    try {
      const {eventId} = req.params
      const userId = req.userId
      const result = await this.eventSvc.register(eventId, userId);
      res.json(apiResponse(result.orderId ? result : null, result.message || 'Registration processed'));
    } catch (err) { next(err); }
  };

  cancelRegistration = async (req, res, next) => {
    try {
      await this.eventSvc.cancelRegistration(req.params.eventId, req.userId);
      res.json(apiResponse(null, 'Registration cancelled'));
    } catch (err) { next(err); }
  };

  getAttendees = async (req, res, next) => {
    try {
      const {eventId} = req.params
      const { limit, offset, page } = getPaginationParams(req.query);
      const { rows, total } = await this.eventSvc.getAttendees(eventId, limit, offset);
      res.json(apiResponse(rows, 'Attendees fetched', paginationMeta(total, page, limit)));
    } catch (err) { next(err); }
  };
}

module.exports = EventController;
