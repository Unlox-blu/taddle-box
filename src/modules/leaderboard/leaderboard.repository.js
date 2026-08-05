'use strict';

const pool = require('../../config/database');

const REWARDS = [500, 300, 150];

const withRewards = (rows, type) =>
  rows.map((row, index) => ({
    rank: index + 1,
    type,
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    avatarUrl: row.avatar_url || null,
    score: Number(row.score || 0),
    metricLabel: row.metric_label,
    rewardXP: REWARDS[index] || 0,
  }));

const getFeedLeaderboard = async ({limit}) => {
  const {rows} = await pool.query(
    `SELECT
      u.id,
      u.name AS title,
      '@' || u.username AS subtitle,
      avatar_media.cloudfront_url AS avatar_url,
      COALESCE(SUM(p.likes_count * 3 + p.comments_count * 5 + p.views_count), 0)::INT AS score,
      'Feed impact' AS metric_label
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
    ORDER BY score DESC, u.name ASC
    LIMIT $1`,
    [limit]
  );

  return withRewards(rows, 'feed');
};

const getCommunityLeaderboard = async ({limit}) => {
  const {rows} = await pool.query(
    `SELECT
      u.id,
      u.name AS title,
      '@' || u.username AS subtitle,
      avatar_media.cloudfront_url AS avatar_url,
      (
        COALESCE(COUNT(DISTINCT p.id) FILTER (WHERE p.community_id IS NOT NULL), 0) * 8 +
        COALESCE(COUNT(DISTINCT l.post_id), 0) * 2 +
        COALESCE(COUNT(DISTINCT cm.community_id), 0) * 5
      )::INT AS score,
      'Community activity' AS metric_label
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
    ORDER BY score DESC, u.name ASC
    LIMIT $1`,
    [limit]
  );

  return withRewards(rows, 'community');
};

const getGamesLeaderboard = async ({limit}) => {
  const {rows} = await pool.query(
    `SELECT
      u.id,
      u.name AS title,
      '@' || u.username AS subtitle,
      avatar_media.cloudfront_url AS avatar_url,
      COALESCE(SUM(gm.xp_earned + gm.score), 0)::INT AS score,
      'Game score' AS metric_label
    FROM users u
    JOIN game_match gm ON gm.user_id = u.id
    LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
    WHERE gm.result IS NOT NULL
      AND gm.created_at >= date_trunc('week', NOW())
      AND u.deleted_at IS NULL
      -- Private accounts don't appear on public leaderboards
      AND u.privacy = 'public'
    GROUP BY u.id, u.name, u.username, avatar_media.cloudfront_url
    ORDER BY score DESC, u.name ASC
    LIMIT $1`,
    [limit]
  );

  return withRewards(rows, 'games');
};

const getEventsLeaderboard = async ({limit}) => {
  const {rows} = await pool.query(
    `SELECT
      u.id,
      u.name AS title,
      '@' || u.username AS subtitle,
      avatar_media.cloudfront_url AS avatar_url,
      (
        COALESCE(COUNT(DISTINCT ea.event_id) FILTER (WHERE ea.status IN ('registered', 'attended')), 0) * 10 +
        COALESCE(COUNT(DISTINCT ea.event_id) FILTER (WHERE ea.status = 'attended'), 0) * 15
      )::INT AS score,
      'Events joined' AS metric_label
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
    ORDER BY score DESC, u.name ASC
    LIMIT $1`,
    [limit]
  );

  return withRewards(rows, 'events');
};


const getWeeklyLeaderboards = async ({limit}) => {
  const [feed, community, games, events] = await Promise.all([
    getFeedLeaderboard({limit}),
    getCommunityLeaderboard({limit}),
    getGamesLeaderboard({limit}),
    getEventsLeaderboard({limit}),
  ]);

  return {
    weekStart: new Date().toISOString(),
    rewards: REWARDS,
    feed,
    community,
    games,
    events,
  };
};

module.exports = {
  getWeeklyLeaderboards,
};
