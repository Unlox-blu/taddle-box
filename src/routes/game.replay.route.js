'use strict';

/**
 * Game Replay Route — deterministic replay from game_events.
 *
 * Authorization: authenticated AND (participant OR admin) AND replay enabled.
 * Events ordered by sequence_number (deterministic), not created_at.
 */

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { apiResponse } = require('../utils/response.util');
const { verifyToken } = require('../middlewares/auth.middleware');

/**
 * GET /api/v1/games/match/:matchId/replay
 *
 * Returns all events for a match in deterministic order.
 * Sensitive events are filtered for non-admin users.
 */
router.get('/match/:matchId/replay', verifyToken, async (req, res, next) => {
  try {
    const { matchId } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';

    // 1. Fetch match
    const matchResult = await pool.query(
      `SELECT id, game_id, status, metadata FROM game_matches WHERE id = $1`,
      [matchId]
    );
    if (!matchResult.rows.length) {
      return res.status(404).json(apiResponse(null, 'Match not found'));
    }
    const match = matchResult.rows[0];

    // 2. Check replay is enabled for this game
    const gameResult = await pool.query(
      `SELECT metadata FROM game WHERE id = $1`,
      [match.game_id]
    );
    const gameConfig = gameResult.rows[0]?.metadata || {};
    if (gameConfig.replayEnabled === false) {
      return res.status(403).json(apiResponse(null, 'Replay not available for this game'));
    }

    // 3. Check authorization: participant or admin
    const metadata = match.metadata || {};
    const playerIds = metadata.playerIds || [];
    const isParticipant = playerIds.some(id => String(id) === String(userId));

    if (!isParticipant && !isAdmin) {
      return res.status(403).json(apiResponse(null, 'Not authorized to view this replay'));
    }

    // 4. Fetch events in deterministic order
    const { rows } = await pool.query(
      `SELECT sequence_number, event_type, user_id, payload, created_at
       FROM game_events
       WHERE match_id = $1
       ORDER BY sequence_number ASC`,
      [matchId]
    );

    // 5. Filter sensitive events for non-admins
    const filteredEvents = rows.map(event => {
      const filtered = { ...event };
      if (!isAdmin && filtered.payload?.fullState) {
        filtered.payload = { ...filtered.payload, fullState: '[REDACTED]' };
      }
      return filtered;
    });

    res.json(apiResponse({
      matchId,
      eventCount: filteredEvents.length,
      events: filteredEvents,
    }, 'Replay fetched successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/games/stats/player/:userId
 *
 * Returns aggregated player statistics across all games.
 */
router.get('/stats/player/:userId', verifyToken, async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Only allow viewing own stats or admin
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json(apiResponse(null, 'Not authorized'));
    }

    const { rows } = await pool.query(
      `SELECT
        g.slug AS game_slug,
        g.name AS game_name,
        COUNT(*) AS total_matches,
        SUM(CASE WHEN gm.result = 'WIN' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN gm.result = 'LOSS' THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN gm.result = 'DRAW' THEN 1 ELSE 0 END) AS draws,
        AVG(gm.score) AS avg_score,
        MAX(gm.score) AS best_score,
        SUM(gm.xp_earned) AS total_xp_earned
      FROM game_match gm
      JOIN game g ON g.id = gm.game_id
      WHERE gm.user_id = $1 AND gm.result IS NOT NULL
      GROUP BY g.slug, g.name
      ORDER BY total_matches DESC`,
      [userId]
    );

    res.json(apiResponse(rows, 'Player stats fetched successfully'));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
