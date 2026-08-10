const PostModel = require('./feed.model');


const FEED_ALGORITHMM =  `WITH ranked_posts AS (
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

                                    OR p.tags @> ARRAY[$8::text]

                                )
                                GROUP BY p.id, u.id, ua.id, c.id, ca.id

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
                            OFFSET $10;`

const FEED_ALGORITHM =  `WITH ranked_posts AS (
                                    SELECT
                                        ${PostModel.LIST_FIELDS},

                                        EXISTS(
                                            SELECT 1
                                            FROM post_likes pl
                                            WHERE pl.post_id = p.id
                                            AND pl.user_id = $1
                                        ) AS is_liked,

                                        EXISTS(
                                            SELECT 1
                                            FROM bookmark bm
                                            WHERE bm.post_id = p.id
                                            AND bm.user_id = $1
                                        ) AS is_bookmarked,

                                        EXISTS(
                                            SELECT 1
                                            FROM xp_transactions xt
                                            WHERE xt.xp_id = (
                                                SELECT id
                                                FROM xp
                                                WHERE user_id = $1
                                                LIMIT 1
                                            )
                                            AND xt.source_type = 'view_post_' || p.id
                                        ) AS is_xp_claimed,

                                        -- Following
                                        CASE
                                            WHEN p.author_id = ANY($2::uuid[]) THEN 10000
                                            ELSE 0
                                        END AS following_score,

                                        -- Community
                                        CASE
                                            WHEN p.community_id = ANY($3::uuid[]) THEN 8000
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
                                                    LOWER(COALESCE(p.title, '')) LIKE '%' || LOWER(i) || '%'
                                                    OR LOWER(COALESCE(p.content, '')) LIKE '%' || LOWER(i) || '%'

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

                                        -- Main post media
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
                                                )
                                                ORDER BY m.created_at ASC
                                            )
                                            FILTER (
                                                WHERE m.id IS NOT NULL
                                                AND m.deleted_at IS NULL
                                            ),
                                            '[]'::json
                                        ) AS media,

                                        -- Parent / repost data
                                        rp.repost_data

                                    FROM posts p

                                    JOIN users u
                                        ON u.id = p.author_id

                                    LEFT JOIN communities c
                                        ON p.community_id = c.id

                                    LEFT JOIN media ua
                                        ON u.avatar_url = ua.id

                                    LEFT JOIN media ca
                                        ON c.avatar_url = ca.id

                                    LEFT JOIN media m
                                        ON p.id = m.post_id

                                    /*
                                    * Parent post.
                                    *
                                    * IMPORTANT:
                                    * There are NO privacy/status/community visibility checks here.
                                    * We simply fetch the post referenced by repost_of_id.
                                    */
                                    LEFT JOIN LATERAL (
                                        SELECT
                                            jsonb_build_object(

                                                'id', parent.id,
                                                'author_id', parent.author_id,
                                                'community_id', parent.community_id,
                                                'repost_of_id', parent.repost_of_id,

                                                'title', parent.title,
                                                'content', parent.content,

                                                'media', COALESCE(
                                                    (
                                                        SELECT json_agg(
                                                            json_build_object(
                                                                'id', pm.id,
                                                                'media_type', pm.media_type,
                                                                'cloudfront_url', pm.cloudfront_url,
                                                                'width', pm.width,
                                                                'height', pm.height,
                                                                's3_key', pm.s3_key,
                                                                'processing_status', pm.processing_status
                                                            )
                                                            ORDER BY pm.created_at ASC
                                                        )
                                                        FROM media pm
                                                        WHERE pm.post_id = parent.id
                                                        AND pm.deleted_at IS NULL
                                                    ),
                                                    '[]'::json
                                                ),

                                                'tags', parent.tags,
                                                'category', parent.category,

                                                'status', parent.status,
                                                'visibility', parent.visibility,

                                                'likes_count', parent.likes_count,
                                                'comments_count', parent.comments_count,
                                                'shares_count', parent.shares_count,
                                                'views_count', parent.views_count,

                                                'is_pinned', parent.is_pinned,
                                                'published_at', parent.published_at,
                                                'created_at', parent.created_at,
                                                'updated_at', parent.updated_at,

                                                'author', json_build_object(
                                                    'id', parent.author_id,
                                                    'name', parent_user.name,
                                                    'username', parent_user.username,
                                                    'avatarUrl', parent_author_avatar.cloudfront_url,
                                                    'isVerified', parent_user.is_verified
                                                ),

                                                'community',
                                                    CASE
                                                        WHEN parent.community_id IS NOT NULL THEN
                                                            json_build_object(
                                                                'id', parent.community_id,
                                                                'name', parent_community.name,
                                                                'slug', parent_community.slug,
                                                                'avatarUrl',
                                                                    parent_community_avatar.cloudfront_url,
                                                                'privacy', parent_community.privacy
                                                            )
                                                        ELSE NULL
                                                    END

                                            ) AS repost_data

                                        FROM posts parent

                                        LEFT JOIN users parent_user
                                            ON parent_user.id = parent.author_id

                                        LEFT JOIN media parent_author_avatar
                                            ON parent_user.avatar_url = parent_author_avatar.id

                                        LEFT JOIN communities parent_community
                                            ON parent.community_id = parent_community.id

                                        LEFT JOIN media parent_community_avatar
                                            ON parent_community.avatar_url = parent_community_avatar.id

                                        WHERE parent.id = p.repost_of_id

                                    ) rp
                                        ON TRUE

                                    WHERE

                                        -- Main post filters
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

                                        -- Hashtag
                                        AND (
                                            $8::text IS NULL
                                            OR p.tags @> ARRAY[$8::text]
                                        )

                                    GROUP BY
                                        p.id,
                                        u.id,
                                        ua.id,
                                        c.id,
                                        ca.id,
                                        rp.repost_data
                                )

                                SELECT
                                    ranked_posts.*,
                                    COUNT(*) OVER() AS total

                                FROM ranked_posts

                                ORDER BY
                                    (
                                        following_score
                                        + community_score
                                        + trending_score
                                        + category_score
                                        + tag_score
                                        + interest_score
                                        + freshness_score
                                        + seen_penalty
                                    ) DESC,
                                    published_at DESC

                                LIMIT $9
                                OFFSET $10;`

module.exports = {FEED_ALGORITHM}                            