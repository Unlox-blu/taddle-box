'use strict';

const { apiResponse } = require('../../utils/response.util');

class PushController {
  constructor({ pushService }) {
    this.pushSvc = pushService;
  }

  registerToken = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { token, platform } = req.body;
      const registered = await this.pushSvc.registerToken({ userId, token, platform });
      res.status(201).json(apiResponse(registered, 'Device token registered'));
    } catch (error) {
      next(error);
    }
  };

  toggleNotification = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { token } = req.body;
      const message = await this.pushSvc.toggleNotification({ userId, token });
      res.status(201).json(apiResponse(null, message));
    } catch (error) {
      next(error);
    }
  };

  send = async (req, res, next) => {
    try {
      const { userId, title, message, data } = req.body;
      const receipts = await this.pushSvc.sendToUser({ userId, title, message, data });
      res.json(apiResponse(receipts, 'Push sent'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = PushController;
