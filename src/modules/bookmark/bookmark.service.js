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

  // ── Get bookmarks (all types, sorted by created_at DESC) ──────────────

  async getBookmarks({ userId, limit, offset }) {
    // Fetch all types in parallel, then merge + sort by bookmark date.
    const types = ['post', 'profile', 'community'];
    const results = await Promise.all(
      types.map((t) =>
        this.bookmarkRepo.findByUserId({ userId, itemType: t, limit: limit * 2, offset: 0 })
          .then(({ bookmark }) => bookmark.map((b) => ({ ...b, itemType: t })))
          .catch(() => []),
      ),
    );
    // Flatten, sort by bookmark date (newest first), apply pagination.
    const all = results
      .flat()
      .sort((a, b) => new Date(b.bookmarkedAt || b.publishedAt || 0) - new Date(a.bookmarkedAt || a.publishedAt || 0));
    const total = all.length;
    const bookmark = all.slice(offset, offset + limit);
    return { bookmark, total };
  }

  async searchBookmark({ userId, query, communities, people, tags, sortBy, timeCutoff, requestedType = 'all', limit = 10, offset = 0 }) {
    try {
      return await this.bookmarkRepo.search({
        userId,
        query,
        communities,
        people,
        tags,
        sortBy,
        timeCutoff,
        requestedType,
        limit,
        offset,
      });
    } catch (error) {
      throw error;
    }
  }

}

module.exports = BookmarkService;
