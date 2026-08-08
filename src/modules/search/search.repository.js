'use strict';

const pool = require('../../config/database');
const SearchModel = require('./search.model');
const SearchAlgo = require('./search.algorithm')



const searchUser = async (query, limit, offset) => {
  try {
    const { rows } = await pool.query( SearchAlgo.SEARCH_USER_ALGORITHM, [`%${query}%`, limit, offset] );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const searchCommunity = async (query, filter, limit, offset) => {
  try {
    const q = query || '';
    const category = filter || null;
    const { rows } = await pool.query(SearchAlgo.SEARCH_COMMUNITY_ALGORITHM, [`%${q}%`, category, limit, offset]);
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const searchPost = async (query, limit, offset, userId = null) => {
  try {
    const q = query || '';
<<<<<<< HEAD
    const { rows } = await pool.query(SearchAlgo.SEARCH_POSt_ALGORITHM, [`%${q}%`, limit, offset, userId, q.trim() ] );
=======
    const { rows } = await pool.query(
      `SELECT 
              ${SearchModel.POST_FIELDS},
              -- Per-viewer like / bookmark state (same shape as discoverPost) so
              -- the heart + bookmark icons render correctly in search results.
              EXISTS(
                  SELECT 1 FROM post_likes pl
                  WHERE pl.post_id = p.id AND pl.user_id = $4
              ) AS is_liked,
              EXISTS(
                  SELECT 1 FROM bookmark bm
                  WHERE bm.post_id = p.id AND bm.user_id = $4
              ) AS is_bookmarked,
              EXISTS(
                  SELECT 1 FROM posts rp
                  WHERE rp.repost_of_id = p.id AND rp.author_id = $4 AND rp.deleted_at IS NULL
              ) AS is_reposted,
              COALESCE(s.allow_reposts, TRUE) AS author_reposts_enabled,
              COALESCE(
                  json_agg(
                      json_build_object(
                          'id', m.id,
                          'media_type', m.media_type,
                          'cloudfront_url', m.cloudfront_url,
                          'width', m.width,
                          'height', m.height,
                          'processing_status', m.processing_status
                      ) ORDER BY m.created_at ASC
                  ) FILTER (WHERE m.id IS NOT NULL AND m.deleted_at IS NULL), 
                  '[]'::json
              ) AS media, COUNT(*) OVER() AS total
          FROM posts p
          JOIN users u ON p.author_id = u.id
          LEFT JOIN media AS ua ON u.avatar_url = ua.id
          LEFT JOIN settings s ON s.user_id = u.id
          LEFT JOIN communities AS c ON p.community_id = c.id
          LEFT JOIN media AS ca ON c.avatar_url = ca.id
          LEFT JOIN media m ON p.id = m.post_id
          WHERE 
            p.deleted_at IS NULL AND p.status = 'published' 
            AND (p.visibility = 'public' OR (p.visibility = 'community' AND c.privacy != 'private'))
            AND ($1 = '' OR p.title ILIKE $1 OR p.content ILIKE $1)
            -- Private accounts: posts only surface to the author or approved followers
            AND (u.privacy = 'public' OR p.author_id = $4 OR EXISTS (
              SELECT 1 FROM followers f
              WHERE f.follower_id = $4 AND f.following_id = p.author_id AND f.status = 'active'
            ))
          GROUP BY p.id, u.id, ua.id, c.id, ca.id, s.user_id
          ORDER BY CASE WHEN $1 = '' THEN (p.likes_count + p.comments_count) END DESC NULLS LAST, p.created_at DESC
           LIMIT $2 OFFSET $3`,
      [`%${q}%`, limit, offset, userId]
    );
>>>>>>> 1ff14170fc46c7b2bd64020bd43092273a384ba3
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};


const searchEvent = async (query, filter, limit, offset) => {
  try {
    const q = query || '';
    const eventType = filter || null;
    const { rows } = await pool.query(SearchAlgo.SEARCH_EVENT_ALGORITHM, [`%${q}%`, eventType, limit, offset] );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const searchGame = async (query, limit, offset) => {
  try {
    const q = query || '';
    const { rows } = await pool.query(SearchAlgo.SEARCH_GAMES_ALGORITHM, [`%${q}%`, limit, offset] );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};


const discoverPost = async ({userId, interests, limit, offset}) => {
  try {
    const {rows} = await pool.query(SearchAlgo.DISCOVER_POSTS_ALGORITHM, [userId, interests, limit, offset] )
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error
  }
}

const discoverCommunity = async ({communityId, interests, limit, offset}) => {
  try {
        const { rows } = await pool.query(SearchAlgo.DISCOVER_COMMUNITY_ALGORITHM, [communityId, interests, limit, offset]);
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };  
  } catch (error) {
    throw error
  }
}


const discoverPeople = async ({followingId, userId, interests, limit, offset}) => {
  try {
    const {rows} = await pool.query(SearchAlgo.DISCOVER_PEOPLE_ALGORITHM, [followingId, userId, interests, limit, offset])
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error
  }
}


const getHashtags = async (q = '') => {
  try {
    const { rows } = await pool.query(SearchAlgo.HASHTAGS_ALGORITHM, [`%${q}%`]);
    return rows.map(r => r.hashtag);
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
    )
    const interests = rows[0]?.interests ?? [];
    return interests
  } catch (error) {
    throw error
  }
}

const findFollowers = async (userId, limit, offset) => {
  try {
    const {rows} = await pool.query(
      `
      SELECT following_id AS followingId, COUNT(*) OVER() AS total 
      FROM followers 
      WHERE follower_id = $1 AND status = 'active'
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset]
    )
    const total = rows[0]?.total || 0;
    const followings = rows.length > 0 ? rows : [];
    return {total, followings}
  } catch (error) {
    throw error
  }
}

const findFollowingCommunity = async (userId, limit, offset) => {
  try {
    const {rows} = await pool.query(
      `
      SELECT community_id AS communityId, COUNT(*) OVER() AS total 
      FROM community_members 
      WHERE user_id = $1 AND status = 'active'
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset]
    )
    const total = rows[0]?.total || 0;
    const communities = rows.length > 0 ? rows : [];
    return {total, communities}
  } catch (error) {
    throw error
  }
}

module.exports = {
    searchUser, searchCommunity, searchEvent, searchPost, searchGame, getHashtags, discoverPost, getUserInterests, discoverCommunity, discoverPeople, findFollowers, findFollowingCommunity
}