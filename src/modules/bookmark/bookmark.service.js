'use strict';

const { createError } = require('../../utils/error.util');

class BookmarkService {
  constructor({ bookmarkRepository }) {
    this.bookmarkRepo = bookmarkRepository;
  }

  async getBookmarks({ userId, limit, offset }) {
    try {
      const { bookmark, total } = await this.bookmarkRepo.findByUserId({userId, limit, offset});
      
      return { bookmark, total };
    } catch (error) {
      throw error;
    }
  }

  async create({userId, postId}) {
    try {
      const isBookmarked = await this.bookmarkRepo.findByUserIdAndPostId(userId, postId)
      if(isBookmarked) 
        throw createError("It already bookmarked", 409)
      
      await this.bookmarkRepo.create(userId, postId);
    } catch (error) {
      throw error;
    }
  }

  async remove({userId, postId}) {
    try {
      const isBookmarked = await this.bookmarkRepo.findByUserIdAndPostId(userId, postId)
      if(!isBookmarked) 
        throw createError("It already not bookmarked", 409)

      await this.bookmarkRepo.hardDelete(userId, postId);
    } catch (error) {
      throw error;
    }
  }

}

module.exports = BookmarkService;
