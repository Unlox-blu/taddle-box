'use strict';

const pool = require('../../config/database');

const REWARDS = [500, 300, 150];

const withRewards = (rows, type) =>
  rows.map((row, index) => {
    const rank = Number(row.calculated_rank || index + 1);
    return {
      rank,
      type,
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      avatarUrl: row.avatar_url || null,
      score: Number(row.score || 0),
      metricLabel: row.metric_label,
      rewardXP: REWARDS[rank - 1] || 0,
    };
  });

const getFeedLeaderboard = async ({limit, userId}) => {
  const {rows} = await pool.query(
    `WITH ranked AS (
      SELECT
        u.id,
        u.name AS title,
        '@' || u.username AS subtitle,
        avatar_media.cloudfront_url AS avatar_url,
        COALESCE(SUM(p.likes_count * 3 + p.comments_count * 5 + p.views_count), 0)::INT AS score,
        'Feed impact' AS metric_label,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.likes_count * 3 + p.comments_count * 5 + p.views_count), 0)::INT DESC, u.name ASC) as calculated_rank
      FROM users u
      JOIN posts p ON p.author_id = u.id
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      WHERE p.status = 'published'
        AND p.deleted_at IS NULL
        AND p.created_at >= date_trunc('week', NOW())
        AND u.deleted_at IS NULL
        -- Private accounts' posts stay private — their engagement must not rank publicly
        AND u.privacy = 'public'
      GROUP BY u.id, u.name, u.username, avatar_media.cloudfront_url
      HAVING COALESCE(SUM(p.likes_count * 3 + p.comments_count * 5 + p.views_count), 0) > 0
    )
    SELECT * FROM ranked WHERE calculated_rank <= $1 OR id = $2 ORDER BY calculated_rank ASC`,
    [limit, userId]
  );

  const processed = withRewards(rows, 'feed');
  return {
    top: processed.filter(r => r.rank <= limit),
    currentUser: processed.find(r => r.id === userId) || null
  };
};

const getCommunityLeaderboard = async ({limit, userId}) => {
  const {rows} = await pool.query(
    `WITH ranked AS (
      SELECT
        u.id,
        u.name AS title,
        '@' || u.username AS subtitle,
        avatar_media.cloudfront_url AS avatar_url,
        (
          COALESCE(COUNT(DISTINCT p.id) FILTER (WHERE p.community_id IS NOT NULL), 0) * 8 +
          COALESCE(COUNT(DISTINCT l.post_id), 0) * 2 +
          COALESCE(COUNT(DISTINCT cm.community_id), 0) * 5
        )::INT AS score,
        'Community activity' AS metric_label,
        ROW_NUMBER() OVER (ORDER BY (
          COALESCE(COUNT(DISTINCT p.id) FILTER (WHERE p.community_id IS NOT NULL), 0) * 8 +
          COALESCE(COUNT(DISTINCT l.post_id), 0) * 2 +
          COALESCE(COUNT(DISTINCT cm.community_id), 0) * 5
        ) DESC, u.name ASC) as calculated_rank
      FROM users u
      LEFT JOIN community_members cm
        ON cm.user_id = u.id
        AND cm.status = 'active'
        AND cm.joined_at >= date_trunc('week', NOW())
      LEFT JOIN posts p
        ON p.author_id = u.id
        AND p.community_id IS NOT NULL
        AND p.status = 'published'
        AND p.deleted_at IS NULL
        AND p.created_at >= date_trunc('week', NOW())
      LEFT JOIN post_likes l
        ON l.user_id = u.id
        AND l.created_at >= date_trunc('week', NOW())
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      WHERE u.deleted_at IS NULL
        -- Private accounts don't appear on public leaderboards
        AND u.privacy = 'public'
      GROUP BY u.id, u.name, u.username, avatar_media.cloudfront_url
      HAVING (
        COALESCE(COUNT(DISTINCT p.id) FILTER (WHERE p.community_id IS NOT NULL), 0) +
        COALESCE(COUNT(DISTINCT l.post_id), 0) +
        COALESCE(COUNT(DISTINCT cm.community_id), 0)
      ) > 0
    )
    SELECT * FROM ranked WHERE calculated_rank <= $1 OR id = $2 ORDER BY calculated_rank ASC`,
    [limit, userId]
  );

  const processed = withRewards(rows, 'community');
  return {
    top: processed.filter(r => r.rank <= limit),
    currentUser: processed.find(r => r.id === userId) || null
  };
};

const getGamesLeaderboard = async ({limit, userId}) => {
  const {rows} = await pool.query(
    `WITH ranked AS (
      SELECT
        u.id,
        u.name AS title,
        '@' || u.username AS subtitle,
        avatar_media.cloudfront_url AS avatar_url,
        COALESCE(COUNT(gm.id) FILTER (WHERE gm.result = 'WIN'), 0)::INT AS score,
        'Wins this week' AS metric_label,
        ROW_NUMBER() OVER (ORDER BY COALESCE(COUNT(gm.id) FILTER (WHERE gm.result = 'WIN'), 0)::INT DESC, u.name ASC) as calculated_rank
      FROM users u
      JOIN game_match gm ON gm.user_id = u.id
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      WHERE gm.result IS NOT NULL
        AND gm.created_at >= date_trunc('week', NOW())
        AND u.deleted_at IS NULL
        -- Private accounts don't appear on public leaderboards
        AND u.privacy = 'public'
      GROUP BY u.id, u.name, u.username, avatar_media.cloudfront_url
      HAVING COUNT(gm.id) FILTER (WHERE gm.result = 'WIN') > 0
    )
    SELECT * FROM ranked WHERE calculated_rank <= $1 OR id = $2 ORDER BY calculated_rank ASC`,
    [limit, userId]
  );

  const processed = withRewards(rows, 'games');
  return {
    top: processed.filter(r => r.rank <= limit),
    currentUser: processed.find(r => r.id === userId) || null
  };
};

const getEventsLeaderboard = async ({limit, userId}) => {
  const {rows} = await pool.query(
    `WITH ranked AS (
      SELECT
        u.id,
        u.name AS title,
        '@' || u.username AS subtitle,
        avatar_media.cloudfront_url AS avatar_url,
        (
          COALESCE(COUNT(DISTINCT ea.event_id) FILTER (WHERE ea.status IN ('registered', 'attended')), 0) * 10 +
          COALESCE(COUNT(DISTINCT ea.event_id) FILTER (WHERE ea.status = 'attended'), 0) * 15
        )::INT AS score,
        'Events joined' AS metric_label,
        ROW_NUMBER() OVER (ORDER BY (
          COALESCE(COUNT(DISTINCT ea.event_id) FILTER (WHERE ea.status IN ('registered', 'attended')), 0) * 10 +
          COALESCE(COUNT(DISTINCT ea.event_id) FILTER (WHERE ea.status = 'attended'), 0) * 15
        ) DESC, u.name ASC) as calculated_rank
      FROM users u
      JOIN event_attendees ea
        ON ea.user_id = u.id
        AND ea.status IN ('registered', 'attended')
        AND ea.registered_at >= date_trunc('week', NOW())
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      WHERE u.deleted_at IS NULL
        -- Private accounts don't appear on public leaderboards
        AND u.privacy = 'public'
      GROUP BY u.id, u.name, u.username, avatar_media.cloudfront_url
    )
    SELECT * FROM ranked WHERE calculated_rank <= $1 OR id = $2 ORDER BY calculated_rank ASC`,
    [limit, userId]
  );

  const processed = withRewards(rows, 'events');
  return {
    top: processed.filter(r => r.rank <= limit),
    currentUser: processed.find(r => r.id === userId) || null
  };
};


const LEADERBOARD_GETTERS = {
  feed: getFeedLeaderboard,
  community: getCommunityLeaderboard,
  games: getGamesLeaderboard,
  events: getEventsLeaderboard,
};

const getWeeklyLeaderboards = async ({limit, userId}) => {
  const [feed, community, games, events] = await Promise.all([
    getFeedLeaderboard({limit, userId}),
    getCommunityLeaderboard({limit, userId}),
    getGamesLeaderboard({limit, userId}),
    getEventsLeaderboard({limit, userId}),
  ]);

  return {
    weekStart: new Date().toISOString(),
    rewards: REWARDS,
    feed: feed.top,
    community: community.top,
    games: games.top,
    events: events.top,
    currentUser: {
      feed: feed.currentUser,
      community: community.currentUser,
      games: games.currentUser,
      events: events.currentUser,
    }
  };
};

// Single-tab variant — the app refetches ONLY the leaderboard tab the user is
// looking at when it gets a leaderboards:changed socket event, instead of the
// whole four-tab bundle (feed+community+games+events are heavy aggregate
// queries; a burst of likes on one post only moves the Feed board). Returns
// the same shape as getWeeklyLeaderboards with only the requested tab filled,
// so the client can merge it into the cached bundle in place.
const getWeeklyLeaderboard = async ({type, limit, userId}) => {
  const getter = LEADERBOARD_GETTERS[type];
  if (!getter) return null;
  const { top, currentUser } = await getter({limit, userId});
  return {
    weekStart: new Date().toISOString(),
    rewards: REWARDS,
    [type]: top,
    currentUser: {[type]: currentUser},
  };
};

module.exports = {
  getWeeklyLeaderboards,
  getWeeklyLeaderboard,
};
