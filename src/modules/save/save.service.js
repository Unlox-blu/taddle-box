'use strict';

const { createError } = require('../../utils/error.util');

class SaveService {
  constructor({ saveRepository }) {
    this.saveRepo = saveRepository;
  }

  async getSave({ userId, limit, offset }) {
    try {
      const { saved, total } = await this.saveRepo.findByUserId(userId, limit, offset);
      
      return { saved, total };
    } catch (error) {
      throw error;
    }
  }

  async create({userId, eventId}) {
    try {
      const isSaved = await this.saveRepo.findByUserIdAndEventId(userId, eventId)
      if(isSaved) 
        throw createError("It already saved", 409)
      
      await this.saveRepo.create(userId, eventId);
    } catch (error) {
      throw error;
    }
  }

  async remove({userId, eventId}) {
    try {
      const isSaved = await this.saveRepo.findByUserIdAndEventId(userId, eventId)
      if(!isSaved) 
        throw createError("It already not saved", 409)

      await this.saveRepo.hardDelete(userId, eventId);
    } catch (error) {
      throw error;
    }
  }
  
}

module.exports = SaveService;
