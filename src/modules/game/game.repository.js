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
        matchData.mode,
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

const recordMatchHistory = async ({ userId, gameId, mode, result, score, duration, xpEarned }) => {
  try {
    await pool.query(
      `INSERT INTO ${gameModel.GAME_MATCH_TABLE} 
       (user_id, game_id, mode, result, score, duration, xp_earned, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [userId, gameId, mode || 'QUICK', result, score, duration, xpEarned]
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

const joinMatchmaking = async ({ userId, game, mode, tournamentId, targetPlayers }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE user_id = $1
        AND game_id = $2
        AND mode = $3
        AND status = 'WAITING'
        AND (($4::uuid IS NULL AND tournament_id IS NULL) OR tournament_id = $4::uuid)`,
      [userId, game.id, mode, tournamentId || null]
    );

    const maxPlayers = targetPlayers || game.metadata?.maxPlayers || 2;

    const lobbyResult = await client.query(
      `SELECT * FROM game_lobby 
       WHERE game_id = $1 
         AND status = 'WAITING' 
         AND current_players < max_players
         AND max_players = $2
       ORDER BY created_at ASC 
       FOR UPDATE SKIP LOCKED 
       LIMIT 1`,
      [game.id, maxPlayers]
    );

    let lobby = lobbyResult.rows[0];
    if (!lobby) {
      const newLobbyRes = await client.query(
        `INSERT INTO game_lobby (game_id, status, max_players, current_players, host_user_id, expires_at)
         VALUES ($1, 'WAITING', $2, 0, $3, NOW() + INTERVAL '10 seconds')
         RETURNING *`,
        [game.id, maxPlayers, userId]
      );
      lobby = newLobbyRes.rows[0];
    }

    const ticketRes = await client.query(
      `INSERT INTO ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
        (user_id, game_id, tournament_id, mode, status, lobby_id, metadata)
      VALUES ($1, $2, $3, $4, 'WAITING', $5, $6::jsonb)
      RETURNING *`,
      [
        userId, game.id, tournamentId || null, mode, lobby.id,
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

    if (lobby.current_players === lobby.max_players) {
      const startedAt = new Date().toISOString();
      const matchMetadata = {
        lobbyId: lobby.id,
        gameId: game.id,
        gameMode: mode,
        playerIds: playerSnapshots.map(p => p.id),
        playerSnapshots,
        maxPlayers: lobby.max_players,
        startedAt,
        runtime: game.metadata?.runtime,
        tournamentId
      };

      for (const p of playerSnapshots) {
        const matchRes = await client.query(
          `INSERT INTO ${gameModel.GAME_MATCH_TABLE}
            (user_id, game_id, mode, category, difficulty, metadata)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          RETURNING *`,
          [p.id, game.id, mode, game.category || null, game.difficulty || null, JSON.stringify(matchMetadata)]
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

const fillMatchmakingLobby = async ({ userId, ticketId }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const initialTicketRes = await client.query(
      `SELECT lobby_id, game_id, mode, tournament_id FROM game_matchmaking_ticket WHERE id = $1 AND user_id = $2`,
      [ticketId, userId]
    );
    const initialTicket = initialTicketRes.rows[0];
    if (!initialTicket) throw new Error("Ticket not found");

    const lobbyRes = await client.query(
      `SELECT * FROM game_lobby WHERE id = $1 FOR UPDATE`,
      [initialTicket.lobby_id]
    );
    const lobby = lobbyRes.rows[0];

    if (lobby.status !== 'WAITING') {
      await client.query('ROLLBACK');
      return { status: 'MATCHED', message: 'Lobby already processed' };
    }

    if (lobby.current_players >= lobby.max_players) {
      await client.query('ROLLBACK');
      return { status: 'MATCHED', message: 'Lobby is already full' };
    }

    await client.query(`UPDATE game_lobby SET status = 'LOCKED' WHERE id = $1`, [lobby.id]);

    const remaining = lobby.max_players - lobby.current_players;

    const BOT_PROFILES = [
      { id: 'bot-11111111-1111-1111-1111-111111111111', username: 'bot_alpha', name: 'Bot Alpha', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Alpha', rating: 1250, level: 10, badge: 'silver' },
      { id: 'bot-22222222-2222-2222-2222-222222222222', username: 'bot_bravo', name: 'Bot Bravo', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Bravo', rating: 1420, level: 15, badge: 'gold' },
      { id: 'bot-33333333-3333-3333-3333-333333333333', username: 'bot_charlie', name: 'Bot Charlie', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Charlie', rating: 1600, level: 20, badge: 'platinum' },
      { id: 'bot-44444444-4444-4444-4444-444444444444', username: 'bot_delta', name: 'Bot Delta', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Delta', rating: 1100, level: 8, badge: 'bronze' },
      { id: 'bot-55555555-5555-5555-5555-555555555555', username: 'bot_echo', name: 'Bot Echo', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Echo', rating: 1350, level: 12, badge: 'silver' },
      { id: 'bot-66666666-6666-6666-6666-666666666666', username: 'bot_nova', name: 'Bot Nova', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Nova', rating: 1550, level: 18, badge: 'gold' },
      { id: 'bot-77777777-7777-7777-7777-777777777777', username: 'bot_blaze', name: 'Bot Blaze', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Blaze', rating: 1800, level: 25, badge: 'diamond' },
      { id: 'bot-88888888-8888-8888-8888-888888888888', username: 'bot_titan', name: 'Bot Titan', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Titan', rating: 1950, level: 30, badge: 'master' }
    ];

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

    let seatIndex = playerSnapshots.length;
    for (let i = 0; i < remaining; i++) {
      const bot = BOT_PROFILES[i % BOT_PROFILES.length];
      playerSnapshots.push({
        id: bot.id,
        username: bot.username,
        displayName: bot.name,
        avatar: bot.avatar,
        isBot: true,
        team: seatIndex % 2,
        seat: seatIndex,
        status: 'JOINED',
        rating: bot.rating,
        level: bot.level,
        badge: bot.badge
      });
      seatIndex++;
    }

    const startedAt = new Date().toISOString();
    
    const gameRes = await client.query(`SELECT * FROM game WHERE id = $1`, [initialTicket.game_id]);
    const game = gameRes.rows[0];

    const matchMetadata = {
      lobbyId: lobby.id,
      gameId: game.id,
      gameMode: initialTicket.mode,
      playerIds: playerSnapshots.map(p => p.id),
      playerSnapshots,
      maxPlayers: lobby.max_players,
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
          [p.id, game.id, initialTicket.mode, game.category || null, game.difficulty || null, JSON.stringify(matchMetadata)]
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
      [matchId, gameId, mode || 'QUICK']
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

const findActiveBotSession = async ({ userId, gameId }) => {
  try {
    const { rows } = await pool.query(
      `SELECT gs.id, gs.metadata->>'matchGroupId' AS match_id, mm.ws_token
       FROM game_sessions gs
       JOIN match_members mm ON mm.match_id::text = gs.metadata->>'matchGroupId' AND mm.user_id = gs.user_id
       JOIN game_matches gm ON gm.id::text = gs.metadata->>'matchGroupId'
       WHERE gs.user_id = $1 AND gs.game_id = $2 
         AND gs.status = 'ACTIVE' 
         AND gs.metadata->>'mode' = 'bot' 
         AND gm.status = 'ACTIVE'
         AND gs.expires_at >= NOW()
       ORDER BY gs.expires_at DESC LIMIT 1`,
      [userId, gameId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
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
    if (rows[0].mode !== 'bot' && rows[0].mode !== 'BOT') {
      const opps = await pool.query(
        `SELECT u.name, u.username FROM match_members mm
          JOIN users u ON u.id = mm.user_id
          WHERE mm.match_id = $1 AND mm.user_id != $2 LIMIT 1`,
        [rows[0].match_id, userId]
      );
      if (opps.rows.length > 0) {
        opponentName = opps.rows[0].name || opps.rows[0].username;
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
    status: p.metadata?.status || 'CONNECTED'
  }));

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
    
    const updated = await client.query(
      'UPDATE game_lobby SET visibility = $1, settings = $2::jsonb, updated_at = NOW() WHERE id = $3 RETURNING *',
      [lobby.visibility, JSON.stringify(lobby.settings || {}), lobbyId]
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

    await client.query(
      'INSERT INTO game_matchmaking_ticket (user_id, game_id, mode, status, lobby_id, metadata) VALUES ($1, $2, $3, \'WAITING\', $4, $5::jsonb)',
      [userId, lobby.game_id, 'QUICK', lobby.id, JSON.stringify(metadata)]
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
    if (!rows[0]) throw require('../../utils/error.util').createError('Lobby not found', 404);
    
    // Only host or the player themselves can remove
    if (rows[0].host_user_id !== userId && userId !== targetUserId) {
        throw require('../../utils/error.util').createError('Unauthorized', 403);
    }
    
    await client.query('UPDATE game_matchmaking_ticket SET status = \'CANCELLED\' WHERE lobby_id = $1 AND user_id = $2', [lobbyId, targetUserId]);
    await client.query('UPDATE game_lobby SET current_players = current_players - 1 WHERE id = $1', [lobbyId]);
    
    // Host migration
    if (rows[0].host_user_id === targetUserId) {
        const { rows: remain } = await client.query('SELECT user_id FROM game_matchmaking_ticket WHERE lobby_id = $1 AND status != \'CANCELLED\' ORDER BY created_at ASC LIMIT 1', [lobbyId]);
        if (remain[0]) {
            await client.query('UPDATE game_lobby SET host_user_id = $1 WHERE id = $2', [remain[0].user_id, lobbyId]);
        } else {
            await client.query('UPDATE game_lobby SET status = \'CANCELLED\' WHERE id = $1', [lobbyId]);
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
  // To be integrated with notifications
  return { success: true };
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

const fillLobbyBots = async ({ userId, lobbyId }) => {
  return await fillMatchmakingLobby({ userId, ticketId: null, overrideLobbyId: lobbyId, fillBots: true });
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
  findActiveBotSession,
  findActiveSession,
};
