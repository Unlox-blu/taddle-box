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
                                LIMIT $2 OFFSET $3`;

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
                                        -- Private communities are discoverable (their content is gated on the detail screen)
                                        AND ($1 = '' OR c.name ILIKE $1 OR c.description ILIKE $1)
                                        AND ($2::text IS NULL OR $2 = ANY(c.category))
                                    ORDER BY c.member_count DESC
                                    LIMIT $3 OFFSET $4`;

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
                                CASE WHEN $5 != '' THEN
                                  ts_headline('english', p.content, plainto_tsquery('english', $5), 'StartSel=<mark>, StopSel=</mark>')
                                ELSE NULL END AS highlight_content,
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
                                    -- Content FTS
                                    + CASE
                                        WHEN p.search_vector @@ plainto_tsquery('english', $5) THEN ts_rank(p.search_vector, plainto_tsquery('english', $5)) * 3000
                                        WHEN p.content ILIKE $1 THEN 2500
                                        ELSE 0
                                    END
                                    -- Repost whose ORIGINAL matches (verbatim
                                    -- reposts carry no text of their own)
                                    + CASE
                                        WHEN p.repost_of_id IS NOT NULL AND EXISTS (
                                            SELECT 1 FROM posts orig
                                            WHERE orig.id = p.repost_of_id
                                              AND orig.deleted_at IS NULL
                                              AND orig.status = 'published'
                                              AND (
                                                  orig.title ILIKE $1
                                                  OR orig.content ILIKE $1
                                                  OR EXISTS (
                                                      SELECT 1
                                                      FROM unnest(COALESCE(orig.tags, ARRAY[]::text[])) t
                                                      WHERE t ILIKE $1
                                                  )
                                              )
                                        )
                                        THEN 2000
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
                            LEFT JOIN posts orig
                                ON orig.id = p.repost_of_id
                                AND orig.deleted_at IS NULL
                                AND orig.status = 'published'
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
                                    OR p.visibility = 'community_only'
                                    OR (
                                        p.visibility = 'followers'
                                        AND (
                                            p.author_id = $4
                                            OR EXISTS (
                                                SELECT 1 FROM followers f
                                                WHERE f.follower_id = $4 AND f.following_id = p.author_id AND f.status = 'active'
                                            )
                                        )
                                    )
                                )
                                AND (
                                    c.id IS NULL 
                                    OR c.privacy != 'private'
                                    OR EXISTS (
                                        SELECT 1
                                        FROM community_members cm
                                        WHERE cm.community_id = p.community_id 
                                          AND cm.user_id = $4
                                          AND cm.status = 'active'
                                    )
                                )
                                AND (
                                    $5 = ''
                                    OR (
                                        ($13::text IS NULL OR $13 = 'all' OR $13 = 'contents')
                                        AND (
                                            p.search_vector @@ plainto_tsquery('english', $5)
                                            OR p.title ILIKE $1
                                            OR p.content ILIKE $1
                                            OR EXISTS (
                                                SELECT 1
                                                FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) t
                                                WHERE t ILIKE $1
                                            )
                                            -- A repost matches when the ORIGINAL's text
                                            -- matches too: a verbatim repost carries no
                                            -- content of its own, so the embedded post's
                                            -- text is what the search should surface.
                                            -- Walks the repost-of-repost chain (bounded
                                            -- to 5 hops, like the app's root resolver)
                                            -- so a repost of a repost still finds the
                                            -- root original's text.
                                            OR (
                                                p.repost_of_id IS NOT NULL
                                                AND EXISTS (
                                                    WITH RECURSIVE chain AS (
                                                        SELECT rp.id, rp.repost_of_id, rp.deleted_at, rp.status, rp.title, rp.content, rp.tags, 1 AS depth
                                                        FROM posts rp
                                                        WHERE rp.id = p.repost_of_id
                                                        UNION ALL
                                                        SELECT r2.id, r2.repost_of_id, r2.deleted_at, r2.status, r2.title, r2.content, r2.tags, chain.depth + 1
                                                        FROM posts r2
                                                        JOIN chain ON r2.id = chain.repost_of_id
                                                        WHERE chain.repost_of_id IS NOT NULL AND chain.depth < 5
                                                    )
                                                    SELECT 1 FROM chain
                                                    WHERE chain.deleted_at IS NULL
                                                      AND chain.status = 'published'
                                                      AND (
                                                          chain.title ILIKE $1
                                                          OR chain.content ILIKE $1
                                                          OR EXISTS (
                                                              SELECT 1
                                                              FROM unnest(COALESCE(chain.tags, ARRAY[]::text[])) t
                                                              WHERE t ILIKE $1
                                                          )
                                                      )
                                                )
                                            )
                                        )
                                    )
                                    OR (
                                        $13 = 'comments'
                                        AND EXISTS (
                                            SELECT 1 FROM comments cm
                                            WHERE cm.post_id = p.id
                                              AND cm.deleted_at IS NULL
                                              AND cm.status = 'active'
                                              AND cm.content ILIKE $1
                                        )
                                    )
                                    OR (
                                        $13 = 'mentions'
                                        AND (
                                            p.title ILIKE '%{@}[' || $5 || ']%'
                                            OR p.content ILIKE '%{@}[' || $5 || ']%'
                                            OR p.content ~ ('@' || $5 || '([^a-z0-9_]|$)')
                                        )
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
                                -- Community-scoped search (Reddit-style "in this
                                -- community"): when $6 is an array of community
                                -- slugs, only posts published inside ANY of those
                                -- communities match (c/a c/b in the filter).
                                AND (
                                    $6::text[] IS NULL
                                    OR c.slug = ANY($6::text[])
                                )
                                -- Person-scoped search (Reddit-style "from this
                                -- user"): $7 is an array of usernames. A post
                                -- matches when ANY of them is involved — they
                                -- authored it (including their reposts), are
                                -- mentioned in its text or a comment on it,
                                -- commented on it, or reposted it. Multiple
                                -- people combine, e.g. @a @b c/community.
                                -- $8 (involvement) narrows which dimension
                                -- counts ('authored' | 'mentions' | 'comments'
                                -- | 'reposts'); NULL/'all' keeps every one.
                                AND (
                                    $7::text[] IS NULL
                                    OR EXISTS (
                                        SELECT 1
                                        FROM users au
                                        WHERE au.username = ANY($7::text[])
                                          AND au.deleted_at IS NULL
                                          AND (
                                              ($8::text IS NULL OR $8 = 'all')
                                              OR ($8 = 'authored' AND au.id = p.author_id)
                                              OR ($8 = 'mentions' AND (
                                                  p.title ILIKE '%{@}[' || au.username || ']%'
                                                  OR p.content ILIKE '%{@}[' || au.username || ']%'
                                                  OR p.content ~ ('@' || au.username || '([^a-z0-9_]|$)')
                                              ))
                                              OR ($8 = 'comments' AND EXISTS (
                                                  SELECT 1 FROM comments cm
                                                  WHERE cm.post_id = p.id
                                                    AND cm.deleted_at IS NULL
                                                    AND cm.status = 'active'
                                                    AND (
                                                        cm.author_id = au.id
                                                        OR cm.content ILIKE '%{@}[' || au.username || ']%'
                                                        OR cm.content ~ ('@' || au.username || '([^a-z0-9_]|$)')
                                                    )
                                              ))
                                              OR ($8 = 'reposts' AND (
                                                  EXISTS (
                                                      SELECT 1 FROM posts rp
                                                      WHERE rp.repost_of_id = p.id
                                                        AND rp.author_id = au.id
                                                  )
                                                  OR (
                                                      p.repost_of_id IS NOT NULL
                                                      AND EXISTS (
                                                          SELECT 1 FROM posts orig
                                                          WHERE orig.id = p.repost_of_id
                                                            AND orig.author_id = au.id
                                                      )
                                                  )
                                              ))
                                          )
                                    )
                                )
                                -- Hashtag-scoped search: $9 is an array of tags
                                -- (without '#') — a post matches when it carries
                                -- any of them, e.g. #love #peaceful.
                                AND (
                                    $9::text[] IS NULL
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) t
                                        WHERE LOWER(t) = ANY($9::text[])
                                    )
                                )
                                -- Bookmarks scope ($10 = true): only the current
                                -- user's saved posts (search from Bookmarks).
                                AND (
                                    $10::boolean IS NOT TRUE
                                    OR EXISTS (
                                        SELECT 1 FROM bookmark b
                                        WHERE b.post_id = p.id AND b.user_id = $4
                                    )
                                )
                                -- My-own-posts scope ($11 = true): only the
                                -- viewer's own posts (search from Settings).
                                AND (
                                    $11::boolean IS NOT TRUE
                                    OR p.author_id = $4
                                )
                                -- Time-window filter: $14 is a cutoff timestamp
                                -- (null = all time).
                                AND (
                                    $14::timestamptz IS NULL
                                    OR p.published_at >= $14
                                )
                            GROUP BY
                                p.id,
                                u.id,
                                ua.id,
                                c.id,
                                ca.id,
                                orig.id
                            ORDER BY
                                CASE WHEN $12 = 'latest' THEN p.created_at END DESC,
                                -- hot = trending recently: engagement decayed by age (Reddit-style).
                                CASE WHEN $12 = 'hot' THEN
                                    (p.likes_count * 2 + p.comments_count * 3)
                                    / POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2, 1.5)
                                END DESC,
                                CASE WHEN $12 = 'top' THEN (p.likes_count * 2 + p.comments_count * 3) END DESC,
                                CASE WHEN ($12 = 'relevance' OR $12 IS NULL) AND $5 = '' THEN
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
                                            +
                                            CASE
                                                WHEN p.repost_of_id IS NOT NULL AND EXISTS (
                                                    SELECT 1 FROM posts orig
                                                    WHERE orig.id = p.repost_of_id
                                                      AND orig.deleted_at IS NULL
                                                      AND orig.status = 'published'
                                                      AND (
                                                          orig.title ILIKE $1
                                                          OR orig.content ILIKE $1
                                                          OR EXISTS (
                                                              SELECT 1
                                                              FROM unnest(COALESCE(orig.tags, ARRAY[]::text[])) t
                                                              WHERE t ILIKE $1
                                                          )
                                                      )
                                                )
                                                THEN 2000
                                                ELSE 0
                                            END
                                            + (p.likes_count * 2)
                                            + (p.comments_count * 3)
                                            + GREATEST(
                                                100 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400,
                                                0
                                            )
                                        )
                                END DESC NULLS LAST,
                                p.created_at DESC
                            LIMIT $2
                            OFFSET $3;`;

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
                                    -- Saved-events scope ($5 = true): only the
                                    -- current user's saved events (search from
                                    -- Bookmarks → Events).
                                    AND (
                                        $5::boolean IS NOT TRUE
                                        OR EXISTS (
                                            SELECT 1 FROM save s
                                            WHERE s.event_id = events.id AND s.user_id = $6
                                        )
                                    )
                                ORDER BY start_time ASC
                                LIMIT $3 OFFSET $4`;

const SEARCH_GAMES_ALGORITHM = `SELECT 
                                    ${SearchModel.GAME_FIELDS}, 
                                    COUNT(*) OVER() AS total
                                FROM ${SearchModel.GAME_TABLE}
                                WHERE 
                                    is_active = TRUE
                                    AND ($1 = '' OR name ILIKE $1 OR slug ILIKE $1)
                                ORDER BY CASE WHEN $1 = '' THEN (metadata->>'maxXp')::int END DESC NULLS LAST, created_at DESC
                                LIMIT $2 OFFSET $3`;

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
                                    
                                            LEFT JOIN posts orig
                                                ON orig.id = p.repost_of_id
                                                AND orig.deleted_at IS NULL
                                                AND orig.status = 'published'
                                    
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

                                            GROUP BY p.id, u.id, ua.id, c.id, ca.id, orig.id
                                    
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
                                            OFFSET $4;`;

const DISCOVER_COMMUNITY_ALGORITHM = `
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
                                        `;

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
                                    `;

const SEARCH_COMMENT_ALGORITHM = `SELECT
                                cm.id,
                                cm.post_id,
                                cm.parent_id,
                                cm.author_id,
                                cm.content,
                                cm.likes_count,
                                cm.created_at,
                                cm.reply_count,
                                u.name AS author_name,
                                u.username AS author_username,
                                ua.cloudfront_url AS author_avatar,
                                p.title AS post_title,
                                p.content AS post_content,
                                p.published_at AS post_published_at,
                                c.name AS community_name,
                                c.slug AS community_slug,
                                ca.cloudfront_url AS community_avatar,
                                CASE
                                    WHEN LOWER(cm.content) = LOWER($5) THEN 10000
                                    WHEN cm.content ILIKE $1 THEN 5000
                                    WHEN $5 != '' AND to_tsvector('english', cm.content) @@ plainto_tsquery('english', $5) THEN ts_rank(to_tsvector('english', cm.content), plainto_tsquery('english', $5)) * 3000
                                    WHEN cm.content ILIKE '%{@}[' || $5 || ']%' THEN 4000
                                    ELSE 0
                                END
                                + (cm.likes_count * 2)
                                + GREATEST(
                                    100 - EXTRACT(EPOCH FROM (NOW() - cm.created_at)) / 86400,
                                    0
                                ) AS score,
                                COUNT(*) OVER() AS total
                            FROM comments cm
                            JOIN users u
                                ON u.id = cm.author_id
                            LEFT JOIN media ua
                                ON u.avatar_url = ua.id
                            JOIN posts p
                                ON p.id = cm.post_id
                            LEFT JOIN communities c
                                ON c.id = p.community_id
                            LEFT JOIN media ca
                                ON ca.id = c.avatar_url
                            WHERE
                                cm.deleted_at IS NULL
                                AND cm.status = 'active'
                                AND p.deleted_at IS NULL
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
                                    p.visibility = 'public'
                                    OR p.visibility = 'community_only'
                                    OR (
                                        p.visibility = 'followers'
                                        AND (
                                            p.author_id = $4
                                            OR EXISTS (
                                                SELECT 1 FROM followers f
                                                WHERE f.follower_id = $4 AND f.following_id = p.author_id AND f.status = 'active'
                                            )
                                        )
                                    )
                                )
                                AND (
                                    c.id IS NULL
                                    OR c.privacy != 'private'
                                    OR EXISTS (
                                        SELECT 1
                                        FROM community_members cmm
                                        WHERE cmm.community_id = p.community_id
                                          AND cmm.user_id = $4
                                          AND cmm.status = 'active'
                                    )
                                )
                                -- Comment author privacy (private accounts are
                                -- only visible to followers / the viewer).
                                AND (
                                    u.privacy = 'public'
                                    OR cm.author_id = $4
                                    OR EXISTS (
                                        SELECT 1 FROM followers f
                                        WHERE f.follower_id = $4 AND f.following_id = cm.author_id AND f.status = 'active'
                                    )
                                )
                                AND (
                                    $1 = ''
                                    OR cm.content ILIKE $1
                                    OR p.title ILIKE $1
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) t
                                        WHERE t ILIKE $1
                                    )
                                )
                                -- Community-scoped search: ANY of the c/<slug>
                                -- filters matches the comment's post community.
                                AND (
                                    $6::text[] IS NULL
                                    OR c.slug = ANY($6::text[])
                                )
                                -- Person-scoped search (@user): ANY of the tagged
                                -- usernames either authored the comment or is
                                -- mentioned inside it.
                                AND (
                                    $7::text[] IS NULL
                                    OR EXISTS (
                                        SELECT 1 FROM users au
                                        WHERE au.username = ANY($7::text[])
                                          AND au.deleted_at IS NULL
                                          AND (
                                              au.id = cm.author_id
                                              OR cm.content ILIKE '%{@}[' || au.username || ']%'
                                              OR cm.content ~ ('@' || au.username || '([^a-z0-9_]|$)')
                                          )
                                    )
                                )
                                -- Hashtag-scoped search (#tag or bare tag in the
                                -- filter): the comment's post carries any of them.
                                AND (
                                    $8::text[] IS NULL
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) t
                                        WHERE LOWER(t) = ANY($8::text[])
                                    )
                                )
                                -- Bookmarks scope ($10 = true): only comments on
                                -- the current user's saved posts.
                                AND (
                                    $10::boolean IS NOT TRUE
                                    OR EXISTS (
                                        SELECT 1 FROM bookmark b
                                        WHERE b.post_id = p.id AND b.user_id = $4
                                    )
                                )
                                -- My-own-posts scope ($11 = true): only comments
                                -- on the viewer's own posts.
                                AND (
                                    $11::boolean IS NOT TRUE
                                    OR p.author_id = $4
                                )
                                -- Time-window filter: $12 is a cutoff timestamp
                                -- (null = all time).
                                AND (
                                    $12::timestamptz IS NULL
                                    OR cm.created_at >= $12
                                )
                            ORDER BY
                                CASE WHEN $9 = 'latest' THEN cm.created_at END DESC,
                                -- hot = trending recently: engagement decayed by age (Reddit-style).
                                CASE WHEN $9 = 'hot' THEN
                                    cm.likes_count
                                    / POWER(EXTRACT(EPOCH FROM (NOW() - cm.created_at)) / 3600 + 2, 1.5)
                                END DESC,
                                CASE WHEN $9 = 'top' THEN cm.likes_count END DESC,
                                score DESC,
                                cm.created_at DESC
                            LIMIT $2
                            OFFSET $3`;

const SEARCH_MEDIA_ALGORITHM = `SELECT
                                m.id AS media_id,
                                m.media_type,
                                m.cloudfront_url,
                                m.vimeo_player_url,
                                m.vimeo_thumbnail_url,
                                m.width,
                                m.height,
                                m.duration_seconds,
                                m.s3_key,
                                m.created_at AS media_created_at,
                                p.id AS post_id,
                                p.title AS post_title,
                                p.content AS post_content,
                                p.published_at AS post_published_at,
                                u.name AS author_name,
                                u.username AS author_username,
                                ua.cloudfront_url AS author_avatar,
                                c.name AS community_name,
                                c.slug AS community_slug,
                                ca.cloudfront_url AS community_avatar,
                                (
                                    -- Exact / prefix / fuzzy title match
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
                                    -- Content FTS
                                    + CASE
                                        WHEN $5 != '' AND p.search_vector @@ plainto_tsquery('english', $5) THEN ts_rank(p.search_vector, plainto_tsquery('english', $5)) * 3000
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
                            FROM media m
                            JOIN posts p
                                ON p.id = m.post_id
                            JOIN users u
                                ON u.id = p.author_id
                            LEFT JOIN media ua
                                ON u.avatar_url = ua.id
                            LEFT JOIN communities c
                                ON c.id = p.community_id
                            LEFT JOIN media ca
                                ON ca.id = c.avatar_url
                            WHERE
                                m.deleted_at IS NULL
                                AND m.processing_status = 'ready'
                                AND p.deleted_at IS NULL
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
                                    p.visibility = 'public'
                                    OR p.visibility = 'community_only'
                                    OR (
                                        p.visibility = 'followers'
                                        AND (
                                            p.author_id = $4
                                            OR EXISTS (
                                                SELECT 1 FROM followers f
                                                WHERE f.follower_id = $4 AND f.following_id = p.author_id AND f.status = 'active'
                                            )
                                        )
                                    )
                                )
                                AND (
                                    c.id IS NULL
                                    OR c.privacy != 'private'
                                    OR EXISTS (
                                        SELECT 1
                                        FROM community_members cm
                                        WHERE cm.community_id = p.community_id
                                          AND cm.user_id = $4
                                          AND cm.status = 'active'
                                    )
                                )
                                AND (
                                    u.privacy = 'public'
                                    OR p.author_id = $4
                                    OR EXISTS (
                                        SELECT 1 FROM followers f
                                        WHERE f.follower_id = $4 AND f.following_id = p.author_id AND f.status = 'active'
                                    )
                                )
                                AND (
                                    $1 = ''
                                    OR p.title ILIKE $1
                                    OR p.content ILIKE $1
                                    OR p.search_vector @@ plainto_tsquery('english', $5)
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) t
                                        WHERE t ILIKE $1
                                    )
                                )
                                -- Community-scoped search: ANY of the c/<slug>
                                -- filters matches the post's community.
                                AND (
                                    $6::text[] IS NULL
                                    OR c.slug = ANY($6::text[])
                                )
                                -- Person-scoped search (@user): ANY of the tagged
                                -- usernames authored the post or is mentioned in it.
                                AND (
                                    $7::text[] IS NULL
                                    OR EXISTS (
                                        SELECT 1 FROM users au
                                        WHERE au.username = ANY($7::text[])
                                          AND au.deleted_at IS NULL
                                          AND (
                                              au.id = p.author_id
                                              OR p.title ILIKE '%{@}[' || au.username || ']%'
                                              OR p.content ILIKE '%{@}[' || au.username || ']%'
                                              OR p.content ~ ('@' || au.username || '([^a-z0-9_]|$)')
                                          )
                                    )
                                )
                                -- Hashtag-scoped search (#tag or bare tag in the
                                -- filter): the post carries any of them.
                                AND (
                                    $8::text[] IS NULL
                                    OR EXISTS (
                                        SELECT 1
                                        FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) t
                                        WHERE LOWER(t) = ANY($8::text[])
                                    )
                                )
                                -- Bookmarks scope ($10 = true): only media from
                                -- the current user's saved posts.
                                AND (
                                    $10::boolean IS NOT TRUE
                                    OR EXISTS (
                                        SELECT 1 FROM bookmark b
                                        WHERE b.post_id = p.id AND b.user_id = $4
                                    )
                                )
                                -- My-own-posts scope ($11 = true): only media
                                -- from the viewer's own posts.
                                AND (
                                    $11::boolean IS NOT TRUE
                                    OR p.author_id = $4
                                )
                                -- Time-window filter: $12 is a cutoff timestamp
                                -- (null = all time).
                                AND (
                                    $12::timestamptz IS NULL
                                    OR p.published_at >= $12
                                )
                            ORDER BY
                                CASE WHEN $9 = 'latest' THEN p.published_at END DESC,
                                -- hot = trending recently: engagement decayed by age (Reddit-style).
                                CASE WHEN $9 = 'hot' THEN
                                    (p.likes_count * 2 + p.comments_count * 3)
                                    / POWER(EXTRACT(EPOCH FROM (NOW() - p.published_at)) / 3600 + 2, 1.5)
                                END DESC,
                                CASE WHEN $9 = 'top' THEN (p.likes_count * 2 + p.comments_count * 3) END DESC,
                                score DESC,
                                m.created_at DESC
                            LIMIT $2
                            OFFSET $3`;

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
                            LIMIT 15;`;

module.exports = {
  SEARCH_USER_ALGORITHM,
  SEARCH_COMMUNITY_ALGORITHM,
  SEARCH_POSt_ALGORITHM,
  SEARCH_EVENT_ALGORITHM,
  SEARCH_GAMES_ALGORITHM,
  SEARCH_COMMENT_ALGORITHM,
  SEARCH_MEDIA_ALGORITHM,
  DISCOVER_POSTS_ALGORITHM,
  DISCOVER_COMMUNITY_ALGORITHM,
  DISCOVER_PEOPLE_ALGORITHM,
  HASHTAGS_ALGORITHM,
};
