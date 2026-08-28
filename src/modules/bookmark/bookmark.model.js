'use strict';

const BOOKMARK_TABLE = 'bookmark';
const POST_TABLE = 'posts';
const USER_TABLE = 'users';
const COMMUNITY_TABLE = 'communities';
const MEDIA_TABLE = 'media';

// Supported bookmark entity types — extend as new types are added.
const ITEM_TYPES = ['post', 'profile', 'community', 'comment', 'game', 'event'];

const PostModel = require('../post/post.model');
const UserModel = require('../user/user.model');
const CommunityModel = require('../community/community.model');

// Generic formatter that dispatches by item_type
const format = (row, itemType) => {
  if (!row) return null;
  switch (itemType || row.item_type) {
    case 'post':     return PostModel.format(row);
    case 'profile':  return UserModel.format(row);
    case 'community': return CommunityModel.format(row);
    // Future types: return a lightweight shape so the UI can render something.
    default:
      return {
        id: row.item_id || row.id,
        type: row.item_type,
        name: row.name || row.title || 'Untitled',
        bookmarkedAt: row.bookmarked_at || row.created_at,
      };
  }
};

module.exports = {
  BOOKMARK_TABLE,
  POST_TABLE,
  USER_TABLE,
  COMMUNITY_TABLE,
  MEDIA_TABLE,
  ITEM_TYPES,
  format,
};
