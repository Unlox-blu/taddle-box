'use strict';

const { createError } = require('../../utils/error.util');
const BookmarkModel = require('./bookmark.model');

class BookmarkService {
  constructor({ bookmarkRepository }) {
    this.bookmarkRepo = bookmarkRepository;
  }

  // ── Toggle bookmark (creates or removes) ────────────────────────────────

  async toggle({ userId, itemType, itemId }) {
    if (!BookmarkModel.ITEM_TYPES.includes(itemType)) {
      throw createError(`Invalid bookmark type: ${itemType}`, 400);
    }

    const isBookmarked = await this.bookmarkRepo.exists(userId, itemType, itemId);

    if (isBookmarked) {
      await this.bookmarkRepo.hardDelete(userId, itemType, itemId);
      return { bookmarked: false };
    }

    await this.bookmarkRepo.create(userId, itemType, itemId);
    return { bookmarked: true };
  }

  // ── Check if a specific item is bookmarked ─────────────────────────────

  async isBookmarked({ userId, itemType, itemId }) {
    return this.bookmarkRepo.exists(userId, itemType, itemId);
  }

  // ── Get bookmarks by type ──────────────────────────────────────────────

  async getBookmarks({ userId, itemType = 'post', limit, offset }) {
    const { bookmark, total } = await this.bookmarkRepo.findByUserId({
      userId,
      itemType,
      limit,
      offset,
    });
    return { bookmark, total };
  }

}

module.exports = BookmarkService;
