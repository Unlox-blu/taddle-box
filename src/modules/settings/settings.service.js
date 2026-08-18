'use strict';

const { createError } = require('../../utils/error.util');
const pushNotificationPrefCache = require('../notification/pushNotification.prefcache');

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

  async _getOrCreateSettings(userId) {
    let settings = await this.settingsRepo.findByUserId(userId);
    if (!settings) {
      settings = await this.settingsRepo.create(userId);
    }
    return settings;
  }

  async getSettings({ userId }) {
    try {
      const settings = await this._getOrCreateSettings(userId);
      return settings;
    } catch (error) {
      throw error;
    }
  }

  async setTheme({ userId, theme }) {
    try {
      await this._getOrCreateSettings(userId);
      const newTheme = await this.settingsRepo.setTheme(userId, theme);
      return newTheme;
    } catch (error) {
      throw error;
    }
  }

  async toggleSystemNotification({ userId }) {
    try {
      await this._getOrCreateSettings(userId);
      const notification = await this.settingsRepo.toggleSystemNotification(userId);
      await pushNotificationPrefCache.invalidate(userId);
      return notification;
    } catch (error) {
      throw error;
    }
  }

  async togglePromotionalNotification({ userId }) {
    try {
      await this._getOrCreateSettings(userId);
      const notification = await this.settingsRepo.togglePromotionalNotification(userId);
      return notification;
    } catch (error) {
      throw error;
    }
  }

  async toggleNotifXP({ userId }) {
    try {
      await this._getOrCreateSettings(userId);
      const result = await this.settingsRepo.toggleNotifXP(userId);
      await pushNotificationPrefCache.invalidate(userId);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async toggleNotifWithdraw({ userId }) {
    try {
      await this._getOrCreateSettings(userId);
      return await this.settingsRepo.toggleNotifWithdraw(userId);
    } catch (error) {
      throw error;
    }
  }

  async toggleNotifPromos({ userId }) {
    try {
      await this._getOrCreateSettings(userId);
      const result = await this.settingsRepo.toggleNotifPromos(userId);
      await pushNotificationPrefCache.invalidate(userId);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async togglePublicAccount({ userId }) {
    try {
      await this._getOrCreateSettings(userId);
      return await this.settingsRepo.togglePublicAccount(userId);
    } catch (error) {
      throw error;
    }
  }

  async toggleActivityStatus({ userId }) {
    try {
      await this._getOrCreateSettings(userId);
      return await this.settingsRepo.toggleActivityStatus(userId);
    } catch (error) {
      throw error;
    }
  }

  async toggleAllowTagging({ userId }) {
    try {
      await this._getOrCreateSettings(userId);
      return await this.settingsRepo.toggleAllowTagging(userId);
    } catch (error) {
      throw error;
    }
  }

  async toggleAllowReposts({ userId }) {
    try {
      await this._getOrCreateSettings(userId);
      return await this.settingsRepo.toggleAllowReposts(userId);
    } catch (error) {
      throw error;
    }
  }

  async toggleShowOnLeaderboard({ userId }) {
    try {
      await this._getOrCreateSettings(userId);
      return await this.settingsRepo.toggleShowOnLeaderboard(userId);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = SettingsService;
