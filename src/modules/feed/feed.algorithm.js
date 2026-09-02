const PostModel = require('./feed.model');

const FEED_ALGORITHM = `WITH scored_posts AS (
                                SELECT
                                    ${PostModel.LIST_FIELDS},

                                    -- Repost toggles: author-level (settings) and
                                    -- community-level (owner-controlled). Both ride
                                    -- every feed row so cards can hide the repost
                                    -- button when either is off.
                                    COALESCE(s.allow_reposts, TRUE) AS author_reposts_enabled,
                                    COALESCE(c.allow_reposts, TRUE) AS community_reposts_enabled,

                                    EXISTS(
                                        SELECT 1 FROM post_likes pl 
                                        WHERE pl.post_id = p.id AND pl.user_id = $1
                                    ) AS is_liked,

                                    EXISTS(
                                        SELECT 1 FROM bookmark bm 
                                        WHERE bm.source_id = p.id AND bm.source_type = 'post' AND bm.user_id = $1
                                    ) AS is_bookmarked,

                                    EXISTS(
                                        SELECT 1 FROM xp_transactions xt 
                                        WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $1 LIMIT 1) AND xt.source_type = 'view_post_' || p.id
                                    ) AS is_xp_claimed,

                                    -- Whether the viewing user reposted this post
                                    EXISTS(
                                        SELECT 1 FROM posts rp
                                        WHERE rp.repost_of_id = p.id
                                          AND rp.author_id = $1
                                          AND rp.deleted_at IS NULL
                                    ) AS is_reposted,

                                    -- Which poll option the viewing user voted for
                                    (
                                        SELECT pv.option_index FROM poll_votes pv
                                        WHERE pv.post_id = p.id AND pv.user_id = $1 LIMIT 1
                                    ) AS my_poll_vote,

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

                                -- Total score (for cursor-based pagination)
                                (
                                    CASE WHEN p.author_id = ANY($2::uuid[]) THEN 10000 ELSE 0 END
                                    + CASE WHEN p.community_id = ANY($3::uuid[]) THEN 8000 ELSE 0 END
                                    + (
                                        p.likes_count + p.comments_count * 3 + p.shares_count * 5 + p.views_count * 0.05
                                    ) / POWER(EXTRACT(EPOCH FROM (NOW() - p.published_at))/3600 + 2, 1.4)
                                    + CASE WHEN p.category && $4 THEN 500 ELSE 0 END
                                    + CASE WHEN p.tags && $5 THEN 450 ELSE 0 END
                                    + CASE WHEN EXISTS (
                                        SELECT 1 FROM unnest($6::text[]) i
                                        WHERE LOWER(COALESCE(p.title,'')) LIKE '%' || LOWER(i) || '%'
                                           OR LOWER(COALESCE(p.content,'')) LIKE '%' || LOWER(i) || '%'
                                           OR LOWER(i) = ANY(ARRAY(SELECT LOWER(x) FROM unnest(p.tags) x))
                                           OR LOWER(i) = ANY(ARRAY(SELECT LOWER(x) FROM unnest(p.category) x))
                                    ) THEN 350 ELSE 0 END
                                    + CASE
                                        WHEN NOW() - p.published_at < interval '6 hour' THEN 250
                                        WHEN NOW() - p.published_at < interval '1 day' THEN 150
                                        WHEN NOW() - p.published_at < interval '2 day' THEN 75
                                        ELSE 0
                                    END
                                    + CASE WHEN p.id = ANY($7::uuid[]) THEN -4000 ELSE 0 END
                                ) AS total_score,

                                COALESCE(
                                json_agg(
                                    json_build_object(
                                        'media_id', m.id,
                                        'media_type', m.media_type,
                                        'media_url', m.cloudfront_url,
                                        'preview_url', m.preview_url,
                                        'width', m.width,
                                        'height', m.height,
                                        'duration_seconds', m.duration_seconds,
                                        'file_size_bytes', m.size_bytes,
                                        'mime_type', m.mime_type,
                                        'has_audio', (m.media_type = 'video' AND m.mime_type NOT LIKE '%audio-only%')
                                    ) ORDER BY m.created_at ASC 
                                    ) FILTER (WHERE m.id IS NOT NULL AND m.deleted_at IS NULL), 
                                    '[]'::json
                                ) AS media,

                                -- Location
                                COALESCE(orig.latitude,  p.latitude)  AS latitude,
                                COALESCE(orig.longitude, p.longitude) AS longitude,
                                COALESCE(orig.place,     p.place)     AS place

                                FROM posts p
                                JOIN users u
                                    ON u.id = p.author_id

                                LEFT JOIN posts orig
                                    ON orig.id = p.repost_of_id
                                       AND orig.deleted_at IS NULL
                                       AND orig.status = 'published'

                                LEFT JOIN communities c
                                    ON p.community_id = c.id

                                LEFT JOIN settings AS s
                                    ON s.user_id = u.id

                                LEFT JOIN media AS ua 
                                    ON u.avatar_url = ua.id

                                LEFT JOIN media AS ca 
                                    ON c.avatar_url = ca.id

                                LEFT JOIN media m 
                                    ON COALESCE(orig.id, p.id) = m.post_id

                                WHERE

                                p.deleted_at IS NULL

                                AND p.status = 'published'

                                AND (
                                    p.repost_of_id IS NULL
                                    OR EXISTS (
                                        SELECT 1 FROM posts orig
                                        WHERE orig.id = p.repost_of_id
                                          AND orig.deleted_at IS NULL
                                          AND orig.status = 'published'
                                    )
                                )

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

                                -- hashtag
                                AND (
                                    $8::text IS NULL
                                    OR EXISTS (SELECT 1 FROM unnest(p.tags) AS tag WHERE tag ILIKE '%' || $8::text || '%')
                                )

                                GROUP BY p.id, u.id, ua.id, c.id, ca.id, s.user_id, orig.id

                            ),
                            ranked_posts AS (
                                SELECT * FROM scored_posts
                                WHERE
                                -- CURSOR: ranked feed pagination (score-based)
                                -- $11 = cursor total_score, $12 = cursor published_at, $13 = cursor id
                                (
                                    $11::float IS NULL
                                    OR total_score < $11::float
                                    OR (total_score = $11::float AND published_at < $12::timestamptz)
                                    OR (total_score = $11::float AND published_at = $12::timestamptz AND id < $13::uuid)
                                )

                                -- CURSOR: newer posts (refresh / pull-to-refresh)
                                -- $14 = newer_cursor published_at, $15 = newer_cursor id
                                AND (
                                    $14::timestamptz IS NULL
                                    OR published_at > $14::timestamptz
                                    OR (published_at = $14::timestamptz AND id > $15::uuid)
                                )
                            )

                            SELECT ranked_posts.*, COUNT(*) OVER() AS total
                            FROM ranked_posts
                            ORDER BY
                                total_score DESC,
                            published_at DESC
                            LIMIT $9
                            OFFSET $10;`;

// User-personalized trending hashtags for the Home trending-chips row.
const TRENDING_HASHTAGS_ALGORITHM = `WITH ranked_posts AS (
                                    SELECT
                                        p.id,
                                        p.tags,
                                        p.published_at,

                                        CASE
                                            WHEN p.author_id = ANY($2::uuid[]) THEN 10000
                                            ELSE 0
                                        END AS following_score,

                                        CASE
                                        WHEN p.community_id = ANY($3::uuid[])
                                        THEN 8000
                                        ELSE 0
                                        END AS community_score,

                                        CASE
                                        WHEN p.tags && $4 THEN 450
                                        ELSE 0
                                        END AS tag_score,

                                        CASE
                                            WHEN EXISTS (
                                                SELECT 1
                                                FROM unnest($5::text[]) i
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

                                        (
                                            p.likes_count
                                            + p.comments_count * 3
                                            + p.shares_count * 5
                                            + p.views_count * 0.05
                                        ) /
                                        POWER(
                                            EXTRACT(EPOCH FROM (NOW() - p.published_at))/3600 + 2,
                                            1.4
                                        ) AS trending_score

                                    FROM posts p
                                    JOIN users u ON u.id = p.author_id
                                    LEFT JOIN communities c ON p.community_id = c.id
                                    WHERE
                                        p.deleted_at IS NULL
                                        AND p.status = 'published'
                                        AND (
                                            p.community_id IS NULL
                                            OR c.privacy = 'public'
                                            OR p.community_id = ANY($3::uuid[])
                                        )
                                        AND (
                                            u.privacy = 'public'
                                            OR p.author_id = $1
                                            OR p.author_id = ANY($2::uuid[])
                                        )
                                        AND p.tags IS NOT NULL
                                )
                                SELECT
                                    LOWER(TRIM(t.tag)) AS hashtag,
                                    COUNT(DISTINCT rp.id) AS count,
                                    MAX(rp.published_at) AS latest_post_at
                                FROM ranked_posts rp
                                CROSS JOIN LATERAL unnest(rp.tags) AS t(tag)
                                WHERE TRIM(t.tag) <> ''
                                GROUP BY LOWER(TRIM(t.tag))
                                ORDER BY
                                    SUM(
                                        rp.following_score
                                        + rp.community_score
                                        + rp.tag_score
                                        + rp.interest_score
                                    ) DESC,
                                    SUM(rp.trending_score) DESC,
                                    latest_post_at DESC,
                                    hashtag ASC
                                LIMIT $6;`;

module.exports = { FEED_ALGORITHM, TRENDING_HASHTAGS_ALGORITHM };
