'use strict';

const pool = require('../../config/database');
const gameModel = require('./game.model');

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
        g.name AS game_name, g.slug AS game_slug`,
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
        g.name AS game_name, g.slug AS game_slug, COUNT(*) OVER() AS total
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
    await pool.query(
      `INSERT INTO ${gameModel.GAME_MATCH_TABLE} 
       (user_id, game_id, mode, result, score, duration, xp_earned, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [userId, gameId, gameModel.normalizeMatchMode(mode), result, score, duration, xpEarned]
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
      ORDER BY gte.score DESC NULLS LAST
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
        EXISTS (
          SELECT 1 FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} mine
          WHERE mine.tournament_id = gt.id AND mine.user_id = $1 AND mine.status <> 'CANCELLED'
        ) AS is_joined,
        COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_TOURNAMENT_TABLE} gt
      JOIN ${gameModel.GAME_TABLE} g ON g.id = gt.game_id
      LEFT JOIN ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} gte
        ON gte.tournament_id = gt.id AND gte.status <> 'CANCELLED'
      WHERE gt.status IN ('ACTIVE', 'UPCOMING') AND gt.ends_at > NOW()
      GROUP BY gt.id, g.name, g.slug
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
        EXISTS (
          SELECT 1 FROM ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} mine
          WHERE mine.tournament_id = gt.id AND mine.user_id = $2 AND mine.status <> 'CANCELLED'
        ) AS is_joined
      FROM ${gameModel.GAME_TOURNAMENT_TABLE} gt
      JOIN ${gameModel.GAME_TABLE} g ON g.id = gt.game_id
      LEFT JOIN ${gameModel.GAME_TOURNAMENT_ENTRY_TABLE} gte
        ON gte.tournament_id = gt.id AND gte.status <> 'CANCELLED'
      WHERE gt.id = $1
      GROUP BY gt.id, g.name, g.slug`,
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
          g.name AS game_name, g.slug AS game_slug
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

const joinMatchmaking = async ({ userId, game, mode, tournamentId, targetPlayers, visibility = "PUBLIC" }) => {
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
        // Exact size: only join a lobby with matching max_players
        const lobbyResult = await client.query(
          `SELECT * FROM game_lobby 
           WHERE game_id = $1 
             AND status = 'WAITING' 
             AND current_players < max_players
             AND max_players = $2
             AND ((settings->>'mode' = $3) OR (settings->>'mode' IS NULL AND visibility = 'PUBLIC'))
           ORDER BY created_at ASC 
           FOR UPDATE SKIP LOCKED 
           LIMIT 1`,
          [game.id, maxPlayers, normalizedMode]
        );
        lobby = lobbyResult.rows[0];
      }
    }

    if (!lobby) {
      // autoSize: true marks lobbies created without an explicit targetPlayers so the
      // bot-fill path can size the match to the game's natural player count (e.g. 4 for ludo).
      const settings = JSON.stringify({ mode: normalizedMode, targetPlayers: maxPlayers, autoSize: isAutoAny, teamsLocked: false, autoBalance: true });
      // CUSTOM lobbies stay open 30 minutes; AUTO/PRACTICE lobbies 30 seconds (bot fallback kicks in at 15s)
      const expirySeconds = normalizedMode === 'CUSTOM' ? 1800 : 30;
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
        JSON.stringify({ runtime: game.metadata?.runtime, queuedAt: new Date().toISOString() })
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
      seat: index,
      status: 'JOINED'
    }));

    // Mid-fill joins: the gradual bot-fill sweep may have already added bots to
    // settings.bots during the 15s+ window. Include them in the match payload so
    // they don't silently disappear when this real player fills the last slot.
    const midFillBots = Array.isArray(lobby.settings?.bots) ? lobby.settings.bots : [];
    for (const bot of midFillBots) {
      playerSnapshots.push({
        id: bot.id,
        username: bot.username,
        displayName: bot.name,
        avatar: bot.avatar,
        isBot: true,
        team: bot.team,
        seat: bot.seat,
        status: 'JOINED',
        rating: bot.rating,
        level: bot.level,
        badge: bot.badge,
      });
    }

    if (lobby.current_players === lobby.max_players) {
      const startedAt = new Date().toISOString();
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
        runtime: game.metadata?.runtime,
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

    const remaining = lobby.max_players - lobby.current_players;

    const playersRes = await client.query(
      `SELECT t.user_id, u.name, u.username, m.cloudfront_url AS avatar, t.id as ticket_id
       FROM game_matchmaking_ticket t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN media m ON m.id = u.avatar_url
       WHERE t.lobby_id = $1 AND (t.status = 'WAITING' OR t.status = 'MATCHED')
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
      seat: index,
      status: 'JOINED'
    }));

    // Add bots from settings.bots[] first (already added via fillLobbyBots)
    const existingBots = Array.isArray(lobby.settings?.bots) ? lobby.settings.bots : [];
    for (const bot of existingBots) {
      playerSnapshots.push({
        id: bot.id,
        username: bot.username,
        displayName: bot.name,
        avatar: bot.avatar,
        isBot: true,
        team: bot.team,
        seat: bot.seat,
        status: 'JOINED',
        rating: bot.rating,
        level: bot.level,
        badge: bot.badge,
      });
    }

    // Fill any remaining empty slots with new bots stored in settings.bots[]
    const stillNeeded = remaining - existingBots.length;
    const updatedSettings = { ...(lobby.settings || {}) };
    updatedSettings.bots = [...existingBots];

    if (stillNeeded > 0) {
      const usedSeats = new Set(playerSnapshots.map(p => p.seat));
      for (let i = 0; i < stillNeeded; i++) {
        let seat = 0;
        while (usedSeats.has(seat)) seat++;
        usedSeats.add(seat);

        const profile = botProfileForSeat(lobby.id, seat);
        const botId = `${profile.id}_${lobby.id.replace(/-/g, '').slice(0, 8)}_${seat}`;
        const newBot = {
          id: botId,
          username: profile.username,
          name: profile.name,
          avatar: profile.avatar,
          rating: profile.rating,
          level: profile.level,
          badge: profile.badge,
          difficulty: profile.difficulty,
          seat,
          team: seat % 2,
          isBot: true,
          isReady: true,
        };
        updatedSettings.bots.push(newBot);
        playerSnapshots.push({
          id: botId,
          username: profile.username,
          displayName: profile.name,
          avatar: profile.avatar,
          isBot: true,
          team: seat % 2,
          seat,
          status: 'JOINED',
          rating: profile.rating,
          level: profile.level,
          badge: profile.badge,
        });
      }
      // Persist the new bots into settings
      await client.query(
        `UPDATE game_lobby SET settings = $1::jsonb WHERE id = $2`,
        [JSON.stringify(updatedSettings), lobby.id]
      );
    }

    await client.query(
      `UPDATE game_lobby SET status = 'WAITING', current_players = $2, updated_at = NOW() WHERE id = $1`,
      [lobby.id, Math.min(lobby.max_players, playerSnapshots.length)]
    );

    const startedAt = new Date().toISOString();

    const matchMetadata = {
      lobbyId: lobby.id,
      matchGroupId: lobby.id,
      gameId: game.id,
      gameMode: gameModel.normalizeMatchMode(initialTicket.mode),
      playerIds: playerSnapshots.map(p => p.id),
      playerSnapshots,
      maxPlayers: lobby.max_players,
      teamsLocked: !!(lobby.settings?.teamsLocked),
      startedAt,
      runtime: game.metadata?.runtime,
      tournamentId: initialTicket.tournament_id
    };

    for (const p of playerSnapshots) {
      if (!p.isBot) {
        const matchRes = await client.query(
          `INSERT INTO game_match
            (user_id, game_id, mode, category, difficulty, metadata)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          RETURNING *`,
          [p.id, game.id, gameModel.normalizeMatchMode(initialTicket.mode), game.category || null, game.difficulty || null, JSON.stringify(matchMetadata)]
        );

        await client.query(
          `UPDATE game_matchmaking_ticket
           SET status = 'MATCHED', user_match_id = $1, matched_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [matchRes.rows[0].id, playersRes.rows.find(r => r.user_id === p.id).ticket_id]
        );
      }
    }

    await client.query(
      `UPDATE game_lobby SET status = 'READY', current_players = max_players, started_at = NOW(), updated_at = NOW() WHERE id = $1`,
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
        g.name AS game_name, g.slug AS game_slug
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

    // Ensure the game_matches row exists
    await client.query(
      `INSERT INTO game_matches (id, game_id, mode, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [matchId, gameId, gameModel.normalizeMatchMode(mode)]
    );

    // Fetch existing colors to determine this player's color
    const existing = await client.query(
      `SELECT player_color FROM match_members WHERE match_id = $1`,
      [matchId]
    );
    const existingColors = existing.rows.map((r) => r.player_color);

    let playerColor = 'blue';
    if (gameSlug === 'chess') {
      playerColor = existingColors.includes('b') ? 'w' : 'b';
    } else if (gameSlug === 'ludo') {
      const colors = ['red', 'green', 'yellow', 'blue'];
      playerColor = colors.find((c) => !existingColors.includes(c)) || 'red';
    } else if (gameSlug === 'snake-ladder') {
      const colors = ['red', 'blue', 'green', 'yellow'];
      playerColor = colors.find((c) => !existingColors.includes(c)) || 'red';
    }

    // Insert the member token
    await client.query(
      `INSERT INTO match_members (match_id, user_id, ws_token, player_color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (match_id, user_id) DO UPDATE SET ws_token = EXCLUDED.ws_token, player_color = EXCLUDED.player_color`,
      [matchId, userId, wsToken, playerColor]
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
      `INSERT INTO game_sessions (user_id, game_id, seed, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
      [
        sessionData.userId,
        sessionData.gameId,
        sessionData.seed,
        sessionData.expiresAt,
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
    const { rows } = await pool.query(`SELECT * FROM game_sessions WHERE id = $1`, [sessionId]);
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const updateGameSessionStatus = async ({ sessionId, status, completedAt }) => {
  try {
    const { rows } = await pool.query(
      `UPDATE game_sessions SET status = $1, completed_at = $2 WHERE id = $3 RETURNING *`,
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
      `SELECT metadata->>'finalState' AS final_state
       FROM game_matches
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

const findActiveSession = async ({ userId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT gs.id AS session_id, gs.game_id, gs.metadata->>'matchGroupId' AS match_id, 
              mm.ws_token, gs.metadata->>'mode' AS mode, g.slug AS game_slug, g.name AS game_name,
              gm.metadata as match_metadata
       FROM game_sessions gs
       JOIN match_members mm ON mm.match_id::text = gs.metadata->>'matchGroupId' AND mm.user_id = gs.user_id
       JOIN game_matches gm ON gm.id::text = gs.metadata->>'matchGroupId'
       JOIN game g ON g.id = gs.game_id
       WHERE gs.user_id = $1 
         AND gs.status = 'ACTIVE' 
         AND gm.status = 'ACTIVE'
         AND gs.expires_at >= $2
       ORDER BY gs.expires_at DESC LIMIT 1`,
      [userId, new Date(Date.now() - 2 * 60 * 60 * 1000)]
    );

    if (rows.length === 0) return null;

    // Get opponent name if PvP
    let opponentName = null;
    const opps = await pool.query(
      `SELECT u.name, u.username FROM match_members mm
        JOIN users u ON u.id = mm.user_id
        WHERE mm.match_id = $1 AND mm.user_id != $2 LIMIT 1`,
      [rows[0].match_id, userId]
    );
    if (opps.rows.length > 0) {
      opponentName = opps.rows[0].name || opps.rows[0].username;
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

  // Merge bots stored in settings.bots[] — they are never in game_matchmaking_ticket
  const settingsBots = Array.isArray(rows[0].settings?.bots) ? rows[0].settings.bots : [];
  for (const bot of settingsBots) {
    players.push({
      userId: bot.id,
      displayName: bot.name,
      avatar: bot.avatar,
      seat: bot.seat,
      team: bot.team,
      lobbyRole: 'PLAYER',
      isReady: true,
      isBot: true,
      status: 'BOT',
      rating: bot.rating,
      level: bot.level,
      badge: bot.badge,
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
       lobby.max_players = updates.targetPlayers;
       lobby.settings = lobby.settings || {};
       lobby.settings.targetPlayers = updates.targetPlayers;
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
    const existingBots = Array.isArray(currentSettings.bots) ? currentSettings.bots : [];
    const pendingInvites = Array.isArray(currentSettings.pendingInvites) ? currentSettings.pendingInvites : [];

    // Check if this is a bot (stored in settings.bots, not in tickets)
    const isBot = existingBots.some(b => b.id === targetUserId);
    // A pending invite has NO ticket — the friend never joined. Removing it just
    // drops the invite from settings.pendingInvites (current_players unchanged).
    // Previously this fell through to the "real player" branch, decrementing
    // current_players for a player who was never in the lobby.
    const isPendingInvite = !isBot && pendingInvites.some(inv => inv.userId === targetUserId);

    if (isBot) {
      // Remove from settings.bots[]
      currentSettings.bots = existingBots.filter(b => b.id !== targetUserId);
      await client.query(
        'UPDATE game_lobby SET settings = $1::jsonb, current_players = current_players - 1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(currentSettings), lobbyId]
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
      const { emitNotification } = require('../../sockets/notification.socket');
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

// Bots look like real players: human names, normal-looking usernames and
// profile photos (never "bot" prefixes or robot avatars) so auto-match fills
// read as real opponents. The internal id keeps the bot_ prefix so backend
// result handling (game.service.js) can still detect them.
//
// `difficulty` maps the profile's rating to a gameplay skill tier used by the
// bot engine (BotManager) — weak bots make realistic mistakes, strong ones
// genuinely win more. Keep in sync with PROFILE_DIFFICULTY in BotManager.js.
const BOT_PROFILES = [
  { id: 'bot_001', username: 'alpha_001',   name: 'Aarav Singh',      avatar: 'https://i.pravatar.cc/150?img=12',   rating: 1250, level: 10, badge: 'silver',   difficulty: 'Easy'   },
  { id: 'bot_002', username: 'beta_002',    name: 'Trisha',           avatar: 'https://imgtree.co/direct/zdoNE3sg', rating: 1420, level: 15, badge: 'gold',     difficulty: 'Medium' },
  { id: 'bot_003', username: 'gamma_003',   name: 'Kabir Mehta',      avatar: 'https://i.pravatar.cc/150?img=59',   rating: 1600, level: 20, badge: 'platinum', difficulty: 'Medium' },
  { id: 'bot_004', username: 'delta_004',   name: 'Ananya Iyer',      avatar: 'https://i.pravatar.cc/150?img=32',   rating: 1100, level:  8, badge: 'bronze',   difficulty: 'Easy'   },
  { id: 'bot_005', username: 'epsilon_005', name: 'Rohan Khanna',     avatar: 'https://i.pravatar.cc/150?img=68',   rating: 1350, level: 12, badge: 'silver',   difficulty: 'Medium' },
  { id: 'bot_006', username: 'kappa_006',   name: 'Sara Khan',        avatar: 'https://i.pravatar.cc/150?img=25',   rating: 1550, level: 18, badge: 'gold',     difficulty: 'Medium' },
  { id: 'bot_007', username: 'epsilon_007', name: 'Arjun Reddy',      avatar: 'https://i.pravatar.cc/150?img=53',   rating: 1800, level: 25, badge: 'diamond',  difficulty: 'Hard'   },
  { id: 'bot_008', username: 'sigma_008',   name: 'Thalapathy Vijay', avatar: 'https://imgtree.co/direct/yZfKfhS8', rating: 1950, level: 30, badge: 'master',   difficulty: 'Hard'   },
];

// Deterministic per-lobby shuffle of BOT_PROFILES (seeded by lobby id) so the
// same seats get different-looking opponents in different lobbies, while the
// order stays stable within one lobby (bots join one at a time during the
// gradual bot-fill sweep and must never repeat). Uses FNV-1a hashing + a tiny
// LCG, so a 4-player lobby can't always pick the same first 4 bots.
const _hashSeed = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const _shuffledBotProfiles = (lobbyId) => {
  const arr = [...BOT_PROFILES];
  let seed = _hashSeed(String(lobbyId || 'lobby'));
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const botProfileForSeat = (lobbyId, seat) => {
  const profiles = _shuffledBotProfiles(lobbyId);
  return profiles[seat % profiles.length];
};

/**
 * Adds bot(s) to a lobby by storing them in game_lobby.settings.bots[].
 * Bots are never inserted into game_matchmaking_ticket (which requires real user UUIDs).
 * current_players is incremented so slot counts remain accurate.
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

    // Current bots already in settings
    const currentSettings = { ...(lobby.settings || {}) };
    const existingBots = Array.isArray(currentSettings.bots) ? currentSettings.bots : [];

    // Collect seats already taken by real players (from tickets)
    const { rows: ticketSeatRows } = await client.query(
      `SELECT metadata->>'seat' AS seat FROM game_matchmaking_ticket
       WHERE lobby_id = $1 AND status != 'CANCELLED'`,
      [lobbyId]
    );
    const usedSeats = new Set([
      ...ticketSeatRows.map(r => parseInt(r.seat, 10)).filter(s => !isNaN(s)),
      ...existingBots.map(b => b.seat),
    ]);

    const newBots = [];
    for (let i = 0; i < slotsToFill; i++) {
      let seat = 0;
      while (usedSeats.has(seat)) seat++;
      usedSeats.add(seat);

      const profile = botProfileForSeat(lobbyId, seat);
      // Give each bot a unique id scoped to this lobby+seat so the frontend can key on it
      const botId = `${profile.id}_${lobbyId.replace(/-/g, '').slice(0, 8)}_${seat}`;
      newBots.push({
        id: botId,
        username: profile.username,
        name: profile.name,
        avatar: profile.avatar,
        rating: profile.rating,
        level: profile.level,
        badge: profile.badge,
        difficulty: profile.difficulty,
        seat,
        team: seat % 2,
        isBot: true,
        isReady: true,
        lobbyRole: 'PLAYER',
        status: 'BOT',
      });
    }

    currentSettings.bots = [...existingBots, ...newBots];

    await client.query(
      `UPDATE game_lobby
       SET settings = $1::jsonb,
           current_players = current_players + $2,
           updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(currentSettings), slotsToFill, lobbyId]
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
 * Used by the matchmaking sweep (resolveBotFillingLobbies) so that, after the
 * 15s real-player window, bots join one at a time — spaced by botFillPacingMs
 * — just like real players trickling in. Bots live in settings.bots[] and
 * current_players is incremented so slot counts stay accurate.
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

    const currentSettings = { ...(lobby.settings || {}) };
    const existingBots = Array.isArray(currentSettings.bots) ? currentSettings.bots : [];

    if (lobby.status !== 'WAITING' || lobby.current_players >= lobby.max_players) {
      await client.query('COMMIT');
      return { added: false };
    }

    // Pacing: at most one bot per window so they join gradually, like real players.
    const nextFillAt = Number(currentSettings.botFillNextAt) || 0;
    if (nextFillAt > Date.now()) {
      await client.query('COMMIT');
      return { added: false };
    }

    // Collect seats already taken by real players (from tickets) and existing bots
    const { rows: ticketSeatRows } = await client.query(
      `SELECT metadata->>'seat' AS seat FROM game_matchmaking_ticket
       WHERE lobby_id = $1 AND status != 'CANCELLED'`,
      [lobbyId]
    );
    const usedSeats = new Set([
      ...ticketSeatRows.map(r => parseInt(r.seat, 10)).filter(s => !isNaN(s)),
      ...existingBots.map(b => b.seat),
    ]);

    let seat = 0;
    while (usedSeats.has(seat)) seat++;
    usedSeats.add(seat);

    const profile = botProfileForSeat(lobbyId, seat);
    const botId = `${profile.id}_${lobbyId.replace(/-/g, '').slice(0, 8)}_${seat}`;
    const newBot = {
      id: botId,
      username: profile.username,
      name: profile.name,
      avatar: profile.avatar,
      rating: profile.rating,
      level: profile.level,
      badge: profile.badge,
      difficulty: profile.difficulty,
      seat,
      team: seat % 2,
      isBot: true,
      isReady: true,
      lobbyRole: 'PLAYER',
      status: 'BOT',
    };

    // Stagger the next bot ~2.5–5s out, with a little randomness so it feels human
    currentSettings.bots = [...existingBots, newBot];
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
  // Find any waiting ticket
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE game_matchmaking_ticket SET status = 'CANCELLED' WHERE user_id = $1 AND status = 'WAITING' RETURNING lobby_id`,
      [userId]
    );
    if (rows[0] && rows[0].lobby_id) {
       await client.query('UPDATE game_lobby SET current_players = current_players - 1 WHERE id = $1', [rows[0].lobby_id]);
       // Check if 0 players, cancel lobby
       const lobbyRows = await client.query('SELECT current_players FROM game_lobby WHERE id = $1', [rows[0].lobby_id]);
       if (lobbyRows[0] && lobbyRows[0].current_players <= 0) {
           await client.query('UPDATE game_lobby SET status = \'CANCELLED\' WHERE id = $1', [rows[0].lobby_id]);
       }
       await client.query('COMMIT');
       return { lobbyState: await getLobby({ userId, lobbyId: rows[0].lobby_id }) };
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
};
