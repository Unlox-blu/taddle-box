'use strict';

const pool = require('../../config/database');
const BookmarkModel = require('./bookmark.model');

const create = async (userId, postId) => {
    try {
        await pool.query(
            `INSERT INTO ${BookmarkModel.BOOKMARK_TABLE}
            (user_id, post_id)
            VALUES($1, $2)
            `,
            [userId, postId]
        )
    } catch (error) {
        throw error
    }
}

const findByUserIdAndPostId = async (userId, postId) => {
    try {
        const {rows} = await pool.query(
            `SELECT 1 FROM ${BookmarkModel.BOOKMARK_TABLE}
            WHERE user_id = $1 AND post_id = $2
            `,
            [userId, postId]
        )
        return rows.length > 0
    } catch (error) {
        throw error
    }
}

const hardDelete = async (userId, postId) => {
  try {
    await pool.query(
      `DELETE FROM ${BookmarkModel.BOOKMARK_TABLE}
      WHERE user_id = $1 AND post_id = $2
      `,
      [userId, postId]
    )
  } catch (error) {
    throw error
  }
}

const findByUserId = async ({userId, limit, offset}) => {
  try {
    const {rows} = await pool.query(
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
          -- Location: repost rows have none — fall back to the original's.
          COALESCE(orig.latitude,  p.latitude)  AS latitude,
          COALESCE(orig.longitude, p.longitude) AS longitude,
          COALESCE(orig.place,     p.place)     AS place,
          p.published_at,

          -- Viewer state
          EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) AS is_liked,
          EXISTS(
            SELECT 1 FROM posts rp
            WHERE rp.repost_of_id = p.id AND rp.author_id = $1 AND rp.deleted_at IS NULL
          ) AS is_reposted,

          -- Author
          json_build_object(
              'id', u.id,
              'name', u.name,
              'username', u.username,
              'reposts_enabled', COALESCE(s.allow_reposts, TRUE),
              'avatar_url',
                  CASE
                      WHEN u.avatar_url IS NULL THEN NULL
                      ELSE json_build_object(
                          'cloudfront_url', ua.cloudfront_url
                      )
                  END
          ) AS author,

          -- Community
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
                      ELSE json_build_object(
                          'cloudfront_url', ca.cloudfront_url
                      )
                  END
              )
          END AS community,

          -- Post Media
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
          ON p.id = b.post_id

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
      AND p.deleted_at IS NULL
      AND p.status = 'published'

      GROUP BY
          p.id,
          u.id,
          ua.id,
          c.id,
          ca.id,
          s.user_id,
          b.created_at,
          orig.id

      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset]
    )
    const total = rows[0]?.total || 0;
    const bookmark = rows.map(BookmarkModel.format)
    return { bookmark, total: parseInt(total, 10) };
  } catch (error) {
    throw error
  }
}


module.exports = {
    create,
    findByUserIdAndPostId,
    hardDelete,
    findByUserId
}