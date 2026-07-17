'use strict';

class AppConfigService {
  constructor({ appConfigRepository }) {
    this.appConfigRepo = appConfigRepository;
  }

  async getAppConfig() {
    try {
        const appConfig = await this.appConfigRepo.findAppConfig()
        if(!appConfig)
          return {}
        return appConfig
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AppConfigService;
