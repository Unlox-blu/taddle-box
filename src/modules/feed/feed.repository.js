'use strict';

const pool = require('../../config/database');
const PostModel = require('./feed.model');
const FEED_ALGO = require('./feed.algorithm');

const getPersonalizedPosts = async ({userId, followingId, communityId, prefCategory, prefTags, interests, seenPostId, hashtag, limit, offset, cursorData, newerCursorData}) => {
  try {
    // $11/$12/$13 = ranked cursor (total_score, published_at, id) — for scrolling down
    // $14/$15 = newer cursor (published_at, id) — for refresh / pull-to-refresh
    const cursorScore = cursorData?.score ?? null;
    const cursorPublishedAt = cursorData?.publishedAt || cursorData?.createdAt || null;
    const cursorId = cursorData?.id || null;
    const newerCursorPublishedAt = newerCursorData?.createdAt || null;
    const newerCursorId = newerCursorData?.id || null;

    const { rows } = await pool.query(
      FEED_ALGO.FEED_ALGORITHM,
      [
        userId,        // $1
        followingId,   // $2
        communityId,   // $3
        prefCategory,  // $4
        prefTags,      // $5
        interests,     // $6
        seenPostId,    // $7
        hashtag,       // $8
        limit,         // $9
        offset,        // $10
        cursorScore,          // $11
        cursorPublishedAt,    // $12
        cursorId,             // $13
        newerCursorPublishedAt, // $14
        newerCursorId,          // $15
      ]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

// User-personalized trending hashtags
const getTrendingHashtags = async ({ userId, followingId, communityId, prefTags, interests, limit = 15 }) => {
  try {
    const { rows } = await pool.query(
      FEED_ALGO.TRENDING_HASHTAGS_ALGORITHM,
      [userId, followingId || [], communityId || [], prefTags || [], interests || [], limit]
    );
    return rows.map((r) => r.hashtag);
  } catch (error) {
    throw error;
  }
};

const recordInteraction = async (userId, postId, interactionType) => {
  try {
    await pool.query(
      `INSERT INTO post_interactions (user_id, post_id, interaction_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, post_id, interaction_type) DO UPDATE SET created_at = NOW()`,
      [userId, postId, interactionType]
    );
  } catch (error) {
    throw error;
  }
};

const upsertUserPreferences = async (userId, categories, tags) => {
  try {
    await pool.query(
      `INSERT INTO user_feed_preferences (user_id, preferred_categories, preferred_tags)
     VALUES ($1, $2::text[], $3::text[])
     ON CONFLICT (user_id) 
     DO UPDATE
      SET
        preferred_categories = ARRAY(
            SELECT DISTINCT unnest(
                COALESCE(user_feed_preferences.preferred_categories, '{}')
                || EXCLUDED.preferred_categories
            )
        ),
        preferred_tags = ARRAY(
            SELECT DISTINCT unnest(
                COALESCE(user_feed_preferences.preferred_tags, '{}')
                || EXCLUDED.preferred_tags
            )
        ),
    updated_at = NOW();`,
      [userId, categories, tags]
    );
  } catch (error) {
    throw error;
  }
};

const getUserPreferences = async (userId) => {
  try {
    const {rows} = await pool.query(
      `
      SELECT preferred_categories AS Category, preferred_tags AS Tags
      FROM user_feed_preferences
      WHERE user_id = $1
      `,
      [userId]
    );
    const category = rows[0]?.category ?? [];
    const tags = rows[0]?.tags ?? [];
    return {category, tags};
  } catch (error) {
    throw error;
  }
};

const getUserInterests = async (userId) => {
  try {
    const {rows} = await pool.query(
      `
      SELECT interests
      FROM users
      WHERE id = $1
      `,
      [userId]
    );
    const interests = rows[0]?.interests ?? [];
    return interests;
  } catch (error) {
    throw error;
  }
};

const findFollowers = async (userId, limit, offset) => {
  try {
    const {rows} = await pool.query(
      `
      SELECT following_id AS followingId, COUNT(*) OVER() AS total 
      FROM followers 
      WHERE follower_id = $1 AND status = 'active'
      LIMIT $2 OFFSET $3
      `
    , [userId, limit, offset]);
    const total = rows[0]?.total || 0;
    const followings = rows.length > 0 ? rows : [];
    return {total, followings};
  } catch (error) {
    throw error;
  }
};

const findFollowingCommunity = async (userId, limit, offset) => {
  try {
    const {rows} = await pool.query(
      `
      SELECT community_id AS communityId, COUNT(*) OVER() AS total 
      FROM community_members 
      WHERE user_id = $1 AND status = 'active'
      LIMIT $2 OFFSET $3
      `
    , [userId, limit, offset]);
    const total = rows[0]?.total || 0;
    const communities = rows.length > 0 ? rows : [];
    return {total, communities};
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getPersonalizedPosts,
  getTrendingHashtags,
  recordInteraction,
  upsertUserPreferences,
  getUserPreferences,
  getUserInterests,
  findFollowers,
  findFollowingCommunity,
};
