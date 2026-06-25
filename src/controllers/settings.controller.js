'use strict';

const { apiResponse } = require('../utils/response.util');
const { getPaginationParams, paginationMeta } = require('../utils/pagination.util');

class SettingsController {
  constructor({ settingsService }) {
    this.settingsSvc = settingsService;
  }

  createSettings = async (req, res, next) => {
    try {
      const userId = req.userId;
      const settings = await this.settingsSvc.createSettings({userId});
      res.json(apiResponse(settings, "Settings created successfuly"));
    } catch (error) {
      next(error);
    }
  };

  getSettings = async (req, res, next) => {
    try {
      const userId = req.userId;
      const settings = await this.settingsSvc.getSettings({userId});
      res.json(apiResponse(settings, "settings fetched successfuly"));
    } catch (error) {
      next(error);
    }
  };

  setTheme = async (req, res, next) => {
    try {
      const userId = req.userId;
      const {theme} = req.body;
      const newTheme = await this.settingsSvc.setTheme({userId, theme});
      res.json(
        apiResponse(newTheme, 'Theme set successfully')
      );
    } catch (error) {
      next(error);
    }
  };

  toggleSystemNotification = async (req, res, next) => {
    try {
      const userId = req.userId;
      const notification = await this.settingsSvc.toggleSystemNotification({userId});
      res.json(apiResponse(notification, `Notification ${notification.notification ? "No": "Off"} successfuly`));
    } catch (error) {
      next(error);
    }
  };

  togglePromotionalNotification = async (req, res, next) => {
    try {
      const userId = req.userId;
      const notification = await this.settingsSvc.togglePromotionalNotification({userId});
      res.json(apiResponse(notification, `Notification ${notification.notification ? "No": "Off"} successfuly`));
    } catch (error) {
      next(error);
    }
  };

  setAppLock = async (req, res, next) => {
    try {
      const userId = req.userId;
      const { appLock } = req.body;
      await this.settingsSvc.setAppLock({userId, appLock});
      res.json(apiResponse(null, 'App Lock Set successfuly'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = SettingsController;
