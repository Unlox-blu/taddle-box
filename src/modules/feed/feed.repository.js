'use strict';

const pool = require('../../config/database');
const PostModel = require('./feed.model');
const FEED_ALGO = require('./feed.algorithm')

// const getPersonalizedPosts = async ({userId, followingIds, prefCategory, prefTags, seenIds, limit, offset, hashtag}) => {
//   try {
//     const { rows } = await pool.query(
//       `SELECT ${PostModel.LIST_FIELDS},
//        EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) AS is_liked,
//        EXISTS(SELECT 1 FROM bookmark bm WHERE bm.post_id = p.id AND bm.user_id = $1) AS is_bookmarked,
//        EXISTS(
//          SELECT 1 FROM xp_transactions xt
//          WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $1 LIMIT 1)
//          AND xt.source_type = 'view_post_' || p.id
//        ) AS is_xp_claimed,
//        (CASE WHEN p.author_id = ANY($2::uuid[]) THEN 10 ELSE 0 END
//         + EXTRACT(EPOCH FROM (NOW() - p.published_at)) / -3600.0 * 0.5
//         + p.likes_count * 0.3 + p.comments_count * 0.5) AS score,
//         COALESCE(
//             json_agg(
//                 json_build_object(
//                     'id', m.id,
//                     'media_type', m.media_type,
//                     'cloudfront_url', m.cloudfront_url,
//                     'width', m.width,
//                     'height', m.height,
//                     's3_key', m.s3_key,
//                     'processing_status', m.processing_status
//                 ) ORDER BY m.created_at ASC 
//             ) FILTER (WHERE m.id IS NOT NULL AND m.deleted_at IS NULL), 
//             '[]'::json
//         ) AS media,
//        COUNT(*) OVER() AS total
//      FROM ${PostModel.TABLE} p
//      JOIN users u ON u.id = p.author_id
//      LEFT JOIN media AS ua ON u.avatar_url = ua.id
//      LEFT JOIN communities AS c ON p.community_id = c.id
//      LEFT JOIN media AS ca ON c.avatar_url = ca.id
//      LEFT JOIN media m ON p.id = m.post_id
//      WHERE p.deleted_at IS NULL
//        AND p.status = 'published'
//        AND p.visibility IN ('public', 'community_only')
//        AND (
//            p.community_id IS NULL 
//            OR c.privacy = 'public' 
//            OR EXISTS (SELECT 1 FROM community_members cm WHERE cm.community_id = p.community_id AND cm.user_id = $1 AND cm.status = 'active')
//        )
//        AND p.id <> ALL($3::uuid[])
//        -- Private accounts: only show their posts to the author, followers, or the viewer
//        AND (u.privacy = 'public' OR p.author_id = $1 OR p.author_id = ANY($2::uuid[]))
//        AND (p.author_id = ANY($2::uuid[]) OR p.author_id != $1 OR p.category && $4 OR p.tags && $5)
//        AND ($8::text IS NULL OR $8::text = ANY(p.tags))
//      GROUP BY p.id, u.id, ua.id, c.id, ca.id
//      ORDER BY score DESC
//      LIMIT $6 OFFSET $7`,
//       [userId, followingIds, seenIds, prefCategory, prefTags, limit, offset, hashtag]
//     );
//     const total = rows[0]?.total || 0;
//     return { rows, total: parseInt(total, 10) };
//   } catch (error) {
//     throw error;
//   }
// };


const getPersonalizedPosts = async ({userId, followingId, communityId, prefCategory, prefTags, interests, seenPostId, hashtag, limit, offset}) => {
  try {
    const { rows } = await pool.query(
<<<<<<< HEAD
      FEED_ALGO.FEED_ALGORITHM,
=======
      `WITH ranked_posts AS (
        SELECT
            ${PostModel.LIST_FIELDS},

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

            EXISTS(
                  SELECT 1 FROM posts rp
                  WHERE rp.repost_of_id = p.id AND rp.author_id = $1 AND rp.deleted_at IS NULL
            ) AS is_reposted,
            COALESCE(s.allow_reposts, TRUE) AS author_reposts_enabled,

        -- Following
                CASE
                    WHEN p.author_id = ANY($2::uuid[]) THEN 10000
                    ELSE 0
                END AS following_score,

        -- Community
                CASE
                  WHEN p.community_id = ANY($3::uuid[])
                  THEN 8000
                  ELSE 0
                END AS community_score,

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

        -- Preferred category
                CASE
                    WHEN p.category && $4 THEN 500
                    ELSE 0
                END AS category_score,

        -- Preferred tags
                CASE
                    WHEN p.tags && $5 THEN 450
                    ELSE 0
                END AS tag_score,

        -- Interests
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM unnest($6::text[]) i
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

        -- Seen penalty
                CASE
                    WHEN p.id = ANY($7::uuid[]) THEN -4000
                    ELSE 0
                END AS seen_penalty,
          
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

        LEFT JOIN settings s
            ON s.user_id = u.id

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

              OR p.community_id = ANY($3::uuid[])

          )

          AND (

              u.privacy='public'

              OR p.author_id=$1

              OR p.author_id = ANY($2::uuid[])

          )

        -- Audience: own posts, public posts, community posts (public community
        -- OR joined community), and followers-only posts from followed users.
          AND (

              p.author_id = $1

              OR p.visibility = 'public'

              OR (p.visibility = 'community_only' AND (c.privacy = 'public' OR p.community_id = ANY($3::uuid[])))

              OR (p.visibility = 'followers' AND p.author_id = ANY($2::uuid[]))

          )

        -- hashtag
          AND (

              $8::text IS NULL

              OR p.tags @> ARRAY[$8::text]

          )
        GROUP BY p.id, u.id, ua.id, c.id, ca.id, s.user_id

      )

      SELECT ranked_posts.*, COUNT(*) OVER() AS total
      FROM ranked_posts
      ORDER BY
      (
      following_score
      +
      community_score
      +
      trending_score
      +
      category_score
      +
      tag_score
      +
      interest_score
      +
      freshness_score
      +
      seen_penalty
      ) DESC,
      published_at DESC
      LIMIT $9
      OFFSET $10;`,
>>>>>>> 1ff14170fc46c7b2bd64020bd43092273a384ba3
      [userId, followingId, communityId, prefCategory, prefTags, interests, seenPostId, hashtag, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
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
    )
    const category = rows[0]?.category ?? [];
    const tags = rows[0]?.tags ?? [];
    return {category, tags}
  } catch (error) {
    throw error
  }
}

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
  getPersonalizedPosts,
  recordInteraction,
  upsertUserPreferences,
  getUserPreferences,
  getUserInterests,
  findFollowers,
  findFollowingCommunity,
};
