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
    const { rows } = await pool.query(SearchAlgo.SEARCH_POSt_ALGORITHM, [`%${q}%`, limit, offset, userId, q.trim() ] );
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