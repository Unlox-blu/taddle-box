'use strict';


class HighlightService {
  constructor({ highlightRepository }) {
    this.highlightRepo = highlightRepository;
  }

  async getSpotligth({limit, offset}) {
    try {
      const {spotligth, total} = await this.highlightRepo.getSpotLight(limit, offset);
      
      return {spotligth, total}
    } catch (error) {
      throw error;
    }
  }
}

module.exports = HighlightService;
