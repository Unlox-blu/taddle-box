'use strict';

const redis = require('../config/redis');
const PostModel = require('../models/post.model');

class FeedService {
  constructor({ feedRepository, postRepository }) {
    this.feedRepo = feedRepository;
    this.postRepo = postRepository;
  }

  async getPersonalizedFeed(userId, followingIds, limit, offset, page) {
    try {
      const cacheKey = `feed:${userId}:${page}`;

      // Try Redis cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return { posts: JSON.parse(cached), total: null, fromCache: true };
      }

      // Fetch user preferences
      const prefs = await this.feedRepo.getUserPreferences(userId);

      // Personalized query with scoring
      const { rows, total } = await this.feedRepo.getPersonalizedPosts(
        userId,
        followingIds,
        prefs,
        [], // seenPostIds — TODO: pass from client cursor
        limit,
        offset
      );

      const posts = rows.map(PostModel.format);

      // Cache for 60s
      await redis.setex(cacheKey, 60, JSON.stringify(posts));

      return { posts, total, fromCache: false };
    } catch (error) {
      throw error;
    }
  }

  async recordInteraction(userId, postId, interactionType) {
    try {
      await this.feedRepo.recordInteraction(userId, postId, interactionType);
      // Invalidate cache on meaningful interaction
      if (['like', 'comment'].includes(interactionType)) {
        const keys = await redis.keys(`feed:${userId}:*`);
        if (keys.length) await redis.del(...keys);
      }
    } catch (error) {
      throw error;
    }
  }

  async updatePreferences(userId, categories, tags) {
    try {
      await this.feedRepo.upsertUserPreferences(userId, categories, tags);
      // Bust cache
      const keys = await redis.keys(`feed:${userId}:*`);
      if (keys.length) await redis.del(...keys);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = FeedService;
