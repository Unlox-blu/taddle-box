'use strict';

const pool = require('../../config/database');
const SearchModel = require('./search.model');




const searchUser = async (query, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SearchModel.USER_FIELDS}, COUNT(*) OVER() AS total
       FROM ${SearchModel.USER_TABLE} u
       LEFT JOIN media AS ua ON u.avatar_url = ua.id
     WHERE u.deleted_at IS NULL AND u.is_active = TRUE AND u.is_banned = FALSE
       AND ($1 = '' OR username ILIKE $1 OR name ILIKE $1)
     ORDER BY u.follower_count DESC
     LIMIT $2 OFFSET $3`,
      [`%${query}%`, limit, offset]
    );
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
    const { rows } = await pool.query(
      `SELECT ${SearchModel.COMMUNITY_FIELDS}, COUNT(*) OVER() AS total
        FROM ${SearchModel.COMMUNITY_TABLE} c
        LEFT JOIN media AS ca ON c.avatar_url = ca.id
        WHERE c.deleted_at IS NULL AND c.is_active = TRUE AND c.privacy IN ('public', 'restricted')
        AND ($1 = '' OR c.name ILIKE $1 OR c.description ILIKE $1)
        AND ($2::text IS NULL OR $2 = ANY(c.category))
        ORDER BY c.member_count DESC
        LIMIT $3 OFFSET $4`,
      [`%${q}%`, category, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const searchPost = async (query, limit, offset, userId = null) => {
  try {
    const q = query || '';
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
    const { rows } = await pool.query(
      `SELECT ${SearchModel.EVENT_FIELDS}, COUNT(*) OVER() AS total
     FROM ${SearchModel.EVENT_TABLE}
     WHERE deleted_at IS NULL AND status IN ('upcoming', 'ongoing')
       AND ($1 = '' OR title ILIKE $1 OR description ILIKE $1)
       AND ($2::text IS NULL OR event_type = $2)
     ORDER BY start_time ASC
     LIMIT $3 OFFSET $4`,
      [`%${q}%`, eventType, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const searchGame = async (query, limit, offset) => {
  try {
    const q = query || '';
    const { rows } = await pool.query(
      `SELECT ${SearchModel.GAME_FIELDS}, COUNT(*) OVER() AS total
       FROM ${SearchModel.GAME_TABLE}
       WHERE is_active = TRUE
         AND ($1 = '' OR name ILIKE $1 OR slug ILIKE $1)
       ORDER BY CASE WHEN $1 = '' THEN (metadata->>'maxXp')::int END DESC NULLS LAST, created_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${q}%`, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};


const discoverPost = async ({userId, interests, limit, offset}) => {
  try {
    const {rows} = await pool.query(
      `WITH ranked_posts AS (
              SELECT
                  ${SearchModel.POST_FIELDS},
      
                  EXISTS(
                        SELECT 1 FROM post_likes pl 
                        WHERE pl.post_id = p.id AND pl.user_id = $1
                  ) AS is_liked,
      
                  EXISTS(
                        SELECT 1 FROM bookmark bm 
                        WHERE bm.post_id = p.id AND bm.user_id = $1
                  ) AS is_bookmarked,
      
                  EXISTS(
                        SELECT 1 FROM xp_transactions xt 
                        WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $1 LIMIT 1) AND xt.source_type = 'view_post_' || p.id
                  ) AS is_xp_claimed,
      
              -- Trending
                      (
                          p.likes_count
                          + p.comments_count * 3
                          + p.shares_count * 5
                          + p.views_count * 0.05
                      ) /
                      POWER(
                          EXTRACT(EPOCH FROM (NOW() - p.published_at))/3600 + 2,
                          1.4
                      ) AS trending_score,
      
              -- Interests
                      CASE
                          WHEN EXISTS (
                              SELECT 1
                              FROM unnest($2::text[]) i
                              WHERE
                                  LOWER(COALESCE(p.title,'')) LIKE '%' || LOWER(i) || '%'
                                  OR LOWER(COALESCE(p.content,'')) LIKE '%' || LOWER(i) || '%'
                                  OR LOWER(i) = ANY(
                                      ARRAY(
                                          SELECT LOWER(x)
                                          FROM unnest(p.tags) x
                                      )
                                  )
                                  OR LOWER(i) = ANY(
                                      ARRAY(
                                          SELECT LOWER(x)
                                          FROM unnest(p.category) x
                                      )
                                  )
                          )
                          THEN 350
                          ELSE 0
                      END AS interest_score,
      
              -- Freshness
                      CASE
                          WHEN NOW() - p.published_at < interval '6 hour' THEN 250
                          WHEN NOW() - p.published_at < interval '1 day' THEN 150
                          WHEN NOW() - p.published_at < interval '2 day' THEN 75
                          ELSE 0
                      END AS freshness_score,
                
              COALESCE(
              json_agg(
                  json_build_object(
                      'id', m.id,
                      'media_type', m.media_type,
                      'cloudfront_url', m.cloudfront_url,
                      'width', m.width,
                      'height', m.height,
                      's3_key', m.s3_key,
                      'processing_status', m.processing_status
                    ) ORDER BY m.created_at ASC 
                  ) FILTER (WHERE m.id IS NOT NULL AND m.deleted_at IS NULL), 
                  '[]'::json
                ) AS media
      
              FROM posts p
              JOIN users u
                  ON u.id = p.author_id
      
              LEFT JOIN communities c
                  ON p.community_id = c.id
      
              LEFT JOIN media AS ua 
                  ON u.avatar_url = ua.id
      
              LEFT JOIN media AS ca 
                  ON c.avatar_url = ca.id
      
              LEFT JOIN media m 
                  ON p.id = m.post_id
      
              WHERE
      
                p.deleted_at IS NULL
      
                AND p.status = 'published'
      
                AND (
      
                    p.community_id IS NULL
      
                    OR c.privacy = 'public'

                )
      
                AND (
      
                    u.privacy='public'
      
                )

              GROUP BY p.id, u.id, ua.id, c.id, ca.id
      
            )
      
            SELECT ranked_posts.*, COUNT(*) OVER() AS total
            FROM ranked_posts
            ORDER BY
            (
            trending_score
            +
            interest_score
            +
            freshness_score
            ) DESC,
            published_at DESC
            LIMIT $3
            OFFSET $4;`,
            [userId, interests, limit, offset]
    )
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error
  }
}

const discoverCommunity = async ({interests, limit, offset}) => {
  try {
        const { rows } = await pool.query(
          `
          SELECT
              ${SearchModel.COMMUNITY_FIELDS},
              COUNT(*) OVER() AS total
          FROM ${SearchModel.COMMUNITY_TABLE} c
          LEFT JOIN media AS ca
              ON c.avatar_url = ca.id
          WHERE
              c.deleted_at IS NULL
              AND c.is_active = TRUE
              AND (
                  cardinality($1::text[]) = 0
                  OR EXISTS (
                      SELECT 1
                      FROM unnest($1::text[]) AS interest
                      WHERE
                          LOWER(c.name) LIKE '%' || LOWER(interest) || '%'
                          OR LOWER(c.slug) LIKE '%' || LOWER(interest) || '%'
                          OR LOWER(COALESCE(c.description, '')) LIKE '%' || LOWER(interest) || '%'
                          OR EXISTS (
                              SELECT 1
                              FROM unnest(COALESCE(c.category, ARRAY[]::text[])) AS category
                              WHERE LOWER(category) LIKE '%' || LOWER(interest) || '%'
                          )
                  )
              )
          ORDER BY c.member_count DESC
          LIMIT $2
          OFFSET $3
          `,
          [interests, limit, offset]
        );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };  
  } catch (error) {
    throw error
  }
}

const discoverPeople = async ({interests, limit, offset}) => {
  try {
    const {rows} = await pool.query(
      `
      SELECT ${SearchModel.USER_FIELDS}, COUNT(*) OVER() AS total
      FROM ${SearchModel.USER_TABLE} u
      LEFT JOIN media AS ua ON u.avatar_url = ua.id
      WHERE
          u.deleted_at IS NULL
          AND u.is_active = TRUE
          AND u.is_banned = FALSE
          AND EXISTS (
              SELECT 1
              FROM unnest($1::text[]) AS interest
              WHERE EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements_text(COALESCE(u.interests, '[]'::jsonb)) AS user_interest
                  WHERE LOWER(user_interest) LIKE '%' || LOWER(interest) || '%'
              )
          )
      LIMIT $2
      OFFSET $3;
      `,
      [interests, limit, offset]
    )
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error
  }
}


const getHashtags = async (q = '') => {
  try {
    const { rows } = await pool.query(
      `SELECT LOWER(t.tag) AS hashtag, COUNT(*) AS count
       FROM ${SearchModel.POST_TABLE} p
       JOIN users u ON u.id = p.author_id
       CROSS JOIN LATERAL unnest(p.tags) AS t(tag)
       WHERE p.deleted_at IS NULL 
         AND p.status = 'published' 
         AND p.visibility = 'public' 
         AND u.privacy = 'public'
         AND p.tags IS NOT NULL
         AND LOWER(t.tag) ILIKE $1
       GROUP BY LOWER(t.tag)
       ORDER BY count DESC, hashtag ASC
       LIMIT 15`,
       [`%${q}%`]
    );
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

module.exports = {
    searchUser, searchCommunity, searchEvent, searchPost, searchGame, getHashtags, discoverPost, getUserInterests, discoverCommunity, discoverPeople
}