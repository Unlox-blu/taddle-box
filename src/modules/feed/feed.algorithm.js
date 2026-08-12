const PostModel = require('./feed.model');

const FEED_ALGORITHM = `WITH ranked_posts AS (
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
                                        WHERE bm.post_id = p.id AND bm.user_id = $1
                                    ) AS is_bookmarked,

                                    EXISTS(
                                        SELECT 1 FROM xp_transactions xt 
                                        WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $1 LIMIT 1) AND xt.source_type = 'view_post_' || p.id
                                    ) AS is_xp_claimed,

                                    -- Whether the viewing user reposted this post
                                    -- (drives the filled repeat icon + tick on
                                    -- feed cards). Mirrors the post repository's
                                    -- subquery — a repost by this user, any
                                    -- audience, not deleted.
                                    EXISTS(
                                        SELECT 1 FROM posts rp
                                        WHERE rp.repost_of_id = p.id
                                          AND rp.author_id = $1
                                          AND rp.deleted_at IS NULL
                                    ) AS is_reposted,

                                    -- Which poll option the viewing user voted for
                                    -- (NULL for non-voters) so feed cards can
                                    -- highlight their saved selection immediately.
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
                                ) AS media,

                                -- Location: repost rows carry no place of their
                                -- own, so fall back to the ORIGINAL post's
                                -- lat/lon/place (the card's rolling text shows
                                -- the original's tag on reposts).
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
                                    ON p.id = m.post_id

                                WHERE

                                p.deleted_at IS NULL

                                AND p.status = 'published'

                                -- Reposts whose ORIGINAL is gone (deleted /
                                -- unpublished) are hidden — nothing to show.
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
                            OFFSET $10;`;

module.exports = { FEED_ALGORITHM };
