'use strict';

const TABLE = 'followers';

const PUBLIC_FIELDS = [
  'follower_id', 'following_id', 'created_at',
].join(', ');

/** Converts snake_case DB row → camelCase API response */
const format = (row) => {
  if (!row) return null;
  return {
    followerId: row.follower_id,
    followingId: row.following_id,
    createdAt: row.created_at
  };
};


module.exports= {TABLE, PUBLIC_FIELDS, format}