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

// Normalizes a community scope into a slug ARRAY (or null). Accepts a single
// slug, a comma-separated list ("a,b") or an array — the SQL uses $6::text[]
// with = ANY() so multiple c/<slug> filters combine.
const toCommunityArray = (community) => {
  if (Array.isArray(community)) {
    const arr = community.map((s) => String(s).trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  if (community) {
    const arr = String(community).split(',').map((s) => s.trim()).filter(Boolean);
    return arr.length ? arr : null;
  }
  return null;
};

const searchPost = async (query, limit, offset, userId = null, community = null, author = null, involvement = null, tag = null, bookmarked = null, mine = null, sortBy = 'relevance', postFilter = 'all', timeCutoff = null) => {
  try {
    const q = query || '';
    // Community-scoped search — an ARRAY of slugs filters results to those
    // communities' posts (the algorithm's $6 slot); null means global search.
    // Person-scoped search — an ARRAY of usernames ($7 slot) matches posts
    // where ANY of them is involved (authored, mentioned, commented,
    // reposted); $8 (involvement) narrows to one dimension, $9 (tag) filters
    // by hashtag, $10 (bookmarked) restricts to the user's saved posts, and
    // $11 (mine) to their own posts. $12 is for sorting the results.
    // $13 is for postFilter (contents, comments, mentions) for global post search.
    const communityArr = toCommunityArray(community);
    const authorArr = Array.isArray(author) && author.length ? author : null;
    const tagArr = Array.isArray(tag) && tag.length ? tag : null;
    const bmFlag = bookmarked === true || bookmarked === '1' || bookmarked === 1 ? true : null;
    const mineFlag = mine === true || mine === '1' || mine === 1 ? true : null;
    const { rows } = await pool.query(SearchAlgo.SEARCH_POSt_ALGORITHM, [`%${q}%`, limit, offset, userId, q.trim(), communityArr, authorArr, involvement || null, tagArr, bmFlag, mineFlag, sortBy, postFilter, timeCutoff || null ] );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

// Searches COMMENTS whose text (or whose post's title/tags) match. The returned
// rows carry the comment plus its parent-post context so the app can render a
// "commented on …" card and deep-link to the post.
const searchComment = async (query, limit, offset, userId = null, { community = null, author = null, tag = null, sortBy = 'relevance', bookmarked = null, timeCutoff = null } = {}) => {
  try {
    const q = query || '';
    const communityArr = toCommunityArray(community);
    const authorArr = Array.isArray(author) && author.length ? author : null;
    const tagArr = Array.isArray(tag) && tag.length ? tag : null;
    const bmFlag = bookmarked === true || bookmarked === '1' || bookmarked === 1 ? true : null;
    const { rows } = await pool.query(SearchAlgo.SEARCH_COMMENT_ALGORITHM, [`%${q}%`, limit, offset, userId, q.trim(), communityArr, authorArr, tagArr, sortBy, bmFlag, null, timeCutoff || null ] );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

// Searches MEDIA attached to posts whose text matches. Returns one row per
// media item (image/video/audio) with its parent-post context.
const searchMedia = async (query, limit, offset, userId = null, { community = null, author = null, tag = null, sortBy = 'relevance', bookmarked = null, timeCutoff = null } = {}) => {
  try {
    const q = query || '';
    const communityArr = toCommunityArray(community);
    const authorArr = Array.isArray(author) && author.length ? author : null;
    const tagArr = Array.isArray(tag) && tag.length ? tag : null;
    const bmFlag = bookmarked === true || bookmarked === '1' || bookmarked === 1 ? true : null;
    const { rows } = await pool.query(SearchAlgo.SEARCH_MEDIA_ALGORITHM, [`%${q}%`, limit, offset, userId, q.trim(), communityArr, authorArr, tagArr, sortBy, bmFlag, null, timeCutoff || null ] );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};


const searchEvent = async (query, filter, limit, offset, bookmarked = null, userId = null) => {
  try {
    const q = query || '';
    const eventType = filter || null;
    const bmFlag = bookmarked === true || bookmarked === '1' || bookmarked === 1 ? true : null;
    const { rows } = await pool.query(SearchAlgo.SEARCH_EVENT_ALGORITHM, [`%${q}%`, eventType, limit, offset, bmFlag, userId || null] );
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
    searchUser, searchCommunity, searchEvent, searchPost, searchComment, searchMedia, searchGame, getHashtags, discoverPost, getUserInterests, discoverCommunity, discoverPeople, findFollowers, findFollowingCommunity
}