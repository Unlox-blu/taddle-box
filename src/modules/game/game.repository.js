'use strict';

const pool = require('../../config/database');
const gameModel = require('./game.model');

// Seat shuffle — rotate the snapshot order by a per-match random offset so
// players land on a DIFFERENT corner/color every match (instead of always the
// first seat = red TL). The rotation happens once, before the metadata is
// persisted, so every client derives the same colors from the same order.
// Skipped for team-locked lobbies where the pairing (index % 2) is meaningful.
function _rotatePlayerOrder(snapshots, teamsLocked) {
  const n = Array.isArray(snapshots) ? snapshots.length : 0;
  if (teamsLocked || n < 2) return snapshots;
  const offset = Math.floor(Math.random() * n);
  if (offset === 0) return snapshots;
  return snapshots.slice(offset).concat(snapshots.slice(0, offset));
}

const findManyGames = async ({ limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${gameModel.GAME_FIELDS}, COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_TABLE}
      WHERE is_active = TRUE
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const total = rows[0]?.total || 0;
    const games = rows.map(gameModel.formatGame);
    return { games, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const findManyGamesBydDfficulty = async ({ difficulty, limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${gameModel.GAME_FIELDS}, COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_TABLE}
      WHERE is_active = TRUE AND difficulty = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [difficulty, limit, offset]
    );
    const total = rows[0]?.total || 0;
    const games = rows.map(gameModel.formatGame);
    return { games, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const findGameById = async ({ gameId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${gameModel.GAME_FIELDS}
      FROM ${gameModel.GAME_TABLE}
      WHERE id = $1`,
      [gameId]
    );
    const game = rows[0] ? gameModel.formatGame(rows[0]) : null;
    return game;
  } catch (error) {
    throw error;
  }
};

const searchGames = async ({ query, limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${gameModel.GAME_FIELDS}, 
       COUNT(*) OVER() AS total
       FROM ${gameModel.GAME_TABLE}
       WHERE is_active = TRUE 
       AND ($1 = '' OR slug ILIKE $1 OR name ILIKE $1)
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${query}%`, limit, offset]
    );
    const total = rows[0]?.total || 0;
    const games = rows.map(gameModel.formatGame);
    return { games, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const createGameMatche = async ({ matchData }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${gameModel.GAME_MATCH_TABLE}
      (user_id, game_id, mode, category, difficulty, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING *`,
      [
        matchData.userId,
        matchData.gameId,
        gameModel.normalizeMatchMode(matchData.mode),
        matchData.category || null,
        matchData.difficulty || null,
        JSON.stringify(matchData.metadata || []),
      ]
    );
    const match = gameModel.formatGameMatch(rows[0]);
    return match;
  } catch (error) {
    throw error;
  }
};

const updateGameMatcheByMatchId = async ({ matchData }) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${gameModel.GAME_MATCH_TABLE}
      SET result = $1, score = $2, duration = $3, xp_earned = $4, updated_at = NOW()
      WHERE id = $5 AND user_id = $6 AND result IS NULL
      RETURNING *`,
      [
        matchData.result,
        matchData.score,
        matchData.duration,
        matchData.xpEarned,
        matchData.matchId,
        matchData.userId,
      ]
    );
    const match = gameModel.formatGameMatch(rows[0]);
    return match;
  } catch (error) {
    throw error;
  }
};

const completeGameMatch = async ({ matchData }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE ${gameModel.GAME_MATCH_TABLE} gm
      SET result = $1, score = $2, duration = $3, xp_earned = $4, metadata = COALESCE(gm.metadata, '{}'::jsonb) || $7::jsonb, updated_at = NOW()
      FROM ${gameModel.GAME_TABLE} g
      WHERE gm.id = $5 AND gm.user_id = $6 AND gm.result IS NULL AND g.id = gm.game_id
      RETURNING gm.id, gm.user_id, gm.game_id, gm.mode, gm.result, gm.score, gm.duration, gm.xp_earned,
        gm.category, gm.difficulty, gm.metadata, gm.created_at, gm.updated_at,
        g.name AS game_name, g.slug AS game_slug, g.thumbnail AS game_thumbnail`,
      [
        matchData.result,
        matchData.score,
        matchData.duration,
        matchData.xpEarned,
        matchData.matchId,
        matchData.userId,
        JSON.stringify(matchData.metadata || {}),
      ]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const isWin = matchData.result === 'WIN';
    const isLoss = matchData.result === 'LOSS';
    const isDraw = matchData.result === 'DRAW';

    await client.query(
      `INSERT INTO ${gameModel.GAME_STATS_TABLE}
        (user_id, games_played, wins, losses, draws, current_streak, best_streak, total_xp)
      VALUES ($1, 1, $2, $3, $4, $5, $5, $6)
      ON CONFLICT (user_id) DO UPDATE SET
        games_played = ${gameModel.GAME_STATS_TABLE}.games_played + 1,
        wins = ${gameModel.GAME_STATS_TABLE}.wins + $2,
        losses = ${gameModel.GAME_STATS_TABLE}.losses + $3,
        draws = ${gameModel.GAME_STATS_TABLE}.draws + $4,
        current_streak = CASE WHEN $2 = 1 THEN ${gameModel.GAME_STATS_TABLE}.current_streak + 1 ELSE 0 END,
        best_streak = CASE
          WHEN $2 = 1 THEN GREATEST(${gameModel.GAME_STATS_TABLE}.best_streak, ${gameModel.GAME_STATS_TABLE}.current_streak + 1)
          ELSE ${gameModel.GAME_STATS_TABLE}.best_streak
        END,
        total_xp = ${gameModel.GAME_STATS_TABLE}.total_xp + $6,
        updated_at = NOW()`,
      [
        matchData.userId,
        isWin ? 1 : 0,
        isLoss ? 1 : 0,
        isDraw ? 1 : 0,
        isWin ? 1 : 0,
        matchData.xpEarned,
      ]
    );

    const tournamentId = rows[0].metadata?.tournamentId;
    if (tournamentId) {
      await client.query(
        `UPDATE ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE}
        SET status = 'PLAYED',
          match_id = $1,
          score = score + $2,
          xp_earned = xp_earned + $3,
          updated_at = NOW()
        WHERE tournament_id = $4 AND user_id = $5`,
        [rows[0].id, isWin ? 1 : 0, matchData.xpEarned, tournamentId, matchData.userId]
      );
    }

    await client.query('COMMIT');
    return gameModel.formatGameMatch(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const findManyGameMatshs = async ({ userId, limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `SELECT gm.id, gm.user_id, gm.game_id, gm.mode, gm.result, gm.score, gm.duration, gm.xp_earned,
        gm.category, gm.difficulty, gm.metadata, gm.created_at, gm.updated_at,
        g.name AS game_name, g.slug AS game_slug, g.thumbnail AS game_thumbnail, COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_MATCH_TABLE} gm
      JOIN ${gameModel.GAME_TABLE} g ON g.id = gm.game_id
      WHERE gm.user_id = $1 AND gm.result IS NOT NULL
      ORDER BY gm.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const total = rows[0]?.total || 0;
    const matchs = rows.map(gameModel.formatGameMatch);
    return { matchs, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const recordMatchHistory = async ({ userId, gameId, mode, result, score, duration, xpEarned, matchGroupId }) => {
  try {
    // Matchmaking already created a placeholder row (result = NULL) per player with the
    // matchGroupId in metadata. Prefer updating it so we don't accumulate duplicate rows.
    if (matchGroupId) {
      const upd = await pool.query(
        `UPDATE ${gameModel.GAME_MATCH_TABLE}
         SET result = $1, score = $2, duration = $3, xp_earned = $4,
             mode = $5, updated_at = NOW()
         WHERE user_id = $6 AND game_id = $7
           AND metadata->>'matchGroupId' = $8 AND result IS NULL
         RETURNING id`,
        // Normalize mode: the column CHECK only accepts uppercase AUTO/CUSTOM/TOURNAMENT,
        // and callers pass lowercase ('auto').
        [result, score, duration, xpEarned, gameModel.normalizeMatchMode(mode), userId, gameId, matchGroupId]
      );
      if (upd.rows.length > 0) return;
    }

    // No placeholder found (e.g. direct matches) — insert a fresh history row.
    // Include matchGroupId in metadata so findCompletedMatchRecord (which looks
    // it up via metadata->>'matchGroupId') can later return this recorded result
    // to a late completion call instead of erroring.
    await pool.query(
      `INSERT INTO ${gameModel.GAME_MATCH_TABLE} 
       (user_id, game_id, mode, result, score, duration, xp_earned, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())`,
      [
        userId, gameId, gameModel.normalizeMatchMode(mode), result, score, duration, xpEarned,
        JSON.stringify(matchGroupId ? { matchGroupId, completedAt: new Date().toISOString() } : {}),
      ]
    );
  } catch (error) {
    console.error('Failed to record match history:', error.message);
  }
};

const getTrendingGames = async ({ limit = 3 }) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.*, 
       (SELECT COUNT(*) FROM ${gameModel.GAME_MATCH_TABLE} gm WHERE gm.game_id = g.id) AS play_count
       FROM ${gameModel.GAME_TABLE} g
       WHERE g.is_active = TRUE
       ORDER BY play_count DESC
       LIMIT $1`,
      [limit]
    );
    return rows.map((row) => ({
      ...gameModel.formatGame(row),
      playCount: parseInt(row.play_count || '0', 10),
    }));
  } catch (error) {
    throw error;
  }
};

const findTournamentLeaderboard = async ({ tournamentId, limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        gte.user_id,
        u.name,
        u.username,
        avatar_media.cloudfront_url AS avatar_url,
        gte.score AS best_score,
        COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} gte
      JOIN users u ON u.id = gte.user_id
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      WHERE gte.tournament_id = $1 AND gte.status <> 'CANCELLED'
      -- Deterministic tie-break: same wins sort by earliest updated first.
      ORDER BY gte.score DESC NULLS LAST, gte.updated_at ASC, gte.user_id ASC
      LIMIT $2 OFFSET $3`,
      [tournamentId, limit, offset]
    );

    const total = rows[0]?.total || 0;
    const leaderboard = rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      username: row.username,
      avatarUrl: row.avatar_url,
      bestScore: row.best_score,
    }));
    return { leaderboard, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

const findLeaderboard = async ({ limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        gs.user_id,
        u.name,
        u.username,
        avatar_media.cloudfront_url AS avatar_url,
        gs.games_played,
        gs.wins,
        gs.current_streak,
        gs.best_streak,
        gs.total_xp,
        COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_STATS_TABLE} gs
      JOIN users u ON u.id = gs.user_id
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      WHERE u.deleted_at IS NULL
      ORDER BY gs.total_xp DESC, gs.wins DESC, gs.best_streak DESC, gs.updated_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const total = rows[0]?.total || 0;
    return {
      leaderboard: rows.map((row, idx) => ({
        rank: offset + idx + 1,
        userId: row.user_id,
        name: row.name,
        username: row.username,
        avatarUrl: row.avatar_url,
        gamesPlayed: row.games_played,
        wins: row.wins,
        currentStreak: row.current_streak,
        bestStreak: row.best_streak,
        totalXP: row.total_xp,
      })),
      total: parseInt(total, 10),
    };
  } catch (error) {
    throw error;
  }
};

const findTournaments = async ({ userId, limit, offset }) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        gt.*,
        g.name AS game_name,
        g.slug AS game_slug,
        COUNT(gte.id)::INT AS player_count,
        my.score AS my_score,
        CASE WHEN my.score IS NOT NULL THEN
          (SELECT COUNT(*)::INT FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} ahead
           WHERE ahead.tournament_id = gt.id AND ahead.status <> 'CANCELLED'
             AND ahead.score > my.score) + 1
        END AS my_rank,
        EXISTS (
          SELECT 1 FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} mine
          WHERE mine.tournament_id = gt.id AND mine.user_id = $1 AND mine.status <> 'CANCELLED'
        ) AS is_joined,
        COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_TOURNAMENT_TABLE} gt
      JOIN ${gameModel.GAME_TABLE} g ON g.id = gt.game_id
      LEFT JOIN ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} gte
        ON gte.tournament_id = gt.id AND gte.status <> 'CANCELLED'
      LEFT JOIN LATERAL (
        SELECT score FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} m
        WHERE m.tournament_id = gt.id AND m.user_id = $1 AND m.status <> 'CANCELLED'
        LIMIT 1
      ) my ON TRUE
      WHERE gt.status IN ('ACTIVE', 'UPCOMING') AND gt.ends_at > NOW()
      GROUP BY gt.id, g.name, g.slug, my.score
      ORDER BY gt.status = 'ACTIVE' DESC, gt.ends_at ASC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const total = rows[0]?.total || 0;
    return {
      tournaments: rows.map(gameModel.formatTournament),
      total: parseInt(total, 10),
    };
  } catch (error) {
    throw error;
  }
};

const findTournamentById = async ({ tournamentId, userId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        gt.*,
        g.name AS game_name,
        g.slug AS game_slug,
        COUNT(gte.id)::INT AS player_count,
        my.score AS my_score,
        CASE WHEN my.score IS NOT NULL THEN
          (SELECT COUNT(*)::INT FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} ahead
           WHERE ahead.tournament_id = gt.id AND ahead.status <> 'CANCELLED'
             AND ahead.score > my.score) + 1
        END AS my_rank,
        EXISTS (
          SELECT 1 FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} mine
          WHERE mine.tournament_id = gt.id AND mine.user_id = $2 AND mine.status <> 'CANCELLED'
        ) AS is_joined
      FROM ${gameModel.GAME_TOURNAMENT_TABLE} gt
      JOIN ${gameModel.GAME_TABLE} g ON g.id = gt.game_id
      LEFT JOIN ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} gte
        ON gte.tournament_id = gt.id AND gte.status <> 'CANCELLED'
      LEFT JOIN LATERAL (
        SELECT score FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} m
        WHERE m.tournament_id = gt.id AND m.user_id = $2 AND m.status <> 'CANCELLED'
        LIMIT 1
      ) my ON TRUE
      WHERE gt.id = $1
      GROUP BY gt.id, g.name, g.slug, my.score`,
      [tournamentId, userId]
    );

    return gameModel.formatTournament(rows[0]);
  } catch (error) {
    throw error;
  }
};

const joinTournament = async ({ userId, tournamentId }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} (tournament_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (tournament_id, user_id) DO UPDATE SET
        status = 'REGISTERED',
        updated_at = NOW()
      RETURNING *`,
      [tournamentId, userId]
    );

    return rows[0];
  } catch (error) {
    throw error;
  }
};

const hasTournamentEntry = async ({ userId, tournamentId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT 1
      FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE}
      WHERE tournament_id = $1 AND user_id = $2 AND status <> 'CANCELLED'
      LIMIT 1`,
      [tournamentId, userId]
    );

    return rows.length > 0;
  } catch (error) {
    throw error;
  }
};

/**
 * Records a finished match's result on the player's tournament entry (if the
 * match belongs to a tournament). This is the PVP/bot-session scoring path —
 * the legacy completeGameMatch path already updates entries, but the live
 * completeGameSession flow resolves matches via recordMatchHistory and never
 * touched game_tournament_entry, so tournament leaderboards stayed empty.
 *
 * Leaderboard score = number of wins (1 per WIN). No-op when the match group
 * has no tournamentId or the user isn't registered.
 */
const recordTournamentEntryResult = async ({ matchGroupId, userId, isWin, xpEarned = 0 }) => {
  try {
    // The finished match row is pinned with ORDER BY ... LIMIT 1 so match_id is
    // deterministic even if multiple game_match rows exist for the group
    // (placeholder + fallback insert). Score/xp increments are correct either
    // way — all rows for the group share the tournamentId.
    await pool.query(
      `UPDATE ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} gte
       SET status = 'PLAYED',
           match_id = (
             SELECT gm2.id FROM ${gameModel.GAME_MATCH_TABLE} gm2
             WHERE gm2.user_id = $1
               AND gm2.metadata->>'matchGroupId' = $2
               AND gm2.metadata->>'tournamentId' IS NOT NULL
               AND gm2.result IS NOT NULL
             ORDER BY gm2.updated_at DESC LIMIT 1
           ),
           score = gte.score + $3,
           xp_earned = gte.xp_earned + $4,
           updated_at = NOW()
       WHERE gte.tournament_id = (
             SELECT (gm3.metadata->>'tournamentId')::uuid FROM ${gameModel.GAME_MATCH_TABLE} gm3
             WHERE gm3.user_id = $1
               AND gm3.metadata->>'matchGroupId' = $2
               AND gm3.metadata->>'tournamentId' IS NOT NULL
               AND gm3.result IS NOT NULL
             ORDER BY gm3.updated_at DESC LIMIT 1
           )
         AND gte.user_id = $1
         AND gte.status <> 'CANCELLED'`,
      [userId, matchGroupId, isWin ? 1 : 0, xpEarned]
    );
  } catch (error) {
    // Non-fatal: the match is already resolved; a tournament entry failure
    // must never break the main completion flow.
    console.error('Failed to record tournament entry result:', error.message);
  }
};

const findMatchmakingTicketById = async ({ userId, ticketId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT q.*, opponent.name AS opponent_name, opponent.username AS opponent_username
      FROM ${gameModel.GAME_MATCHMAKING_TICKET_TABLE} q
      LEFT JOIN users opponent ON opponent.id = q.opponent_user_id
      WHERE q.id = $1 AND q.user_id = $2`,
      [ticketId, userId]
    );

    const ticket = gameModel.formatMatchmakingTicket(rows[0]);
    if (!ticket) return null;

    let match = null;
    if (ticket.userMatchId) {
      const matchRows = await pool.query(
        `SELECT gm.id, gm.user_id, gm.game_id, gm.mode, gm.result, gm.score, gm.duration, gm.xp_earned,
          gm.category, gm.difficulty, gm.metadata, gm.created_at, gm.updated_at,
          g.name AS game_name, g.slug AS game_slug, g.thumbnail AS game_thumbnail
        FROM ${gameModel.GAME_MATCH_TABLE} gm
        JOIN ${gameModel.GAME_TABLE} g ON g.id = gm.game_id
        WHERE gm.id = $1 AND gm.user_id = $2`,
        [ticket.userMatchId, userId]
      );
      match = gameModel.formatGameMatch(matchRows.rows[0]);
    }

    return { ticket, match };
  } catch (error) {
    throw error;
  }
};

const cancelWaitingMatchmakingTickets = async ({ userId, gameId, mode, tournamentId }) => {
  try {
    await pool.query(
      `UPDATE ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE user_id = $1
        AND game_id = $2
        AND mode = $3
        AND status = 'WAITING'
        AND (($4::uuid IS NULL AND tournament_id IS NULL) OR tournament_id = $4::uuid)`,
      [userId, gameId, mode, tournamentId || null]
    );
  } catch (error) {
    throw error;
  }
};

const joinMatchmaking = async ({ userId, game, mode, tournamentId, targetPlayers, visibility = "PUBLIC", lobbyTtlSeconds = null, configuredRounds = 1 }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const normalizedMode = String(mode || 'AUTO').toUpperCase();

    await client.query(
      `UPDATE ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE user_id = $1
        AND game_id = $2
        AND mode = $3
        AND status = 'WAITING'
        AND (($4::uuid IS NULL AND tournament_id IS NULL) OR tournament_id = $4::uuid)`,
      [userId, game.id, normalizedMode, tournamentId || null]
    );

    const maxPlayers = targetPlayers || gameModel.resolveNaturalMaxPlayers(game);
    // PRACTICE lobbies are always private & solo: the user is the only real
    // player and bots fill every remaining seat (never other users).
    const lobbyVisibility = normalizedMode === 'CUSTOM' || normalizedMode === 'PRACTICE' ? 'PRIVATE' : 'PUBLIC';
    // For AUTO without a specific targetPlayers, join any available lobby regardless of size
    const isAutoAny = (normalizedMode === 'AUTO' || normalizedMode === 'PRACTICE') && !targetPlayers;

    let lobby = null;
    // PRACTICE never joins an existing lobby — every practice run is a fresh
    // solo-vs-bots match, so bots (never other users) fill it.
    if (normalizedMode !== 'CUSTOM' && normalizedMode !== 'PRACTICE') {
      if (isAutoAny) {
        // Auto-any: join the oldest waiting AUTO lobby for this game, any size
        const lobbyResult = await client.query(
          `SELECT * FROM game_lobby 
           WHERE game_id = $1 
             AND status = 'WAITING' 
             AND current_players < max_players
             AND ((settings->>'mode' = $2) OR (settings->>'mode' IS NULL AND visibility = 'PUBLIC'))
           ORDER BY created_at ASC 
           FOR UPDATE SKIP LOCKED 
           LIMIT 1`,
          [game.id, normalizedMode]
        );
        lobby = lobbyResult.rows[0];
      } else {
        // Exact size: only join a lobby with matching max_players and same rounds
        const lobbyResult = await client.query(
          `SELECT * FROM game_lobby 
           WHERE game_id = $1 
             AND status = 'WAITING' 
             AND current_players < max_players
             AND max_players = $2
             AND ((settings->>'mode' = $3) OR (settings->>'mode' IS NULL AND visibility = 'PUBLIC'))
             AND COALESCE((settings->>'configuredRounds')::int, 1) = $4
           ORDER BY created_at ASC 
           FOR UPDATE SKIP LOCKED 
           LIMIT 1`,
          [game.id, maxPlayers, normalizedMode, configuredRounds]
        );
        lobby = lobbyResult.rows[0];
      }
    }

    if (!lobby) {
      // autoSize: true marks lobbies created without an explicit targetPlayers so the
      // bot-fill path can size the match to the game's natural player count (e.g. 4 for ludo).
      const settings = JSON.stringify({ mode: normalizedMode, targetPlayers: maxPlayers, autoSize: isAutoAny, teamsLocked: false, autoBalance: true, configuredRounds });
      // CUSTOM lobbies stay open 30 minutes; AUTO/PRACTICE lobbies 30 seconds
      // (bot fallback kicks in at 15s). TOURNAMENT lobbies must survive much
      // longer — opponents can be rare, so they stay open until the server-
      // provided TTL (min 30 min, capped at 6h) instead of timing out at 30s.
      let expirySeconds = 30;
      if (normalizedMode === 'CUSTOM') expirySeconds = 1800;
      else if (normalizedMode === 'TOURNAMENT') expirySeconds = lobbyTtlSeconds || 3600;
      // Generate a short invite code for CUSTOM lobbies
      const inviteCode = normalizedMode === 'CUSTOM'
        ? require('crypto').randomBytes(4).toString('hex').toUpperCase()
        : null;

      const newLobbyRes = await client.query(
        `INSERT INTO game_lobby (game_id, status, max_players, current_players, host_user_id, expires_at, visibility, settings, invite_code)
         VALUES ($1, 'WAITING', $2, 0, $3, NOW() + ($7 * INTERVAL '1 second'), $4, $5::jsonb, $6)
         RETURNING *`,
        [game.id, maxPlayers, userId, lobbyVisibility, settings, inviteCode, expirySeconds]
      );
      lobby = newLobbyRes.rows[0];
    }

    const ticketRes = await client.query(
      `INSERT INTO ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
        (user_id, game_id, tournament_id, mode, status, lobby_id, metadata)
      VALUES ($1, $2, $3, $4, 'WAITING', $5, $6::jsonb)
      RETURNING *`,
      [
        userId, game.id, tournamentId || null, normalizedMode, lobby.id,
        JSON.stringify({ runtimeType: game.metadata?.runtimeType || 'app', queuedAt: new Date().toISOString() })
      ]
    );

    const updatedLobbyRes = await client.query(
      `UPDATE game_lobby 
       SET current_players = current_players + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [lobby.id]
    );
    lobby = updatedLobbyRes.rows[0];

    const playersRes = await client.query(
      `SELECT t.user_id, u.name, u.username, m.cloudfront_url AS avatar, t.id as ticket_id,
              COALESCE(x.total_xp_earned, 0) AS xp
       FROM ${gameModel.GAME_MATCHMAKING_TICKET_TABLE} t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN media m ON m.id = u.avatar_url
       LEFT JOIN xp x ON x.user_id = u.id
       WHERE t.lobby_id = $1 AND t.status = 'WAITING'
       ORDER BY t.created_at ASC`,
      [lobby.id]
    );

    let playerSnapshots = playersRes.rows.map((r, index) => ({
      id: r.user_id,
      username: r.username,
      displayName: r.name,
      avatar: r.avatar,
      isBot: false,
      team: index % 2,
      seat: index,
      status: 'JOINED',
      // Level mirrors the app-wide formula (floor(totalXp / 1000) + 1) so the
      // in-game profile badges match the profile pages.
      level: Math.floor((Number(r.xp) || 0) / 1000) + 1
    }));

    // Mid-fill joins: bots already assigned via the gradual sweep live in
    // game_lobby_participants — query them directly instead of settings.bots.
    const { rows: midFillBotRows } = await client.query(
      `SELECT glp.bot_id, glp.instance_id, glp.seat, glp.snapshot
       FROM game_lobby_participants glp
       WHERE glp.lobby_id = $1
       ORDER BY glp.seat ASC`,
      [lobby.id]
    );
    for (const row of midFillBotRows) {
      playerSnapshots.push({
        id:          row.bot_id,
        instanceId:  row.instance_id,
        username:    row.snapshot.username,
        displayName: row.snapshot.name,
        avatar:      row.snapshot.avatar,
        isBot:       true,
        team:        row.snapshot.team,
        seat:        row.seat,
        status:      'JOINED',
        rating:      row.snapshot.rating,
        level:       row.snapshot.level,
        badge:       row.snapshot.badge,
      });
    }

    if (lobby.current_players === lobby.max_players) {
      const startedAt = new Date().toISOString();
      // Randomize who sits where (corner/color) for this match.
      playerSnapshots = _rotatePlayerOrder(playerSnapshots, !!(lobby.settings?.teamsLocked));
      // Re-index seats: rotation preserves original seat values, and human
      // seats (join index) can collide with bot seats (lobby participants) —
      // duplicate seats would silently drop a game_participants row via the
      // (game_session_id, seat) unique constraint.
      playerSnapshots.forEach((p, idx) => { p.seat = idx; });
      const matchMetadata = {
        lobbyId: lobby.id,
        matchGroupId: lobby.id,
        gameId: game.id,
        gameMode: gameModel.normalizeMatchMode(mode),
        playerIds: playerSnapshots.map(p => p.id),
        playerSnapshots,
        maxPlayers: lobby.max_players,
        teamsLocked: !!(lobby.settings?.teamsLocked),
        startedAt,
        runtimeType: game.metadata?.runtimeType || 'app',
        tournamentId
      };

      for (const p of playerSnapshots) {
        // Bots have no ticket/match row — they participate via the socket layer's
        // lobby-bot injection (game.socket.js setupBotPlayer).
        if (p.isBot) continue;
        const matchRes = await client.query(
          `INSERT INTO ${gameModel.GAME_MATCH_TABLE}
            (user_id, game_id, mode, category, difficulty, metadata)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          RETURNING *`,
          [p.id, game.id, gameModel.normalizeMatchMode(mode), game.category || null, game.difficulty || null, JSON.stringify(matchMetadata)]
        );

        await client.query(
          `UPDATE ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
           SET status = 'MATCHED', user_match_id = $1, matched_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [matchRes.rows[0].id, playersRes.rows.find(r => r.user_id === p.id).ticket_id]
        );
      }

      // Create the game_sessions row (id = lobby.id) + game_participants.
      // The socket layer's auth query joins game_participants → game_sessions
      // on THIS id and validates the player's ws_token against the participant
      // row — without these rows every player's game-socket handshake fails
      // with 'Invalid match credentials' and the client sits on the match-start
      // screen forever. (startGameSession later stamps ws_token onto the human
      // participant rows via setupMatchSession.)
      await client.query(
        `INSERT INTO game_sessions (id, game_id, session_type, status, max_players, mode, metadata)
         VALUES ($1, $2, 'MULTIPLAYER', 'ACTIVE', $3, $4, $5::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [lobby.id, game.id, lobby.max_players, gameModel.normalizeMatchMode(mode), JSON.stringify(matchMetadata)]
      );
      for (const p of playerSnapshots) {
        if (p.isBot) {
          await client.query(
            `INSERT INTO game_participants
               (game_session_id, player_type, user_id, bot_id, instance_id, seat, snapshot)
             VALUES ($1, 'BOT', NULL, $2, $3, $4, $5::jsonb)
             ON CONFLICT (game_session_id, seat) DO NOTHING`,
            [lobby.id, p.id, p.instanceId, p.seat, JSON.stringify(p)]
          );
        } else {
          // Un-targeted ON CONFLICT also guards the (game_session_id, user_id)
          // unique constraint — a user holding two WAITING tickets yields two
          // snapshot rows (different seats, same user_id).
          await client.query(
            `INSERT INTO game_participants
               (game_session_id, player_type, user_id, bot_id, seat, snapshot)
             VALUES ($1, 'HUMAN', $2, NULL, $3, $4::jsonb)
             ON CONFLICT DO NOTHING`,
            [lobby.id, p.id, p.seat, JSON.stringify(p)]
          );
        }
      }

      await client.query(
        `UPDATE game_lobby SET status = 'READY', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [lobby.id]
      );

      await client.query('COMMIT');
      return {
        status: 'MATCHED',
        ticket: gameModel.formatMatchmakingTicket(ticketRes.rows[0]),
        lobbyId: lobby.id,
        players: playerSnapshots,
        matchMetadata
      };
    }

    await client.query('COMMIT');
      return {
        status: 'WAITING',
        ticket: gameModel.formatMatchmakingTicket(ticketRes.rows[0]),
        lobbyId: lobby.id,
        players: playerSnapshots,
        maxPlayers: lobby.max_players,
        currentPlayers: lobby.current_players,
        expiresAt: lobby.expires_at
      };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const fillMatchmakingLobby = async ({ userId, ticketId, overrideLobbyId, fillBots = true }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    let lobbyId = overrideLobbyId;
    let initialTicket = null;

    if (ticketId) {
      const initialTicketRes = await client.query(
        `SELECT lobby_id, game_id, mode, tournament_id FROM game_matchmaking_ticket WHERE id = $1 AND user_id = $2`,
        [ticketId, userId]
      );
      initialTicket = initialTicketRes.rows[0];
      if (!initialTicket) throw new Error("Ticket not found");
      lobbyId = initialTicket.lobby_id;
    }

    const lobbyRes = await client.query(
      `SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE`,
      [lobbyId]
    );
    const lobby = lobbyRes.rows[0];
    if (!lobby) throw new Error("Lobby not found");

    if (!initialTicket) {
      const anyTicket = await client.query(
        `SELECT game_id, mode, tournament_id FROM game_matchmaking_ticket WHERE lobby_id = $1 LIMIT 1`,
        [lobbyId]
      );
      initialTicket = anyTicket.rows[0] || { game_id: lobby.game_id, mode: 'AUTO', tournament_id: null };
    }

    if (lobby.status !== 'WAITING') {
      await client.query('ROLLBACK');
      return { status: 'MATCHED', message: 'Lobby already processed' };
    }

    // Note: a full lobby is NOT an error here. The gradual bot-fill sweep
    // (resolveBotFillingLobbies) fills the last slot, then calls this function
    // with the lobby already full so the match rows get created and the lobby
    // transitions to READY. Previously this early-return made a full lobby a
    // silent no-op (the custom-lobby "Start" button did nothing).

    await client.query(`UPDATE game_lobby SET status = 'LOCKED' WHERE id = $1`, [lobby.id]);

    const gameRes = await client.query(`SELECT * FROM game WHERE id = $1`, [initialTicket.game_id]);
    const game = gameRes.rows[0];

    // Safety net: AUTO lobbies created without an explicit targetPlayers (autoSize: true)
    // should fill to the game's natural player count (e.g. 4 for ludo), not default to a 1v1.
    // joinMatchmaking already sizes new auto lobbies, so this only guards shrunk/legacy ones.
    if (fillBots && game && lobby.settings?.autoSize === true) {
      const naturalMax = gameModel.resolveNaturalMaxPlayers(game);
      if (naturalMax > lobby.max_players) {
        lobby.max_players = naturalMax;
        const resizedSettings = { ...(lobby.settings || {}), targetPlayers: naturalMax };
        await client.query(
          `UPDATE game_lobby SET max_players = $1, settings = $2::jsonb WHERE id = $3`,
          [lobby.max_players, JSON.stringify(resizedSettings), lobby.id]
        );
      }
    }

    const playersRes = await client.query(
      `SELECT t.user_id, u.name, u.username, m.cloudfront_url AS avatar, t.id as ticket_id
       FROM game_matchmaking_ticket t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN media m ON m.id = u.avatar_url
       WHERE t.lobby_id = $1 AND (t.status = 'WAITING' OR t.status = 'MATCHED')
       ORDER BY t.created_at ASC`,
      [lobby.id]
    );

    let playerSnapshots = playersRes.rows.map((r, index) => ({
      id: r.user_id,
      username: r.username,
      displayName: r.name,
      avatar: r.avatar,
      isBot: false,
      team: index % 2,
      seat: index,
      status: 'JOINED'
    }));

    // Bot roster comes from game_lobby_participants — the pre-session SSOT.
    // When fillBots=true (backstop expiry bulk-fill), top up any seats the
    // gradual sweep didn't get to BEFORE reading the roster — otherwise the
    // match would be created with whatever partial bot roster existed (e.g.
    // exactly one bot) and start short-handed.
    if (fillBots) {
      const missingBots = Math.max(0, lobby.max_players - lobby.current_players);
      for (let i = 0; i < missingBots; i++) {
        // Seats already taken by tickets + bots already assigned
        const { rows: tRows } = await client.query(
          `SELECT metadata->>'seat' AS seat FROM game_matchmaking_ticket
           WHERE lobby_id = $1 AND status != 'CANCELLED'`,
          [lobby.id]
        );
        const { rows: bRows } = await client.query(
          'SELECT seat, bot_id FROM game_lobby_participants WHERE lobby_id = $1',
          [lobby.id]
        );
        const usedSeats = new Set([
          ...tRows.map(r => parseInt(r.seat, 10)).filter(s => !isNaN(s)),
          ...bRows.map(r => r.seat),
        ]);
        const usedBotIds = new Set(bRows.map(r => r.bot_id).filter(Boolean));
        let seat = 0;
        while (usedSeats.has(seat)) seat++;

        const { rows: avail } = await client.query(
          `SELECT * FROM bots
           WHERE is_active = true
             AND id != ALL(COALESCE($1::varchar[], ARRAY[]::varchar[]))
           ORDER BY id ASC
           LIMIT 1`,
          [usedBotIds.size > 0 ? Array.from(usedBotIds) : ['__none__']]
        );
        if (avail.length === 0) break; // no bots left — fill with what we have

        const profile = avail[0];
        const instanceId = `${profile.id}_${lobby.id.replace(/-/g, '').slice(0, 8)}_${seat}`;
        const snapshot = {
          username:   profile.username,
          name:       profile.username,
          avatar:     profile.avatar,
          rating:     profile.rating,
          level:      profile.level,
          badge:      'bronze',
          difficulty: profile.difficulty,
          team:       seat % 2,
        };
        await client.query(
          `INSERT INTO game_lobby_participants (lobby_id, bot_id, instance_id, seat, snapshot)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT DO NOTHING`,
          [lobby.id, profile.id, instanceId, seat, JSON.stringify(snapshot)]
        );
        await client.query(
          `UPDATE game_lobby SET current_players = LEAST(max_players, current_players + 1), updated_at = NOW() WHERE id = $1`,
          [lobby.id]
        );
      }
    }

    const { rows: lobbyBotRows } = await client.query(
      `SELECT glp.bot_id, glp.instance_id, glp.seat, glp.snapshot
       FROM game_lobby_participants glp
       WHERE glp.lobby_id = $1
       ORDER BY glp.seat ASC`,
      [lobby.id]
    );

    for (const row of lobbyBotRows) {
      playerSnapshots.push({
        id:          row.bot_id,
        instanceId:  row.instance_id,
        username:    row.snapshot.username,
        displayName: row.snapshot.name,
        avatar:      row.snapshot.avatar,
        isBot:       true,
        team:        row.snapshot.team,
        seat:        row.seat,
        status:      'JOINED',
        rating:      row.snapshot.rating,
        level:       row.snapshot.level,
        badge:       row.snapshot.badge,
      });
    }

    await client.query(
      "UPDATE game_lobby SET status = 'WAITING', current_players = $2, updated_at = NOW() WHERE id = $1",
      [lobby.id, Math.min(lobby.max_players, playerSnapshots.length)]
    );

    // Randomize who sits where (corner/color) for this match.
    playerSnapshots = _rotatePlayerOrder(playerSnapshots, !!(lobby.settings?.teamsLocked));
    // Re-index seats (see joinMatchmaking) — rotated snapshots keep their
    // original seats, which can collide between humans and lobby bots.
    playerSnapshots.forEach((p, idx) => { p.seat = idx; });

    const matchMetadata = {
      lobbyId: lobby.id,
      matchGroupId: lobby.id,
      gameId: game.id,
      gameMode: gameModel.normalizeMatchMode(initialTicket.mode),
      playerIds: playerSnapshots.map(p => p.id),
      playerSnapshots,
      maxPlayers: lobby.max_players,
      teamsLocked: !!(lobby.settings?.teamsLocked),
      runtimeType: game.metadata?.runtimeType || 'app',
      tournamentId: initialTicket.tournament_id
    };

    // 1. Create game_sessions row explicitly (id = lobby.id — the socket
    // layer's auth joins game_participants → game_sessions on this id).
    // session_type MUST be 'MULTIPLAYER' — findActiveSession (the rejoin /
    // reconnect leg) filters on it, so a match-making session left at the
    // default 'SINGLE_PLAYER' can never be resumed after a disconnect.
    // NOTE: game_sessions has NO game_type column — it takes game_id.
    await client.query(
      `INSERT INTO game_sessions (id, game_id, session_type, status, max_players, mode, metadata)
       VALUES ($1, $2, 'MULTIPLAYER', 'ACTIVE', $3, $4, $5::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [lobby.id, game.id, lobby.max_players, gameModel.normalizeMatchMode(initialTicket.mode), JSON.stringify(matchMetadata)]
    );

    // 2. Insert game_participants
    for (const p of playerSnapshots) {
      if (p.isBot) {
        await client.query(
          `INSERT INTO game_participants
             (game_session_id, player_type, user_id, bot_id, instance_id, seat, snapshot)
           VALUES ($1, 'BOT', NULL, $2, $3, $4, $5::jsonb)
           ON CONFLICT (game_session_id, seat) DO NOTHING`,
          [lobby.id, p.id, p.instanceId, p.seat, JSON.stringify(p)]
        );
      } else {
        // Guarded: a user holding two tickets (re-queue race) yields two
        // snapshots with the same user_id — the (game_session_id, user_id)
        // unique constraint must not crash the whole fill transaction.
        await client.query(
          `INSERT INTO game_participants
             (game_session_id, player_type, user_id, bot_id, seat, snapshot)
           VALUES ($1, 'HUMAN', $2, NULL, $3, $4::jsonb)
           ON CONFLICT DO NOTHING`,
          [lobby.id, p.id, p.seat, JSON.stringify(p)]
        );
        await client.query(
          `UPDATE game_matchmaking_ticket
           SET status = 'MATCHED', match_group_id = $1, matched_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [lobby.id, playersRes.rows.find(r => r.user_id === p.id)?.ticket_id]
        );
      }
    }

    await client.query(
      "UPDATE game_lobby SET status = 'READY', current_players = max_players, started_at = NOW(), updated_at = NOW() WHERE id = $1",
      [lobby.id]
    );

    await client.query('COMMIT');
    
    return {
      status: 'MATCHED',
      ticket: { id: ticketId, status: 'MATCHED', lobby_id: lobby.id },
      lobbyId: lobby.id,
      players: playerSnapshots,
      matchMetadata
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const findGameMatchById = async ({ matchId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT gm.id, gm.user_id, gm.game_id, gm.mode, gm.result, gm.score, gm.duration, gm.xp_earned,
        gm.category, gm.difficulty, gm.metadata, gm.created_at, gm.updated_at,
        g.name AS game_name, g.slug AS game_slug, g.thumbnail AS game_thumbnail
      FROM ${gameModel.GAME_MATCH_TABLE} gm
      JOIN ${gameModel.GAME_TABLE} g ON g.id = gm.game_id
      WHERE gm.id = $1`,
      [matchId]
    );
    const match = rows[0] ? gameModel.formatGameMatch(rows[0]) : null;
    return match;
  } catch (error) {
    throw error;
  }
};

const cancelMatchmakingTicket = async ({ userId, ticketId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'WAITING'
      RETURNING *`,
      [ticketId, userId]
    );

    const ticket = rows[0];
    if (ticket && ticket.lobby_id) {
      const lobbyRes = await client.query(
        `UPDATE game_lobby SET current_players = current_players - 1, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [ticket.lobby_id]
      );
      const lobby = lobbyRes.rows[0];
      
      if (lobby.current_players <= 0) {
        await client.query(`UPDATE game_lobby SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`, [lobby.id]);
      } else {
        const playersRes = await client.query(
          `SELECT t.user_id, u.name, u.username, m.cloudfront_url AS avatar, t.id as ticket_id
           FROM ${gameModel.GAME_MATCHMAKING_TICKET_TABLE} t
           JOIN users u ON u.id = t.user_id
           LEFT JOIN media m ON m.id = u.avatar_url
           WHERE t.lobby_id = $1 AND t.status = 'WAITING'
           ORDER BY t.created_at ASC`,
          [lobby.id]
        );
        const playerSnapshots = playersRes.rows.map((r, index) => ({
          id: r.user_id,
          username: r.username,
          displayName: r.name,
          avatar: r.avatar,
          isBot: false,
          team: index % 2,
          seat: index
        }));
        ticket.lobbyState = {
          lobbyId: lobby.id,
          players: playerSnapshots,
          maxPlayers: lobby.max_players,
          currentPlayers: lobby.current_players,
          status: 'WAITING'
        };
      }
    }
    
    await client.query('COMMIT');
    const formatted = gameModel.formatMatchmakingTicket(ticket);
    if (ticket && ticket.lobbyState) {
      formatted.lobbyState = ticket.lobbyState;
    }
    return formatted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const findGameStatsByUserId = async ({ userId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${gameModel.GAME_STATS_FIELDS}
      FROM ${gameModel.GAME_STATS_TABLE}
      WHERE user_id = $1`,
      [userId]
    );
    const gameStats = rows[0] ? gameModel.formatGameStats(rows[0]) : null;
    return gameStats;
  } catch (error) {
    throw error;
  }
};

const createGameStatsByUserId = async ({ userId }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${gameModel.GAME_STATS_TABLE}
      (user_id)
      VALUES ($1)
      RETURNING *`,
      [userId]
    );
    const gameStats = rows[0] ? gameModel.formatGameStats(rows[0]) : null;
    return gameStats;
  } catch (error) {
    throw error;
  }
};

const setupMatchSession = async ({ matchId, gameId, userId, wsToken, mode, gameSlug }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch existing seats to determine this player's color
    const existing = await client.query(
      `SELECT player_color FROM game_participants WHERE game_session_id = $1`,
      [matchId]
    );
    const existingColors = existing.rows.map((r) => r.player_color);

    let playerColor = 'blue';
    if (gameSlug === 'chess') {
      if (existingColors.length === 0) {
        playerColor = Math.random() < 0.5 ? 'w' : 'b';
      } else {
        playerColor = existingColors.includes('b') ? 'w' : 'b';
      }
    } else if (gameSlug === 'ludo') {
      const colors = ['red', 'green', 'yellow', 'blue'];
      playerColor = colors.find((c) => !existingColors.includes(c)) || 'red';
    } else if (gameSlug === 'snake-ladder') {
      const colors = ['red', 'blue', 'green', 'yellow'];
      playerColor = colors.find((c) => !existingColors.includes(c)) || 'red';
    }

    // Assign a ws_token and player_color by updating the participant row.
    // The participant row was already inserted by startGameSession.
    await client.query(
      `UPDATE game_participants 
       SET ws_token = $1, player_color = $2
       WHERE game_session_id = $3 AND user_id = $4`,
      [wsToken, playerColor, matchId, userId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const createGameSession = async ({ sessionData }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO game_sessions (user_id, game_id, seed, expires_at, session_type, mode, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
      [
        sessionData.userId,
        sessionData.gameId,
        sessionData.seed,
        sessionData.expiresAt,
        // Matchmaking-created sessions are always MULTIPLAYER (the rejoin
        // query filters on this); the per-user session row must carry the
        // same type or getActiveSession can never find it.
        sessionData.isMultiplayer ? 'MULTIPLAYER' : 'SINGLE_PLAYER',
        sessionData.metadata?.mode || null,
        JSON.stringify(sessionData.metadata || {}),
      ]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const findGameSessionById = async ({ sessionId }) => {
  try {
    // Join the latest reward_ledger row so callers can read the validated score
    // of a session that already went PENDING (e.g. a retried completion call).
    const { rows } = await pool.query(
      `SELECT gs.*, rl.validated_score
       FROM game_sessions gs
       LEFT JOIN LATERAL (
         SELECT validated_score FROM reward_ledger
         WHERE session_id = gs.id ORDER BY created_at DESC LIMIT 1
       ) rl ON true
       WHERE gs.id = $1`,
      [sessionId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const updateGameSessionStatus = async ({ sessionId, status, completedAt }) => {
  try {
    const { rows } = await pool.query(
      `UPDATE game_sessions SET status = $1, ended_at = $2 WHERE id = $3 RETURNING *`,
      [status, completedAt, sessionId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const createRewardLedgerEntry = async ({ ledgerData }, clientToUse = pool) => {
  try {
    const { rows } = await clientToUse.query(
      `INSERT INTO reward_ledger (session_id, user_id, game_id, validated_score, xp_awarded, device_id, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        ledgerData.sessionId,
        ledgerData.userId,
        ledgerData.gameId,
        ledgerData.validatedScore,
        ledgerData.xpAwarded,
        ledgerData.deviceId,
        ledgerData.ipAddress,
      ]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const findOpponentSessionByMatchGroup = async ({ matchGroupId, excludeUserId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT gs.*, rl.validated_score
      FROM ${gameModel.GAME_SESSION_TABLE} gs
      LEFT JOIN reward_ledger rl ON rl.session_id = gs.id
      WHERE gs.metadata->>'matchGroupId' = $1
      AND gs.user_id <> $2
      LIMIT 1`,
      [matchGroupId, excludeUserId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const findCompletedMatchRecord = async ({ userId, matchGroupId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT result, score, xp_earned FROM ${gameModel.GAME_MATCH_TABLE}
       WHERE user_id = $1 AND metadata->>'matchGroupId' = $2 AND result IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`,
      [userId, matchGroupId]
    );
    return rows[0] || null;
  } catch (error) {
    return null;
  }
};

const getMatchArchivedState = async ({ matchId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT state_snapshot AS final_state
       FROM game_sessions
       WHERE id = $1`,
      [matchId]
    );
    if (!rows[0]?.final_state) return null;
    try {
      return JSON.parse(rows[0].final_state);
    } catch (e) {
      return null;
    }
  } catch (error) {
    return null;
  }
};

const getMatchRoster = async ({ matchId, excludeUserId }) => {
  const { rows } = await pool.query(
    `SELECT gp.user_id, u.name, u.username, m.cloudfront_url AS avatar,
            COALESCE(x.total_xp_earned, 0) AS xp, gp.player_color,
            gp.player_type, gp.bot_id, gp.snapshot
     FROM game_participants gp
     LEFT JOIN users u ON u.id = gp.user_id
     LEFT JOIN media m ON m.id = u.avatar_url
     LEFT JOIN xp x ON x.user_id = u.id
     WHERE gp.game_session_id = $1${excludeUserId ? ' AND gp.user_id IS DISTINCT FROM $2' : ''}
     ORDER BY gp.created_at ASC`,
    excludeUserId ? [matchId, excludeUserId] : [matchId]
  );

  const roster = rows.map((r) => {
    if (r.player_type === 'BOT') {
      return {
        id: r.bot_id,
        name: r.snapshot?.name || r.snapshot?.username || 'Bot',
        username: r.snapshot?.username,
        avatar: r.snapshot?.avatar || null,
        level: r.snapshot?.level || 1,
        isBot: true,
        color: r.player_color,
      };
    }
    return {
      id: r.user_id,
      name: r.name,
      username: r.username,
      avatar: r.avatar,
      level: Math.floor((Number(r.xp) || 0) / 1000) + 1,
      color: r.player_color,
    };
  });

  return roster;
};

const findActiveSession = async ({ userId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT gs.id AS session_id, gs.game_id, gs.id AS match_id, 
              gp.ws_token, gs.mode, g.slug AS game_slug, g.name AS game_name,
              g.thumbnail AS game_thumbnail, gs.metadata as match_metadata
       FROM game_sessions gs
       JOIN game_participants gp ON gp.game_session_id = gs.id AND gp.user_id = $1
       JOIN game g ON g.id = gs.game_id
       WHERE gs.status = 'ACTIVE' 
         AND gs.session_type = 'MULTIPLAYER'
         AND gs.expires_at >= $2
       ORDER BY gs.expires_at DESC LIMIT 1`,
      [userId, new Date(Date.now() - 2 * 60 * 60 * 1000)]
    );

    if (rows.length === 0) return null;

    // Get opponent name if PvP
    let opponentName = null;
    const opps = await pool.query(
      `SELECT u.name, u.username FROM game_participants gp
        JOIN users u ON u.id = gp.user_id
        WHERE gp.game_session_id = $1 AND gp.user_id != $2 LIMIT 1`,
      [rows[0].match_id, userId]
    );
    if (opps.rows.length > 0) {
      opponentName = opps.rows[0].name || opps.rows[0].username;
    } else {
      // Check if opponent is a bot
      const bots = await pool.query(
        `SELECT bot_id FROM game_participants 
         WHERE game_session_id = $1 AND player_type = 'BOT' LIMIT 1`,
        [rows[0].match_id]
      );
      if (bots.rows.length > 0) {
        opponentName = bots.rows[0].bot_id; // Will use the snapshot data on client
      }
    }

    return { ...rows[0], opponent_name: opponentName };
  } catch (error) {
    throw error;
  }
};



// ==========================================
// NEW LOBBY RESOURCE METHODS
// ==========================================

const { formatLobbyDTO } = require('./game.dto');

// Lobby a user is STILL queued in (ticket status WAITING) — used to replay
// the lobby's state on socket (re)connect so a mid-queue drop doesn't leave
// the client stuck on the searching screen. Returns the ticket's context
// (mode + tournamentId) alongside the lobby id so a replayed TOURNAMENT queue
// carries its tournament identity — tournament tickets are WAITING exactly
// like AUTO/PRACTICE ones, so they already flow through this path.
const findActiveQueuedLobby = async ({ userId }) => {
  const { rows } = await pool.query(
    `SELECT t.lobby_id, t.mode, t.tournament_id
     FROM ${gameModel.GAME_MATCHMAKING_TICKET_TABLE} t
     WHERE t.user_id = $1 AND t.status = 'WAITING'
     ORDER BY t.created_at DESC
     LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row?.lobby_id) return null;
  return {
    lobbyId: row.lobby_id,
    mode: row.mode,
    tournamentId: row.tournament_id || null,
  };
};

// A MATCHED ticket whose match is still live (not yet completed) — used to
// replay `matchmaking:matched` on socket (re)connect so a match created while
// the user was offline starts instantly without waiting for a poll. Only fresh
// matches (created in the last 10 minutes) are replayed; anything older means
// the user already saw it or the match timed out server-side.
const findActiveMatchedMatch = async ({ userId }) => {
  const { rows } = await pool.query(
    `SELECT t.id AS ticket_id, t.lobby_id, t.user_match_id, t.matched_at,
            gm.metadata, gm.result, gm.created_at AS match_created_at
     FROM ${gameModel.GAME_MATCHMAKING_TICKET_TABLE} t
     JOIN ${gameModel.GAME_MATCH_TABLE} gm ON gm.id = t.user_match_id
     WHERE t.user_id = $1 AND t.status = 'MATCHED'
       AND gm.result IS NULL
       AND gm.created_at > NOW() - INTERVAL '10 minutes'
     ORDER BY t.matched_at DESC
     LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;

  const matchMetadata = row.metadata || null;
  const players = Array.isArray(matchMetadata?.playerSnapshots)
    ? matchMetadata.playerSnapshots
    : [];
  return {
    status: 'MATCHED',
    lobbyId: row.lobby_id,
    ticket: {
      id: row.ticket_id,
      status: 'MATCHED',
      lobbyId: row.lobby_id,
      userMatchId: row.user_match_id,
      matchedAt: row.matched_at,
    },
    players,
    matchMetadata,
  };
};

const getLobby = async ({ userId, lobbyId }) => {
  const { rows } = await pool.query('SELECT * FROM game_lobby WHERE id = $1', [lobbyId]);
  if (!rows[0]) throw require('../../utils/error.util').createError('Lobby not found', 404);
  
  const playersRes = await pool.query(
    `SELECT t.user_id as "userId", u.name as "displayName", m.cloudfront_url AS avatar, t.id as ticket_id, t.metadata
     FROM game_matchmaking_ticket t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN media m ON m.id = u.avatar_url
     WHERE t.lobby_id = $1 AND t.status != 'CANCELLED'
     ORDER BY t.created_at ASC`,
    [lobbyId]
  );
  
  const players = playersRes.rows.map(p => ({
    ...p,
    seat: p.metadata?.seat,
    team: p.metadata?.team,
    lobbyRole: p.metadata?.lobbyRole || (rows[0].host_user_id === p.userId ? 'HOST' : 'PLAYER'),
    isReady: p.metadata?.isReady,
    isBot: false,
    status: p.metadata?.status || 'CONNECTED'
  }));

  // Merge bots from game_lobby_participants — the pre-session roster SSOT
  const { rows: lobbyBotRows } = await pool.query(
    `SELECT glp.bot_id, glp.instance_id, glp.seat, glp.snapshot
     FROM game_lobby_participants glp
     WHERE glp.lobby_id = $1
     ORDER BY glp.seat ASC`,
    [lobbyId]
  );
  for (const row of lobbyBotRows) {
    players.push({
      userId:    row.instance_id,
      displayName: row.snapshot.name,
      avatar:    row.snapshot.avatar,
      seat:      row.seat,
      team:      row.snapshot.team,
      lobbyRole: 'PLAYER',
      isReady:   true,
      isBot:     true,
      status:    'BOT',
      rating:    row.snapshot.rating,
      level:     row.snapshot.level,
      badge:     row.snapshot.badge,
    });
  }

  return formatLobbyDTO(rows[0], players);
};

const updateLobby = async ({ userId, lobbyId, updates }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE', [lobbyId]);
    const lobby = rows[0];
    if (!lobby) throw require('../../utils/error.util').createError('Lobby not found', 404);
    if (lobby.host_user_id !== userId) throw require('../../utils/error.util').createError('Only the host can update the lobby', 403);
    
    if (updates.visibility) lobby.visibility = updates.visibility;
    if (updates.teamsLocked !== undefined) {
      lobby.settings = lobby.settings || {};
      lobby.settings.teamsLocked = updates.teamsLocked;
    }
    if (updates.autoBalance !== undefined) {
       lobby.settings = lobby.settings || {};
       lobby.settings.autoBalance = updates.autoBalance;
    }
    if (updates.targetPlayers !== undefined) {
       if (updates.targetPlayers < lobby.current_players) {
         throw require('../../utils/error.util').createError('Target players cannot be less than current players', 400);
       }
       // Clamp to the game's natural max — prevent exceeding the game's capacity.
       const GameRegistry = require('./engine/GameRegistry');
       const gameSlug = lobby.game_id;
       const registryMeta = GameRegistry.getMeta(gameSlug) || {};
       const naturalMax = registryMeta.maxPlayers || require('./game.model').resolveNaturalMaxPlayers({ slug: gameSlug });
       const clamped = Math.min(updates.targetPlayers, naturalMax);
       lobby.max_players = clamped;
       lobby.settings = lobby.settings || {};
       lobby.settings.targetPlayers = clamped;
    }
    if (updates.rounds !== undefined) {
       const GameRegistry = require('./engine/GameRegistry');
       const { rows: gameRows } = await client.query('SELECT slug FROM game WHERE id = $1', [lobby.game_id]);
       const gameSlug = gameRows[0]?.slug;
       const registryMeta = GameRegistry.getMeta(gameSlug) || {};
       const roundsConfig = registryMeta.rounds || { min: 1, max: 1, default: 1 };
       const clampedRounds = Math.max(roundsConfig.min, Math.min(roundsConfig.max, updates.rounds));
       lobby.settings = lobby.settings || {};
       lobby.settings.configuredRounds = clampedRounds;
    }
    
    const updated = await client.query(
      'UPDATE game_lobby SET visibility = $1, settings = $2::jsonb, max_players = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
      [lobby.visibility, JSON.stringify(lobby.settings || {}), lobby.max_players, lobbyId]
    );
    await client.query('COMMIT');
    return await getLobby({ userId, lobbyId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const deleteLobby = async ({ userId, lobbyId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE', [lobbyId]);
    const lobby = rows[0];
    if (!lobby) throw require('../../utils/error.util').createError('Lobby not found', 404);
    if (lobby.host_user_id !== userId) throw require('../../utils/error.util').createError('Only the host can delete the lobby', 403);
    
    await client.query('UPDATE game_lobby SET status = \'CANCELLED\', updated_at = NOW() WHERE id = $1', [lobbyId]);
    await client.query('UPDATE game_matchmaking_ticket SET status = \'CANCELLED\' WHERE lobby_id = $1', [lobbyId]);
    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const joinLobbyByCode = async ({ userId, inviteCode }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: lobbyRows } = await client.query('SELECT * FROM game_lobby WHERE invite_code = $1 AND status IN (\'WAITING\', \'TIMED_OUT\') FOR UPDATE', [inviteCode]);
    const lobby = lobbyRows[0];
    if (!lobby) throw require('../../utils/error.util').createError('Invalid or expired invite code', 404);
    if (lobby.current_players >= lobby.max_players) throw require('../../utils/error.util').createError('Lobby is full', 400);

    const { rows: existing } = await client.query('SELECT * FROM game_matchmaking_ticket WHERE lobby_id = $1 AND user_id = $2 AND status != \'CANCELLED\'', [lobby.id, userId]);
    if (existing.length > 0) throw require('../../utils/error.util').createError('Already in this lobby', 400);

    // Get a free seat (smallest unused index)
    const { rows: players } = await client.query('SELECT metadata->>\'seat\' as seat FROM game_matchmaking_ticket WHERE lobby_id = $1 AND status != \'CANCELLED\'', [lobby.id]);
    const usedSeats = players.map(p => parseInt(p.seat)).filter(s => !isNaN(s));
    let seat = 0;
    while(usedSeats.includes(seat)) seat++;

    const metadata = { seat, team: seat, isReady: false, lobbyRole: 'PLAYER', status: 'CONNECTED' };
    const lobbyMode = lobby.settings?.mode || 'CUSTOM';

    await client.query(
      'INSERT INTO game_matchmaking_ticket (user_id, game_id, mode, status, lobby_id, metadata) VALUES ($1, $2, $3, \'WAITING\', $4, $5::jsonb)',
      [userId, lobby.game_id, lobbyMode, lobby.id, JSON.stringify(metadata)]
    );

    await client.query('UPDATE game_lobby SET current_players = current_players + 1 WHERE id = $1', [lobby.id]);
    await client.query('COMMIT');
    return await getLobby({ userId, lobbyId: lobby.id });
  } catch(e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

const getLobbyPlayers = async ({ userId, lobbyId }) => {
  const l = await getLobby({ userId, lobbyId });
  return l.players;
};

const updateLobbyPlayer = async ({ userId, lobbyId, targetUserId, updates }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE', [lobbyId]);
    if (!rows[0]) throw require('../../utils/error.util').createError('Lobby not found', 404);
    
    // Only host or the player themselves can update player
    if (rows[0].host_user_id !== userId && userId !== targetUserId) {
        throw require('../../utils/error.util').createError('Unauthorized', 403);
    }
    
    const { rows: tRows } = await client.query('SELECT * FROM game_matchmaking_ticket WHERE lobby_id = $1 AND user_id = $2 AND status != \'CANCELLED\' FOR UPDATE', [lobbyId, targetUserId]);
    if (!tRows[0]) throw require('../../utils/error.util').createError('Player not found in lobby', 404);
    
    let meta = tRows[0].metadata || {};
    if (updates.team !== undefined) meta.team = updates.team;
    if (updates.seat !== undefined) meta.seat = updates.seat;
    if (updates.isReady !== undefined) meta.isReady = updates.isReady;
    if (updates.lobbyRole !== undefined) {
        if (rows[0].host_user_id !== userId) throw require('../../utils/error.util').createError('Only host can assign roles', 403);
        meta.lobbyRole = updates.lobbyRole;
        if (updates.lobbyRole === 'HOST') {
            await client.query('UPDATE game_lobby SET host_user_id = $1 WHERE id = $2', [targetUserId, lobbyId]);
        }
    }
    
    await client.query('UPDATE game_matchmaking_ticket SET metadata = $1::jsonb WHERE id = $2', [JSON.stringify(meta), tRows[0].id]);
    await client.query('COMMIT');
    return await getLobby({ userId, lobbyId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const removeLobbyPlayer = async ({ userId, lobbyId, targetUserId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE', [lobbyId]);
    const lobby = rows[0];
    if (!lobby) throw require('../../utils/error.util').createError('Lobby not found', 404);

    // Only host or the player themselves can remove
    if (lobby.host_user_id !== userId && userId !== targetUserId) {
      throw require('../../utils/error.util').createError('Unauthorized', 403);
    }

    const currentSettings = { ...(lobby.settings || {}) };
    const pendingInvites = Array.isArray(currentSettings.pendingInvites) ? currentSettings.pendingInvites : [];

    // Check if this is a bot (stored in game_lobby_participants, not in tickets)
    const { rows: botRows } = await client.query(
      'SELECT id FROM game_lobby_participants WHERE lobby_id = $1 AND instance_id = $2',
      [lobbyId, targetUserId]
    );
    const isBot = botRows.length > 0;
    const isPendingInvite = !isBot && pendingInvites.some(inv => inv.userId === targetUserId);

    if (isBot) {
      await client.query(
        'DELETE FROM game_lobby_participants WHERE lobby_id = $1 AND instance_id = $2',
        [lobbyId, targetUserId]
      );
      await client.query(
        'UPDATE game_lobby SET current_players = current_players - 1, updated_at = NOW() WHERE id = $1',
        [lobbyId]
      );
    } else if (isPendingInvite) {
      // Remove the pending invite (host cancelled it / friend declined)
      currentSettings.pendingInvites = pendingInvites.filter(inv => inv.userId !== targetUserId);
      await client.query(
        'UPDATE game_lobby SET settings = $1::jsonb, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(currentSettings), lobbyId]
      );
    } else {
      // Real player — cancel their ticket
      await client.query(
        'UPDATE game_matchmaking_ticket SET status = \'CANCELLED\' WHERE lobby_id = $1 AND user_id = $2',
        [lobbyId, targetUserId]
      );
      await client.query(
        'UPDATE game_lobby SET current_players = current_players - 1, updated_at = NOW() WHERE id = $1',
        [lobbyId]
      );

      // Host migration — promote next real player
      if (lobby.host_user_id === targetUserId) {
        const { rows: remain } = await client.query(
          'SELECT user_id FROM game_matchmaking_ticket WHERE lobby_id = $1 AND status != \'CANCELLED\' ORDER BY created_at ASC LIMIT 1',
          [lobbyId]
        );
        if (remain[0]) {
          await client.query('UPDATE game_lobby SET host_user_id = $1 WHERE id = $2', [remain[0].user_id, lobbyId]);
        } else {
          await client.query('UPDATE game_lobby SET status = \'CANCELLED\', updated_at = NOW() WHERE id = $1', [lobbyId]);
        }
      }
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const inviteLobbyPlayer = async ({ userId, lobbyId, opponentId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: lobbyRows } = await client.query(
      'SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE',
      [lobbyId]
    );
    const lobby = lobbyRows[0];
    if (!lobby) throw require('../../utils/error.util').createError('Lobby not found', 404);
    if (lobby.host_user_id !== userId) throw require('../../utils/error.util').createError('Only the host can invite players', 403);
    if (lobby.current_players >= lobby.max_players) throw require('../../utils/error.util').createError('Lobby is full', 400);
    if (opponentId === userId) throw require('../../utils/error.util').createError('Cannot invite yourself', 400);

    // Check if they already have an active ticket (already joined)
    const { rows: existingRows } = await client.query(
      `SELECT id FROM game_matchmaking_ticket
       WHERE lobby_id = $1 AND user_id = $2 AND status != 'CANCELLED'
       LIMIT 1`,
      [lobbyId, opponentId]
    );
    if (existingRows[0]) {
      await client.query('COMMIT');
      return await getLobby({ userId, lobbyId });
    }

    // Get sender name for notification
    const { rows: senderRows } = await client.query(
      `SELECT name, username FROM users WHERE id = $1`,
      [userId]
    );
    const senderName = senderRows[0]?.name || senderRows[0]?.username || 'Someone';

    // Get game name
    const { rows: gameRows } = await client.query(
      `SELECT name FROM game WHERE id = $1`,
      [lobby.game_id]
    );
    const gameName = gameRows[0]?.name || 'a game';

    // Store pending invite in lobby settings (no ticket yet — friend must accept)
    const currentSettings = lobby.settings || {};
    const pendingInvites = currentSettings.pendingInvites || [];
    // Remove any old invite for same opponent
    const filtered = pendingInvites.filter(inv => inv.userId !== opponentId);
    filtered.push({ userId: opponentId, invitedAt: new Date().toISOString() });
    currentSettings.pendingInvites = filtered;

    await client.query(
      'UPDATE game_lobby SET settings = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(currentSettings), lobbyId]
    );

    await client.query('COMMIT');

    // Push invite notification to the friend — they must tap Accept to join
    // Payload format: "Accept to join {name}'s lobby | lobbyId | inviteCode"
    const inviteCode = lobby.invite_code || lobbyId.split('-')[0].toUpperCase();
    try {
      const notificationRepo = require('../notification/notification.repository');
      const notification = await notificationRepo.createNotification({
        recipientId: opponentId,
        senderId: userId,
        type: 'GAME_INVITE',
        title: `${senderName} invited you to play ${gameName}!`,
        message: `Tap to join their private lobby | ${lobbyId} | ${inviteCode}`,
        resourceType: 'game_lobby',
        resourceId: lobby.game_id,
      });
      // Also push real-time via socket
      const { emitNotification } = require('../../sockets/account.socket');
      emitNotification(opponentId, {
        ...notification,
        type: 'GAME_INVITE',
        payload: { lobbyId, inviteCode, gameName, senderName },
      });
      // Queue a push when the friend is not connected to the socket right now.
      const redis = require('../../config/redis');
      const status = await redis.get(`user:status:${opponentId}`).catch(() => null);
      if (status !== 'online') {
        const { addJob } = require('../../jobs/queues/job.queue');
        await addJob('notification:push', {
          recipientId: opponentId,
          senderId: userId,
          type: 'GAME_INVITE',
          title: `${senderName} invited you to play ${gameName}!`,
          message: `Tap to join their private lobby | ${lobbyId} | ${inviteCode}`,
          resourceType: 'game_lobby',
          resourceId: lobby.game_id,
        });
      }
    } catch (notifErr) {
      console.error('Failed to send invite notification:', notifErr.message);
    }

    // Also send game invite card to chat (background, no navigation)
    try {
      const chatService = require('../chat/chat.service');
      const convId = await chatService.getOrCreateConversation(userId, opponentId);
      await chatService.sendMessage(convId, userId, {
        messageType: 'game_invite',
        gameName,
        gameInviteCode: inviteCode,
        gameLobbyId: lobbyId,
      });
    } catch (chatErr) {
      console.error('Failed to send game invite to chat:', chatErr.message);
    }

    return await getLobby({ userId, lobbyId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const shrinkLobby = async ({ userId, lobbyId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE', [lobbyId]);
    const lobby = rows[0];
    if (!lobby) throw require('../../utils/error.util').createError('Lobby not found', 404);
    if (lobby.host_user_id !== userId) throw require('../../utils/error.util').createError('Only the host can shrink', 403);

    // update max_players to current_players, status = READY
    await client.query('UPDATE game_lobby SET max_players = current_players, status = \'READY\' WHERE id = $1', [lobbyId]);
    
    // Need to trigger MATCHED for all players
    // For simplicity, we delegate this to fillMatchmakingLobby but avoid bots.
    await client.query('COMMIT');

    const result = await fillMatchmakingLobby({ userId, ticketId: null, overrideLobbyId: lobbyId, fillBots: false });
    return result;
  } catch(e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/**
 * Adds one or more bots to a CUSTOM lobby (host-triggered manual add).
 *
 * Selects bots from the bots table and inserts them into game_lobby_participants.
 * No bot data is written to settings.
 */
const fillLobbyBots = async ({ userId, lobbyId, count = 1 }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: lobbyRows } = await client.query(
      'SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE',
      [lobbyId]
    );
    const lobby = lobbyRows[0];
    if (!lobby) throw require('../../utils/error.util').createError('Lobby not found', 404);
    if (lobby.host_user_id !== userId) throw require('../../utils/error.util').createError('Only the host can add bots', 403);

    const slotsToFill = Math.max(0, Math.min(Number(count) || 1, lobby.max_players - lobby.current_players));
    if (slotsToFill <= 0) {
      await client.query('COMMIT');
      return await getLobby({ userId, lobbyId });
    }

    // Seats occupied by real players and already-assigned bots
    const { rows: ticketSeatRows } = await client.query(
      `SELECT metadata->>'seat' AS seat FROM game_matchmaking_ticket
       WHERE lobby_id = $1 AND status != 'CANCELLED'`,
      [lobbyId]
    );
    const { rows: botRows } = await client.query(
      'SELECT seat, bot_id FROM game_lobby_participants WHERE lobby_id = $1',
      [lobbyId]
    );
    const usedSeats = new Set([
      ...ticketSeatRows.map(r => parseInt(r.seat, 10)).filter(s => !isNaN(s)),
      ...botRows.map(r => r.seat),
    ]);
    const usedBotIds = new Set(botRows.map(r => r.bot_id).filter(Boolean));

    // Pick enough unused bots in deterministic order.
    // COALESCE guards the exclusion array against NULL poisoning.
    const { rows: available } = await client.query(
      `SELECT * FROM bots
       WHERE is_active = true
         AND id != ALL(COALESCE($1::varchar[], ARRAY[]::varchar[]))
       ORDER BY id ASC
       LIMIT $2`,
      [usedBotIds.size > 0 ? Array.from(usedBotIds) : ['__none__'], slotsToFill]
    );
    if (available.length < slotsToFill) throw require('../../utils/error.util').createError('Not enough active bots available', 400);

    for (let i = 0; i < slotsToFill; i++) {
      let seat = 0;
      while (usedSeats.has(seat)) seat++;
      usedSeats.add(seat);

      const profile = available[i];
      const instanceId = `${profile.id}_${lobbyId.replace(/-/g, '').slice(0, 8)}_${seat}`;
      const snapshot = {
        username:   profile.username,
        name:       profile.username,
        avatar:     profile.avatar,
        rating:     profile.rating,
        level:      profile.level,
        badge:      'bronze',
        difficulty: profile.difficulty,
        team:       seat % 2,
      };

      await client.query(
        `INSERT INTO game_lobby_participants (lobby_id, bot_id, instance_id, seat, snapshot)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [lobbyId, profile.id, instanceId, seat, JSON.stringify(snapshot)]
      );
    }

    await client.query(
      `UPDATE game_lobby
       SET current_players = current_players + $1, updated_at = NOW()
       WHERE id = $2`,
      [slotsToFill, lobbyId]
    );

    await client.query('COMMIT');
    return await getLobby({ userId, lobbyId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Adds exactly ONE bot to a WAITING lobby (gradual bot-fill).
 *
 * Selects the next available bot from the bots table and inserts it directly
 * into game_lobby_participants — the pre-session roster SSOT. settings only
 * retains botFillNextAt (pacing config) and the count of occupied seats for
 * the pacing gate. No bot profile data lives in settings.
 *
 * Returns { added: true } when a bot was added, or { added: false } when the
 * lobby is not fillable (not WAITING, full, or still pacing).
 */
const addOneBotToLobby = async ({ lobbyId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: lobbyRows } = await client.query(
      'SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE',
      [lobbyId]
    );
    const lobby = lobbyRows[0];
    if (!lobby) throw require('../../utils/error.util').createError('Lobby not found', 404);

    if (lobby.status !== 'WAITING' || lobby.current_players >= lobby.max_players) {
      await client.query('COMMIT');
      return { added: false };
    }

    const currentSettings = { ...(lobby.settings || {}) };

    // Pacing: at most one bot per window so they join gradually, like real players.
    const nextFillAt = Number(currentSettings.botFillNextAt) || 0;
    if (nextFillAt > Date.now()) {
      await client.query('COMMIT');
      return { added: false };
    }

    // Seats already taken by real players (tickets) and bots already assigned
    const { rows: ticketSeatRows } = await client.query(
      `SELECT metadata->>'seat' AS seat FROM game_matchmaking_ticket
       WHERE lobby_id = $1 AND status != 'CANCELLED'`,
      [lobbyId]
    );
    // bot_id MUST be selected here — usedBotIds is built from it below. (This
    // query previously selected only `seat`, so every bot_id was undefined →
    // serialized as NULL in the array → `id != ALL(ARRAY[NULL,...])` evaluates
    // to NULL for every row → no bot was ever "available" after the first one
    // joined, and the gradual fill stalled at exactly one bot.)
    const { rows: botSeatRows } = await client.query(
      'SELECT seat, bot_id FROM game_lobby_participants WHERE lobby_id = $1',
      [lobbyId]
    );
    const usedSeats = new Set([
      ...ticketSeatRows.map(r => parseInt(r.seat, 10)).filter(s => !isNaN(s)),
      ...botSeatRows.map(r => r.seat),
    ]);
    const usedBotIds = new Set(botSeatRows.map(r => r.bot_id).filter(Boolean));

    let seat = 0;
    while (usedSeats.has(seat)) seat++;

    // Pick the next unused bot from the bots table (deterministic order by id
    // so the same lobby always sees the same sequence of bots).
    // COALESCE guards the sentinel array so the exclusion can never be NULL-poisoned.
    const { rows: available } = await client.query(
      `SELECT * FROM bots
       WHERE is_active = true
         AND id != ALL(COALESCE($1::varchar[], ARRAY[]::varchar[]))
       ORDER BY id ASC
       LIMIT 1`,
      [usedBotIds.size > 0 ? Array.from(usedBotIds) : ['__none__']]
    );
    if (available.length === 0) {
      await client.query('COMMIT');
      return { added: false };
    }

    const profile = available[0];
    const instanceId = `${profile.id}_${lobbyId.replace(/-/g, '').slice(0, 8)}_${seat}`;
    const snapshot = {
      username:   profile.username,
      name:       profile.username, // bots table has username as display name
      avatar:     profile.avatar,
      rating:     profile.rating,
      level:      profile.level,
      badge:      'bronze',
      difficulty: profile.difficulty,
      team:       seat % 2,
    };

    await client.query(
      `INSERT INTO game_lobby_participants (lobby_id, bot_id, instance_id, seat, snapshot)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [lobbyId, profile.id, instanceId, seat, JSON.stringify(snapshot)]
    );

    // Advance pacing gate and increment slot count — no bot roster in settings
    currentSettings.botFillNextAt = Date.now() + 2500 + Math.floor(Math.random() * 2500);

    await client.query(
      `UPDATE game_lobby
       SET settings = $1::jsonb,
           current_players = current_players + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(currentSettings), lobbyId]
    );

    await client.query('COMMIT');
    return { added: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Marks a CUSTOM lobby as queued for matchmaking (host pressed "Auto Match & Proceed").
 *
 * The lobby stays fully manual while sitting on the lobby screen — bots are never
 * auto-added there. Only once the host explicitly queues it does the matchmaking
 * sweep (resolveBotFillingLobbies) start filling the remaining slots with bots,
 * one at a time, and start the match when the lobby is full.
 *
 * Host-only. Idempotent: re-queueing just resets the queue clock.
 *
 * active=false un-queues the lobby (returns it to the fully manual lobby screen).
 */
const queueLobbyForMatchmaking = async ({ userId, lobbyId, active = true }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE', [lobbyId]);
    const lobby = rows[0];
    if (!lobby) throw require('../../utils/error.util').createError('Lobby not found', 404);
    if (lobby.host_user_id !== userId) throw require('../../utils/error.util').createError('Only the host can queue the lobby', 403);

    // The bot-fill sweep may have already resolved the lobby between the time the
    // host hit "Auto Match & Proceed" and this call landing: it can be LOCKED
    // (mid-fill, status flips WAITING -> LOCKED -> WAITING -> READY) or READY
    // (match already created + matchmaking:matched already emitted). Never fail
    // those with "Lobby is not waiting" — the host re-queueing is idempotent.
    //   - LOCKED:      return the current lobby; the sweep finishes and the
    //                  frontend transitions via matchmaking:matched.
    //   - READY:       return a MATCHED-shaped payload (players + matchMetadata)
    //                  so the frontend starts the game immediately.
    if (lobby.status === 'LOCKED') {
      await client.query('COMMIT');
      return await getLobby({ userId, lobbyId });
    }
    if (lobby.status === 'READY') {
      const matchRes = await client.query(
        `SELECT metadata FROM game_match
         WHERE metadata->>'matchGroupId' = $1 AND user_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [lobbyId, userId]
      );
      const matchMetadata = matchRes.rows[0]?.metadata || null;
      await client.query('COMMIT');
      // The frontend reads players from matchMetadata.playerSnapshots, so only
      // the match metadata is needed here.
      return {
        status: 'MATCHED',
        lobbyId,
        matchMetadata,
      };
    }
    if (lobby.status !== 'WAITING') throw require('../../utils/error.util').createError('Lobby is not waiting', 400);

    const currentSettings = { ...(lobby.settings || {}) };
    if (active) {
      currentSettings.matchmakingQueuedAt = Date.now();
      delete currentSettings.botFillNextAt; // allow the first bot right after the 15s window
    } else {
      delete currentSettings.matchmakingQueuedAt;
      delete currentSettings.botFillNextAt;
    }

    await client.query(
      `UPDATE game_lobby SET settings = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(currentSettings), lobbyId]
    );
    await client.query('COMMIT');
    return await getLobby({ userId, lobbyId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const continueLobby = async ({ userId, lobbyId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE', [lobbyId]);
    if (!rows[0]) throw require('../../utils/error.util').createError('Lobby not found', 404);
    
    await client.query(
      'UPDATE game_lobby SET expires_at = NOW() + INTERVAL \'60 seconds\', status = \'WAITING\', timeout_extensions = timeout_extensions + 1 WHERE id = $1 RETURNING *',
      [lobbyId]
    );
    await client.query('COMMIT');
    return await getLobby({ userId, lobbyId });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const startLobby = async ({ userId, lobbyId }) => {
  return await fillMatchmakingLobby({ userId, ticketId: null, overrideLobbyId: lobbyId, fillBots: false });
};

const cancelMatchmaking = async (userId) => {
  // Find any waiting ticket(s) — a user can accumulate more than one WAITING
  // ticket for the same lobby (e.g. a re-queue raced the cancel), so decrement
  // the lobby count per cancelled ticket, not just once.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE game_matchmaking_ticket SET status = 'CANCELLED', updated_at = NOW() WHERE user_id = $1 AND status = 'WAITING' RETURNING lobby_id`,
      [userId]
    );
    if (rows[0] && rows[0].lobby_id) {
       const lobbyId = rows[0].lobby_id;
       if (rows.length > 1) {
         await client.query(
           `UPDATE game_matchmaking_ticket SET status = 'CANCELLED', updated_at = NOW()
            WHERE user_id = $1 AND status = 'WAITING' AND lobby_id = $2`,
           [userId, lobbyId]
         );
       }
       await client.query(
         'UPDATE game_lobby SET current_players = GREATEST(0, current_players - $1), updated_at = NOW() WHERE id = $2',
         [rows.length, lobbyId]
       );
       // Check if 0 players, cancel lobby
       const lobbyRows = await client.query('SELECT current_players FROM game_lobby WHERE id = $1', [lobbyId]);
       if (lobbyRows[0] && lobbyRows[0].current_players <= 0) {
           await client.query('UPDATE game_lobby SET status = \'CANCELLED\', updated_at = NOW() WHERE id = $1', [lobbyId]);
       }
       await client.query('COMMIT');
       return { lobbyState: await getLobby({ userId, lobbyId }) };
    }
    await client.query('COMMIT');
    return { success: true };
  } catch(e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

module.exports = {
  findActiveQueuedLobby,
  findActiveMatchedMatch,
  getLobby,
  updateLobby,
  deleteLobby,
  joinLobbyByCode,
  getLobbyPlayers,
  updateLobbyPlayer,
  removeLobbyPlayer,
  inviteLobbyPlayer,
  shrinkLobby,
  fillLobbyBots,
  addOneBotToLobby,
  queueLobbyForMatchmaking,
  continueLobby,
  startLobby,
  cancelMatchmaking,
  findManyGames,
  findManyGamesBydDfficulty,
  findGameById,
  searchGames,
  createGameMatche,
  updateGameMatcheByMatchId,
  completeGameMatch,
  findManyGameMatshs,
  recordMatchHistory,
  findGameMatchById,
  findGameStatsByUserId,
  createGameStatsByUserId,
  findLeaderboard,
  findTournamentLeaderboard,
  findTournaments,
  findTournamentById,
  joinTournament,
  hasTournamentEntry,
  recordTournamentEntryResult,
  findMatchmakingTicketById,
  cancelMatchmakingTicket, fillMatchmakingLobby,
  getTrendingGames,
  joinMatchmaking,
  setupMatchSession,
  createGameSession,
  findGameSessionById,
  updateGameSessionStatus,
  createRewardLedgerEntry,
  findOpponentSessionByMatchGroup,
  getMatchArchivedState,
  findCompletedMatchRecord,
  findActiveSession,
  getMatchRoster,
};
