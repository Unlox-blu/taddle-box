'use strict';

const redis = require('../../config/redis');
const PostModel = require('./feed.model');

class FeedService {
  constructor({ feedRepository, postRepository, followerRepository }) {
    this.feedRepo = feedRepository;
    this.postRepo = postRepository;
    this.followerRepo = followerRepository
  }

  async getPersonalizedFeed({userId, limit, offset, page}) {
    try {

      const follow = await this.followerRepo.findByFollowerId(userId, 100, 0)
      const followingId = follow.followers.map(ele => ele.following_id)


      const visitedKey = `visitedfeed:${userId}`;
      const cacheKey = `feed:${userId}:${page}`;

      // Try Redis cache first
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return { posts: JSON.parse(cached), total: null, fromCache: true };
      }

      const visited = await redis.get(visitedKey) 
      const seenPost = visited ? JSON.parse(visited) : []


      // Fetch user preferences
      const prefs = await this.feedRepo.getUserPreferences(userId);
      const prefCategory = prefs.preferred_categories
      const prefTags = prefs.preferred_tags

      // Personalized query with scoring
      const { rows, total } = await this.feedRepo.getPersonalizedPosts(
        userId,
        followingId,
        prefCategory,
        prefTags,
        seenPost,
        limit,
        offset
      );
      const posts = rows.map(PostModel.format);
      const seenIds = rows.map(ele => ele.id)

      if(seenPost.length) seenIds.push(...seenPost)

      // Cache for 60s
      await redis.setex(visitedKey, 60*5, JSON.stringify(seenIds))
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
      
      const keys = await redis.keys(`feed:${userId}:*`);
      if (keys.length) await redis.del(...keys);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = FeedService;
