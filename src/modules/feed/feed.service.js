'use strict';

const redis = require('../../config/redis');
const PostModel = require('./feed.model');
const { getPaginationParams, paginationMeta } = require('../../utils/pagination.util');

class FeedService {
  constructor({ feedRepository, postRepository, followerRepository }) {
    this.feedRepo = feedRepository;
    this.postRepo = postRepository;
    this.followerRepo = followerRepository;
  }

  async getPersonalizedFeed({userId, limit, offset, page, hashtag, cursorData, newerCursorData}) {
    try {
      
      const followingId = await this.getFollowingUserIds({userId, page})
      const communityId = await this.getFollowingCommunityIds({userId, page})
      const {prefCategory, prefTags, interests} = await this.getPreferences({userId})
      const seenPostId = [];
      const { rows, total } = await this.feedRepo.getPersonalizedPosts({
        userId, followingId, communityId, 
        prefCategory, prefTags, interests, 
        seenPostId, hashtag: hashtag ? hashtag.replace(/^#/, '') : null, 
        limit, offset, cursorData, newerCursorData
      });
      
      const posts = rows.map(PostModel.format);
      return { posts, total, fromCache: false };
    } catch (error) {
      throw error;
    }
  }

  async getTrendingHashtags({ userId }) {
    try {
      const followingId = await this.getFollowingUserIds({ userId, page: 1 });
      const communityId = await this.getFollowingCommunityIds({ userId, page: 1 });
      const { prefTags, interests } = await this.getPreferences({ userId });
      return this.feedRepo.getTrendingHashtags({
        userId,
        followingId,
        communityId,
        prefTags,
        interests,
      });
    } catch (error) {
      throw error;
    }
  }

  async recordInteraction(userId, postId, interactionType) {
    try {
      await this.feedRepo.recordInteraction(userId, postId, interactionType);
      if (['like', 'comment'].includes(interactionType)) {
        const keys = await redis.keys(`feed:${userId}:*`);
        if (keys.length) await redis.del(...keys);
      }
    } catch (error) {
      throw error;
    }
  }

  async updatePreferences({userId, categories, tags}) {
    try {
      await this.feedRepo.upsertUserPreferences(userId, categories, tags);
      const keys = await redis.keys(`feed:${userId}:*`);
      if (keys.length) await redis.del(...keys);
    } catch (error) {
      throw error;
    }
  }

  async getPreferences({userId}) {
    try {
      const {category, tags} = await this.feedRepo.getUserPreferences(userId)
      const userInterests = await this.feedRepo.getUserInterests(userId)
      const interests = userInterests.map(item =>  item.replace(/^\p{Extended_Pictographic}\s*/u, ''));
      const prefCategory = category
      const prefTags = tags
      return {prefCategory, prefTags, interests}
    } catch (error) {
      throw error
    }
  }

  async getFollowingUserIds({userId, page}) {
    try {
      const { limit, offset } = getPaginationParams({page})
      const {total, followings} = await this.feedRepo.findFollowers(userId, limit, offset)
      const followingId = followings.map(ele => ele.followingid)
      return followingId
    } catch (error) {
      throw error
    }
  }

  async getFollowingCommunityIds({userId, page}) {
    try {
      const { limit, offset } = getPaginationParams({page})
      const {total, communities} = await this.feedRepo.findFollowingCommunity(userId, limit, offset)
      const communityId = communities.map(ele => ele.communityid)
      return communityId
    } catch (error) {
      throw error
    }
  }
}

module.exports = FeedService;
