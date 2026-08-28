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
            SELECT 1 FROM xp_transactions xt
            WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $1 LIMIT 1)
            AND xt.source_type = 'view_post_' || p.id
          ) AS is_xp_claimed,
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
                          'media_id', pm.id,
                          'media_type', pm.media_type,
                          'media_url', pm.cloudfront_url,
                          'preview_url', pm.preview_url,
                          'width', pm.width,
                          'height', pm.height,
                          'duration_seconds', pm.duration_seconds,
                          'file_size_bytes', pm.size_bytes,
                          'mime_type', pm.mime_type,
                          'has_audio', (pm.media_type = 'video' AND pm.mime_type NOT LIKE '%audio-only%')
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
    const bookmark = rows.map((r) => BookmarkModel.format(r, 'post'));
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
    const bookmark = rows.map((r) => BookmarkModel.format(r, 'profile'));
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
    const bookmark = rows.map((r) => BookmarkModel.format(r, 'community'));
    return { bookmark, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};


const search = async ({ userId, query = '', communities = [], people = [], tags = [], sortBy = 'relevance', timeCutoff = null, requestedType = 'all', limit = 10, offset = 0 }) => {
  try {
    const types = requestedType === 'all' ? ['posts', 'people', 'communities'] : [requestedType];
    const normalizedTypes = types.filter((type) => ['posts', 'people', 'communities'].includes(type));
    const searchQuery = `%${String(query).trim()}%`;

    const queries = {
      posts: {
        sql: `
          SELECT p.*, b.created_at AS bookmarked_at,
            EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) AS is_liked,
          EXISTS(
            SELECT 1 FROM xp_transactions xt
            WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $1 LIMIT 1)
            AND xt.source_type = 'view_post_' || p.id
          ) AS is_xp_claimed,
            EXISTS(SELECT 1 FROM posts rp WHERE rp.repost_of_id = p.id AND rp.author_id = $1 AND rp.deleted_at IS NULL) AS is_reposted,
            COALESCE(json_agg(json_build_object('media_id', m.id, 'media_type', m.media_type, 'media_url', m.cloudfront_url, 'preview_url', m.preview_url, 'width', m.width, 'height', m.height, 'duration_seconds', m.duration_seconds, 'file_size_bytes', m.size_bytes, 'mime_type', m.mime_type, 'has_audio', (m.media_type = 'video' AND m.mime_type NOT LIKE '%audio-only%')) ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]'::json) AS media,
            json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatar_url', CASE WHEN u.avatar_url IS NULL THEN NULL ELSE json_build_object('cloudfront_url', ua.cloudfront_url) END) AS author,
            CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'name', c.name, 'slug', c.slug, 'privacy', c.privacy, 'avatar_url', CASE WHEN c.avatar_url IS NULL THEN NULL ELSE json_build_object('cloudfront_url', ca.cloudfront_url) END) END AS community,
            COUNT(*) OVER() AS total
          FROM bookmark b
          JOIN posts p ON p.id = b.source_id
          JOIN users u ON u.id = p.author_id
          LEFT JOIN media ua ON ua.id = u.avatar_url
          LEFT JOIN communities c ON c.id = p.community_id
          LEFT JOIN media ca ON ca.id = c.avatar_url
          LEFT JOIN media m ON m.post_id = p.id AND m.deleted_at IS NULL
          WHERE b.user_id = $1 AND b.source_type = 'post'
            AND p.deleted_at IS NULL AND p.status = 'published'
            AND ($2 = '' OR p.title ILIKE $2 OR p.content ILIKE $2 OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) t WHERE t ILIKE $2))
            AND ($3::text[] IS NULL OR c.slug = ANY($3::text[]))
            AND ($4::text[] IS NULL OR u.username = ANY($4::text[]))
            AND ($5::text[] IS NULL OR COALESCE(p.tags, ARRAY[]::text[]) && $5::text[])
            AND ($6::timestamptz IS NULL OR p.published_at >= $6)
          GROUP BY p.id, b.created_at, u.id, ua.id, c.id, ca.id
          ORDER BY CASE WHEN $7 = 'top' THEN p.likes_count + p.comments_count * 3 ELSE 0 END DESC, b.created_at DESC 
          LIMIT $8 OFFSET $9`,
        format: (row) => BookmarkModel.format(row, 'post'),
      },
      people: {
        sql: `
          SELECT u.*, b.created_at AS bookmarked_at, um.cloudfront_url AS avatar_cloudfront_url,
            (SELECT COUNT(*) FROM followers f WHERE f.following_id = u.id) AS follower_count,
            (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.deleted_at IS NULL AND p.status = 'published') AS post_count,
            EXISTS(SELECT 1 FROM followers f WHERE f.follower_id = $1 AND f.following_id = u.id) AS is_following,
            COUNT(*) OVER() AS total
          FROM bookmark b
          JOIN users u ON u.id = b.source_id
          LEFT JOIN media um ON um.id = u.avatar_url
          WHERE b.user_id = $1 AND b.source_type = 'profile'
            AND u.deleted_at IS NULL AND u.is_active = TRUE AND u.is_banned = FALSE
            AND ($2 = '' OR u.username ILIKE $2 OR u.name ILIKE $2 OR u.bio ILIKE $2)
            AND ($3::text[] IS NULL OR u.username = ANY($3::text[]))
            AND ($4::timestamptz IS NULL OR b.created_at >= $4)
          ORDER BY CASE WHEN $5 = 'top' THEN u.follower_count ELSE 0 END DESC, b.created_at DESC
          LIMIT $6 OFFSET $7`,
        format: (row) => BookmarkModel.format(row, 'profile'),
      },
      communities: {
        sql: `
          SELECT c.*, b.created_at AS bookmarked_at, cm.cloudfront_url AS avatar_cloudfront_url,
            (SELECT COUNT(*) FROM community_members cm2 WHERE cm2.community_id = c.id) AS member_count,
            (SELECT COUNT(*) FROM posts p WHERE p.community_id = c.id AND p.deleted_at IS NULL AND p.status = 'published') AS post_count,
            EXISTS(SELECT 1 FROM community_members cm3 WHERE cm3.community_id = c.id AND cm3.user_id = $1) AS is_member,
            COUNT(*) OVER() AS total
          FROM bookmark b
          JOIN communities c ON c.id = b.source_id
          LEFT JOIN media cm ON cm.id = c.avatar_url
          WHERE b.user_id = $1 AND b.source_type = 'community'
            AND c.deleted_at IS NULL AND c.is_active = TRUE
            AND ($2 = '' OR c.name ILIKE $2 OR c.slug ILIKE $2 OR c.description ILIKE $2)
            AND ($3::text[] IS NULL OR c.slug = ANY($3::text[]))
            AND ($4::text[] IS NULL OR COALESCE(c.category, ARRAY[]::text[]) && $4::text[])
            AND ($5::timestamptz IS NULL OR b.created_at >= $5)
          ORDER BY CASE WHEN $6 = 'top' THEN c.member_count ELSE 0 END DESC, b.created_at DESC
          LIMIT $7 OFFSET $8`,
        format: (row) => BookmarkModel.format(row, 'community'),
      },
    };

    const results = await Promise.all(normalizedTypes.map(async (type) => {
      const params = type === 'people'
        ? [userId, searchQuery, people.length ? people : null, timeCutoff, sortBy, limit, offset]
        : type === 'communities'
          ? [
            userId,
            searchQuery,
            communities.length ? communities : null,
            tags.length ? tags : null,
            timeCutoff,
            sortBy,
            limit,
            offset,
          ]
          : [
          userId,
          searchQuery,
          communities.length ? communities : null,
          people.length ? people : null,
          tags.length ? tags : null,
          timeCutoff,
          sortBy,
          limit,
          offset,
        ];
      const { rows } = await pool.query(queries[type].sql, params);
      return {
        type,
        rows: rows.map((row) => ({ ...queries[type].format(row), itemType: type })),
        total: Number(rows[0]?.total || 0),
      };
    }));

    return { results, types: ['all', 'posts', 'people', 'communities'], total: results.reduce((sum, result) => sum + result.total, 0) };
  } catch (error) {
    throw error;
  }
}

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
  search,
};
