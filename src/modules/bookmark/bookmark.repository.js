'use strict';

const pool = require('../../config/database');
const BookmarkModel = require('./bookmark.model');

// ── Generic CRUD ────────────────────────────────────────────────────────────

const create = async (userId, itemType, itemId) => {
  try {
    await pool.query(
      `INSERT INTO ${BookmarkModel.BOOKMARK_TABLE}
        (user_id, source_type, source_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, source_type, source_id) DO NOTHING`,
      [userId, itemType, itemId],
    );
  } catch (error) {
    throw error;
  }
};

const exists = async (userId, itemType, itemId) => {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM ${BookmarkModel.BOOKMARK_TABLE}
       WHERE user_id = $1 AND source_type = $2 AND source_id = $3`,
      [userId, itemType, itemId],
    );
    return rows.length > 0;
  } catch (error) {
    throw error;
  }
};

const hardDelete = async (userId, itemType, itemId) => {
  try {
    await pool.query(
      `DELETE FROM ${BookmarkModel.BOOKMARK_TABLE}
       WHERE user_id = $1 AND source_type = $2 AND source_id = $3`,
      [userId, itemType, itemId],
    );
  } catch (error) {
    throw error;
  }
};

// ── Post bookmarks (existing detailed query) ────────────────────────────────

const findPostBookmarks = async ({ userId, limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
          p.id,
          p.author_id,
          p.community_id,
          p.repost_of_id,
          p.title,
          p.content,
          p.tags,
          p.category,
          p.likes_count,
          p.comments_count,
          p.shares_count,
          p.views_count,
          p.poll_data,
          COALESCE(orig.latitude,  p.latitude)  AS latitude,
          COALESCE(orig.longitude, p.longitude) AS longitude,
          COALESCE(orig.place,     p.place)     AS place,
          p.published_at,

          EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) AS is_liked,
          EXISTS(
            SELECT 1 FROM posts rp
            WHERE rp.repost_of_id = p.id AND rp.author_id = $1 AND rp.deleted_at IS NULL
          ) AS is_reposted,
          (
            SELECT pv.option_index FROM poll_votes pv
            WHERE pv.post_id = p.id AND pv.user_id = $1 LIMIT 1
          ) AS my_poll_vote,

          json_build_object(
              'id', u.id,
              'name', u.name,
              'username', u.username,
              'reposts_enabled', COALESCE(s.allow_reposts, TRUE),
              'avatar_url',
                  CASE
                      WHEN u.avatar_url IS NULL THEN NULL
                      ELSE json_build_object('cloudfront_url', ua.cloudfront_url)
                  END
          ) AS author,

          CASE
              WHEN c.id IS NULL THEN NULL
              ELSE json_build_object(
                  'id', c.id,
                  'name', c.name,
                  'slug', c.slug,
                  'privacy', c.privacy,
                  'reposts_enabled', COALESCE(c.allow_reposts, TRUE),
                  'avatar_url',
                  CASE
                      WHEN c.avatar_url IS NULL THEN NULL
                      ELSE json_build_object('cloudfront_url', ca.cloudfront_url)
                  END
              )
          END AS community,

          COALESCE(
              json_agg(
                  CASE
                      WHEN pm.id IS NULL THEN NULL
                      ELSE json_build_object(
                          'id', pm.id,
                          'media_type', pm.media_type,
                          'cloudfront_url', pm.cloudfront_url,
                          'vimeo_uri', pm.vimeo_uri,
                          'vimeo_thumbnail_url', pm.vimeo_thumbnail_url,
                          'duration_seconds', pm.duration_seconds
                      )
                  END
              ) FILTER (WHERE pm.id IS NOT NULL),
              '[]'::json
          ) AS media,

          COUNT(*) OVER() AS total

      FROM ${BookmarkModel.BOOKMARK_TABLE} b

      JOIN ${BookmarkModel.POST_TABLE} p
          ON p.id = b.source_id

      JOIN ${BookmarkModel.USER_TABLE} u
          ON u.id = p.author_id

      LEFT JOIN ${BookmarkModel.POST_TABLE} orig
          ON orig.id = p.repost_of_id
          AND orig.deleted_at IS NULL
          AND orig.status = 'published'

      LEFT JOIN ${BookmarkModel.MEDIA_TABLE} ua
          ON ua.id = u.avatar_url

      LEFT JOIN settings s
          ON s.user_id = u.id

      LEFT JOIN ${BookmarkModel.COMMUNITY_TABLE} c
          ON c.id = p.community_id

      LEFT JOIN ${BookmarkModel.MEDIA_TABLE} ca
          ON ca.id = c.avatar_url

      LEFT JOIN ${BookmarkModel.MEDIA_TABLE} pm
          ON pm.post_id = p.id
          AND pm.deleted_at IS NULL

      WHERE b.user_id = $1
      AND b.source_type = 'post'
      AND p.deleted_at IS NULL
      AND p.status = 'published'

      GROUP BY
          p.id, u.id, ua.id, c.id, ca.id, s.user_id, b.created_at, orig.id

      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
    );
    const total = rows[0]?.total || 0;
    const bookmark = rows.map((r) => BookmarkModel.formatPost(r));
    return { bookmark, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

// ── Profile bookmarks ───────────────────────────────────────────────────────

const findProfileBookmarks = async ({ userId, limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
          u.id,
          u.name,
          u.username,
          u.bio,
          u.privacy,
          u.avatar_url,
          um.cloudfront_url AS avatar_cloudfront_url,
          (SELECT COUNT(*) FROM followers f WHERE f.following_id = u.id) AS follower_count,
          (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.deleted_at IS NULL AND p.status = 'published') AS post_count,
          EXISTS(SELECT 1 FROM followers f WHERE f.follower_id = $1 AND f.following_id = u.id) AS is_following,
          b.created_at AS bookmarked_at,
          COUNT(*) OVER() AS total

      FROM ${BookmarkModel.BOOKMARK_TABLE} b

      JOIN ${BookmarkModel.USER_TABLE} u
          ON u.id = b.source_id

      LEFT JOIN ${BookmarkModel.MEDIA_TABLE} um
          ON um.id = u.avatar_url

      WHERE b.user_id = $1
      AND b.source_type = 'profile'

      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
    );
    const total = rows[0]?.total || 0;
    const bookmark = rows.map((r) => BookmarkModel.formatProfile(r));
    return { bookmark, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

// ── Community bookmarks ─────────────────────────────────────────────────────

const findCommunityBookmarks = async ({ userId, limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
          c.id,
          c.name,
          c.slug,
          c.description,
          c.category,
          c.privacy,
          c.avatar_url,
          cm.avatar_cloudfront_url,
          (SELECT COUNT(*) FROM community_members cm2 WHERE cm2.community_id = c.id) AS member_count,
          (SELECT COUNT(*) FROM posts p WHERE p.community_id = c.id AND p.deleted_at IS NULL AND p.status = 'published') AS post_count,
          EXISTS(SELECT 1 FROM community_members cm3 WHERE cm3.community_id = c.id AND cm3.user_id = $1) AS is_member,
          b.created_at AS bookmarked_at,
          COUNT(*) OVER() AS total

      FROM ${BookmarkModel.BOOKMARK_TABLE} b

      JOIN ${BookmarkModel.COMMUNITY_TABLE} c
          ON c.id = b.source_id

      LEFT JOIN (SELECT id, cloudfront_url AS avatar_cloudfront_url FROM ${BookmarkModel.MEDIA_TABLE}) cm
          ON cm.id = c.avatar_url

      WHERE b.user_id = $1
      AND b.source_type = 'community'

      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
    );
    const total = rows[0]?.total || 0;
    const bookmark = rows.map((r) => BookmarkModel.formatCommunity(r));
    return { bookmark, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};


// ── Dispatcher ──────────────────────────────────────────────────────────────

const findByUserId = async ({ userId, itemType, limit, offset }) => {
  switch (itemType) {
    case 'post':     return findPostBookmarks({ userId, limit, offset });
    case 'profile':  return findProfileBookmarks({ userId, limit, offset });
    case 'community': return findCommunityBookmarks({ userId, limit, offset });
    default:         return findPostBookmarks({ userId, limit, offset });
  }
};

module.exports = {
  create,
  exists,
  hardDelete,
  findByUserId,
  findPostBookmarks,
  findProfileBookmarks,
  findCommunityBookmarks,
};
