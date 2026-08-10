const SearchModel = require('./search.model');

const SEARCH_USER_ALGORITHM = `SELECT 
                                    ${SearchModel.USER_FIELDS}, 
                                    COUNT(*) OVER() AS total
                                FROM 
                                    ${SearchModel.USER_TABLE} u
                                LEFT JOIN 
                                    media AS ua ON u.avatar_url = ua.id
                                WHERE 
                                    u.deleted_at IS NULL 
                                    AND u.is_active = TRUE 
                                    AND u.is_banned = FALSE
                                    AND ($1 = '' OR username ILIKE $1 OR name ILIKE $1)
                                ORDER BY u.follower_count DESC
                                LIMIT $2 OFFSET $3`

const SEARCH_COMMUNITY_ALGORITHM = `SELECT 
                                        ${SearchModel.COMMUNITY_FIELDS}, 
                                        COUNT(*) OVER() AS total
                                    FROM 
                                        ${SearchModel.COMMUNITY_TABLE} c
                                    LEFT JOIN 
                                        media AS ca ON c.avatar_url = ca.id
                                    WHERE 
                                        c.deleted_at IS NULL 
                                        AND c.is_active = TRUE 
                                        AND c.privacy IN ('public', 'restricted')
                                        AND ($1 = '' OR c.name ILIKE $1 OR c.description ILIKE $1)
                                        AND ($2::text IS NULL OR $2 = ANY(c.category))
                                    ORDER BY c.member_count DESC
                                    LIMIT $3 OFFSET $4`

const SEARCH_POSt_ALGORITHM = `SELECT
                                ${SearchModel.POST_FIELDS},
                                EXISTS(
                                    SELECT 1 FROM post_likes pl 
                                    WHERE pl.post_id = p.id AND pl.user_id = $4
                                ) AS is_liked,

                                EXISTS(
                                    SELECT 1 FROM bookmark bm 
                                    WHERE bm.post_id = p.id AND bm.user_id = $4
                                ) AS is_bookmarked,

                                EXISTS(
                                    SELECT 1 FROM xp_transactions xt 
                                    WHERE xt.xp_id = (SELECT id FROM xp WHERE user_id = $4 LIMIT 1) AND xt.source_type = 'view_post_' || p.id
                                ) AS is_xp_claimed,                                
                                COALESCE(
                                    json_agg(
                                        json_build_object(
                                            'id', m.id,
                                            'media_type', m.media_type,
                                            'cloudfront_url', m.cloudfront_url,
                                            'width', m.width,
                                            'height', m.height,
                                            'processing_status', m.processing_status
                                        )
                                        ORDER BY m.created_at
                                    ) FILTER (
                                        WHERE m.id IS NOT NULL
                                        AND m.deleted_at IS NULL
                                    ),
                                    '[]'::json
                                ) AS media,
                                (
                                    -- Exact title
                                    CASE
                                        WHEN LOWER(p.title) = LOWER($5) THEN 10000
                                        WHEN LOWER(p.title) LIKE LOWER($5) || '%' THEN 7000
                                        WHEN p.title ILIKE $1 THEN 5000
                                        ELSE 0
                                    END
                                    -- Tags
                                    + CASE
                                        WHEN EXISTS (
                                            SELECT 1
                                            FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) t
                                            WHERE t ILIKE $1
                                        )
                                        THEN 4000
                                        ELSE 0
                                    END
                                    -- Content
                                    + CASE
                                        WHEN p.content ILIKE $1 THEN 2500
                                        ELSE 0
                                    END
                                    -- Popularity
                                    + (p.likes_count * 2)
                                    + (p.comments_count * 3)
                                    -- Freshness (100 → 0 over 100 days)
                                    + GREATEST(
                                        100 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400,
                                        0
                                    )
                                ) AS score,
                                COUNT(*) OVER() AS total
                            FROM posts p
                            JOIN users u
                                ON u.id = p.author_id
                            LEFT JOIN media ua
                                ON u.avatar_url = ua.id
                            LEFT JOIN communities c
                                ON c.id = p.community_id
                            LEFT JOIN media ca
                                ON ca.id = c.avatar_url
                            LEFT JOIN media m
                                ON m.post_id = p.id
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
                                    p.visibility = 'public'
                                    OR (
                                        p.visibility = 'community_only'
                                        AND c.privacy != 'private'
                                    )
                                    OR (
                                        p.visibility = 'community_only'
                                        OR EXISTS (
                                        SELECT 1
                                        FROM community_members cm
                                        WHERE 
                                            cm.community_id = p.community_id 
                                            AND cm.user_id = $4
                                    )
                                    )
                                )
                                AND (
                                    $1 = ''
                                    OR p.title ILIKE $1
                                    OR p.content ILIKE $1
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) t
                                        WHERE t ILIKE $1
                                    )
                                )
                                -- Private account visibility
                                AND (
                                    u.privacy = 'public'
                                    OR p.author_id = $4
                                    OR EXISTS (
                                        SELECT 1
                                        FROM followers f
                                        WHERE
                                            f.follower_id = $4
                                            AND f.following_id = p.author_id
                                            AND f.status = 'active'
                                    )
                                )
                            GROUP BY
                                p.id,
                                u.id,
                                ua.id,
                                c.id,
                                ca.id
                            ORDER BY
                                CASE
                                    WHEN $5 = '' THEN
                                        (p.likes_count * 2 + p.comments_count * 3)
                                    ELSE
                                        (
                                            CASE
                                                WHEN LOWER(p.title) = LOWER($5) THEN 10000
                                                WHEN LOWER(p.title) LIKE LOWER($5) || '%' THEN 7000
                                                WHEN p.title ILIKE $1 THEN 5000
                                                ELSE 0
                                            END
                                            +
                                            CASE
                                                WHEN EXISTS (
                                                    SELECT 1
                                                    FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) t
                                                    WHERE t ILIKE $1
                                                )
                                                THEN 4000
                                                ELSE 0
                                            END
                                            +
                                            CASE
                                                WHEN p.content ILIKE $1 THEN 2500
                                                ELSE 0
                                            END
                                            + (p.likes_count * 2)
                                            + (p.comments_count * 3)
                                            + GREATEST(
                                                100 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400,
                                                0
                                            )
                                        )
                                END DESC,
                                p.created_at DESC
                            LIMIT $2
                            OFFSET $3;`   
                            
const SEARCH_EVENT_ALGORITHM = `SELECT 
                                    ${SearchModel.EVENT_FIELDS}, 
                                    COUNT(*) OVER() AS total
                                FROM 
                                    ${SearchModel.EVENT_TABLE}
                                WHERE 
                                    deleted_at IS NULL 
                                    AND status IN ('upcoming', 'ongoing')
                                    AND ($1 = '' OR title ILIKE $1 OR description ILIKE $1)
                                    AND ($2::text IS NULL OR event_type = $2)
                                ORDER BY start_time ASC
                                LIMIT $3 OFFSET $4`      
                                
const SEARCH_GAMES_ALGORITHM = `SELECT 
                                    ${SearchModel.GAME_FIELDS}, 
                                    COUNT(*) OVER() AS total
                                FROM ${SearchModel.GAME_TABLE}
                                WHERE 
                                    is_active = TRUE
                                    AND ($1 = '' OR name ILIKE $1 OR slug ILIKE $1)
                                ORDER BY CASE WHEN $1 = '' THEN (metadata->>'maxXp')::int END DESC NULLS LAST, created_at DESC
                                LIMIT $2 OFFSET $3`          
                                
const DISCOVER_POSTS_ALGORITHM = `WITH ranked_posts AS (
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
                                    
                                                -- Reposts whose ORIGINAL is gone are hidden.
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
                                            OFFSET $4;`    
                                            
const DISCOVER_COMMUNITY_ALGORITHM =  `
                                        SELECT
                                            ${SearchModel.COMMUNITY_FIELDS},
                                            COUNT(*) OVER() AS total,

                                            (
                                                -- Interest score (1000 points per matched interest)
                                                (
                                                    SELECT COUNT(*) * 1000
                                                    FROM unnest($2::text[]) AS interest
                                                    WHERE
                                                        LOWER(c.name) LIKE '%' || LOWER(interest) || '%'
                                                        OR LOWER(c.slug) LIKE '%' || LOWER(interest) || '%'
                                                        OR LOWER(COALESCE(c.description, '')) LIKE '%' || LOWER(interest) || '%'
                                                        OR EXISTS (
                                                            SELECT 1
                                                            FROM unnest(COALESCE(c.category, ARRAY[]::text[])) category
                                                            WHERE LOWER(category) LIKE '%' || LOWER(interest) || '%'
                                                        )
                                                )

                                                -- Popularity score
                                                + LEAST(c.member_count / 10, 500)

                                                -- New community bonus (max 100)
                                                + GREATEST(
                                                    100 - EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400,
                                                    0
                                                )

                                            ) AS score

                                        FROM ${SearchModel.COMMUNITY_TABLE} c
                                        LEFT JOIN media ca
                                            ON c.avatar_url = ca.id

                                        WHERE
                                            c.id != ALL($1::uuid[])
                                            AND c.deleted_at IS NULL
                                            AND c.is_active = TRUE

                                        ORDER BY
                                            score DESC,
                                            c.member_count DESC,
                                            c.created_at DESC

                                        LIMIT $3
                                        OFFSET $4;
                                        `                                            

const DISCOVER_PEOPLE_ALGORITHM = `
                                    SELECT ${SearchModel.USER_FIELDS}, COUNT(*) OVER() AS total
                                    FROM ${SearchModel.USER_TABLE} u
                                    LEFT JOIN media AS ua ON u.avatar_url = ua.id
                                    WHERE
                                        u.id != ALL($1::uuid[])
                                        AND u.id != $2::uuid
                                        AND u.deleted_at IS NULL
                                        AND u.is_active = TRUE
                                        AND u.is_banned = FALSE
                                        AND EXISTS (
                                            SELECT 1
                                            FROM unnest($3::text[]) AS interest
                                            WHERE EXISTS (
                                                SELECT 1
                                                FROM jsonb_array_elements_text(COALESCE(u.interests, '[]'::jsonb)) AS user_interest
                                                WHERE LOWER(user_interest) LIKE '%' || LOWER(interest) || '%'
                                            )
                                        )
                                    LIMIT $4
                                    OFFSET $5;
                                    `                                        

const HASHTAGS_ALGORITHM = `SELECT
                                LOWER(TRIM(t.tag)) AS hashtag,
                                COUNT(DISTINCT p.id) AS count,
                                MAX(p.published_at) AS latest_post_at
                            FROM posts p
                            CROSS JOIN LATERAL unnest(p.tags) AS t(tag)
                            WHERE
                                p.tags IS NOT NULL
                                AND p.deleted_at IS NULL
                                AND p.status = 'published'
                                AND (
                                    $1 = ''
                                    OR LOWER(TRIM(t.tag)) ILIKE '%' || LOWER(TRIM($1)) || '%'
                                )
                            GROUP BY LOWER(TRIM(t.tag))
                            ORDER BY
                                CASE WHEN $1 = '' THEN MAX(p.published_at) END DESC,
                                count DESC,
                                hashtag ASC
                            LIMIT 15;`         
                    
module.exports = {SEARCH_USER_ALGORITHM, SEARCH_COMMUNITY_ALGORITHM, SEARCH_POSt_ALGORITHM, SEARCH_EVENT_ALGORITHM, SEARCH_GAMES_ALGORITHM, DISCOVER_POSTS_ALGORITHM, DISCOVER_COMMUNITY_ALGORITHM, DISCOVER_PEOPLE_ALGORITHM, HASHTAGS_ALGORITHM}                            