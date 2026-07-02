'use strict';

const { createError } = require('../../utils/error.util');

class SettingsService {
  constructor({ settingsRepository, userRepository }) {
    this.settingsRepo = settingsRepository;
    this.userRepo = userRepository;
  }

  async createSettings({ userId }) {
    try {
      const isExist = await this.settingsRepo.findByUserId(userId);
      if (isExist) throw createError('settings already Exist', 409);

      const settings = await this.settingsRepo.create(userId);
      return settings;
    } catch (error) {
      throw error;
    }
  }

  async getSettings({ userId }) {
    try {
      const settings = await this.settingsRepo.findByUserId(userId);
      if (!settings) throw createError('settings not found', 404);
      return settings;
    } catch (error) {
      throw error;
    }
  }

  async setTheme({ userId, theme }) {
    try {
      const settings = await this.settingsRepo.findByUserId(userId);

      if (!settings) {
        throw createError('settings not found', 404);
      }

      const newTheme = await this.settingsRepo.setTheme(userId, theme);

      return newTheme;
    } catch (error) {
      throw error;
    }
  }

  async toggleSystemNotification({ userId }) {
    try {
      const settings = await this.settingsRepo.findByUserId(userId);

      if (!settings) {
        throw createError('settings not found', 404);
      }

      const notification = await this.settingsRepo.toggleSystemNotification(userId);

      return notification;
    } catch (error) {
      throw error;
    }
  }

  async togglePromotionalNotification({ userId }) {
    try {
      const settings = await this.settingsRepo.findByUserId(userId);

      if (!settings) {
        throw createError('settings not found', 404);
      }

      const notification = await this.settingsRepo.togglePromotionalNotification(userId);

      return notification;
    } catch (error) {
      throw error;
    }
  }

  async setAppLock({ userId, pin }) {
    try {
      await this.userRepo.updateAppLock(userId, pin)
    } catch (error) {
      throw error;
    }
  }

  async removeAppLock({ userId }) {
    try {
      await this.userRepo.removeAppLock(userId)
    } catch (error) {
      throw error;
    }
  }
}

module.exports = SettingsService;
