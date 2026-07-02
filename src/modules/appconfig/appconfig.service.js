'use strict';

class AppConfigService {
  constructor({ appConfigRepository }) {
    this.appConfigRepo = appConfigRepository;
  }

  async getAppConfig() {
    try {
        return await this.appConfigRepo.findAppConfig()
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AppConfigService;
