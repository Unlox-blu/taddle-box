'use strict';

const pool = require('../../config/database');
const gameModel = require('./game.model');


const findManyGames = async ({limit, offset}) => {
  try {
    const {rows} = await pool.query(
      `SELECT ${gameModel.GAME_FIELDS}, COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_TABLE}
      WHERE is_active = TRUE
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
    const total = rows[0]?.total || 0;
    const games = rows.map(gameModel.formatGame)
    return { games, total: parseInt(total, 10) };
  } catch (error) {
    throw error
  }
}

const findManyGamesBydDfficulty = async ({difficulty, limit, offset}) => {
  try {
    const {rows} = await pool.query(
      `SELECT ${gameModel.GAME_FIELDS}, COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_TABLE}
      WHERE is_active = TRUE AND difficulty = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [difficulty, limit, offset]
    )
    const total = rows[0]?.total || 0;
    const games = rows.map(gameModel.formatGame)
    return { games, total: parseInt(total, 10) };
  } catch (error) {
    throw error
  }
}

const findGameById = async ({gameId}) => {
  try {
    const {rows} = await pool.query(
      `SELECT ${gameModel.GAME_FIELDS}
      FROM ${gameModel.GAME_TABLE}
      WHERE id = $1`,
      [gameId]
    )    
    const game = rows[0] ? gameModel.formatGame(rows[0]) : null
    return  game ;
  } catch (error) {
    throw error
  }
}

const searchGames = async ({query, limit, offset}) => {
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
    const games = rows.map(gameModel.formatGame) 
    return { games, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};


const createGameMatche = async ({matchData}) => {
  try {
    const {rows} = await pool.query(
      `INSERT INTO ${gameModel.GAME_MATCH_TABLE}
      (user_id, game_id, mode, category, difficulty, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING *`,
      [
        matchData.userId, matchData.gameId, matchData.mode, 
        matchData.category || null, matchData.difficulty || null, JSON.stringify(matchData.metadata || [])
      ]
    )
    const match = gameModel.formatGameMatch(rows[0])
    return match
  } catch (error) {
    throw error
  }
}

const updateGameMatcheByMatchId = async ({matchData}) => {
  try {
    const {rows} = await pool.query(
      `UPDATE ${gameModel.GAME_MATCH_TABLE}
      SET result = $1, score = $2, duration = $3, xp_earned = $4, updated_at = NOW()
      WHERE id = $5 AND user_id = $6 AND result IS NULL
      RETURNING *`,
      [
        matchData.result, matchData.score, matchData.duration, 
        matchData.xpEarned, matchData.matchId, matchData.userId
      ]
    )
    const match = gameModel.formatGameMatch(rows[0])
    return match
  } catch (error) {
    throw error
  }
}

const completeGameMatch = async ({matchData}) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {rows} = await client.query(
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
          score = GREATEST(score, $2),
          xp_earned = GREATEST(xp_earned, $3),
          updated_at = NOW()
        WHERE tournament_id = $4 AND user_id = $5`,
        [rows[0].id, matchData.score, matchData.xpEarned, tournamentId, matchData.userId]
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
}

const findManyGameMatshs = async ({userId, limit, offset}) => {
  try {
    const {rows} = await pool.query(
      `SELECT gm.id, gm.user_id, gm.game_id, gm.mode, gm.result, gm.score, gm.duration, gm.xp_earned,
        gm.category, gm.difficulty, gm.metadata, gm.created_at, gm.updated_at,
        g.name AS game_name, g.slug AS game_slug, COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_MATCH_TABLE} gm
      JOIN ${gameModel.GAME_TABLE} g ON g.id = gm.game_id
      WHERE gm.user_id = $1 AND gm.result IS NOT NULL
      ORDER BY gm.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )
    const total = rows[0]?.total || 0;
    const matchs = rows.map(gameModel.formatGameMatch)
    return { matchs, total: parseInt(total, 10) };
  } catch (error) {
    throw error
  }
}

const findLeaderboard = async ({limit, offset}) => {
  try {
    const {rows} = await pool.query(
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
}

const findTournaments = async ({userId, limit, offset}) => {
  try {
    const {rows} = await pool.query(
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
}

const findTournamentById = async ({tournamentId, userId}) => {
  try {
    const {rows} = await pool.query(
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
}

const joinTournament = async ({userId, tournamentId}) => {
  try {
    const {rows} = await pool.query(
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
}

const hasTournamentEntry = async ({userId, tournamentId}) => {
  try {
    const {rows} = await pool.query(
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
}

const findMatchmakingTicketById = async ({userId, ticketId}) => {
  try {
    const {rows} = await pool.query(
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

    return {ticket, match};
  } catch (error) {
    throw error;
  }
}

const cancelWaitingMatchmakingTickets = async ({userId, gameId, mode, tournamentId}) => {
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
}

const joinMatchmaking = async ({userId, game, mode, tournamentId}) => {
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

    const opponentResult = await client.query(
      `SELECT q.*, u.name AS opponent_name, u.username AS opponent_username
      FROM ${gameModel.GAME_MATCHMAKING_TICKET_TABLE} q
      JOIN users u ON u.id = q.user_id
      WHERE q.game_id = $1
        AND q.mode = $2
        AND q.status = 'WAITING'
        AND q.user_id <> $3
        AND (($4::uuid IS NULL AND q.tournament_id IS NULL) OR q.tournament_id = $4::uuid)
      ORDER BY q.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1`,
      [game.id, mode, userId, tournamentId || null]
    );

    const matchGroupResult = await client.query('SELECT uuid_generate_v4() AS id');
    const matchGroupId = matchGroupResult.rows[0].id;

    if (!opponentResult.rows[0]) {
      const waitingResult = await client.query(
        `INSERT INTO ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
          (user_id, game_id, tournament_id, mode, status, match_group_id, metadata)
        VALUES ($1, $2, $3, $4, 'WAITING', $5, $6::jsonb)
        RETURNING *`,
        [
          userId,
          game.id,
          tournamentId || null,
          mode,
          matchGroupId,
          JSON.stringify({runtime: game.metadata?.runtime, queuedAt: new Date().toISOString()}),
        ]
      );

      await client.query('COMMIT');
      return {
        status: 'WAITING',
        ticket: gameModel.formatMatchmakingTicket(waitingResult.rows[0]),
        match: null,
        opponent: null,
      };
    }

    const opponentTicket = opponentResult.rows[0];
    const startedAt = new Date().toISOString();
    const currentUserResult = await client.query(
      `SELECT name, username FROM users WHERE id = $1`,
      [userId]
    );
    const currentUser = currentUserResult.rows[0] || {};

    const userMatchResult = await client.query(
      `INSERT INTO ${gameModel.GAME_MATCH_TABLE}
        (user_id, game_id, mode, category, difficulty, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING *`,
      [
        userId,
        game.id,
        mode,
        game.category || null,
        game.difficulty || null,
        JSON.stringify({
          runtime: game.metadata?.runtime,
          tournamentId,
          matchGroupId,
          opponentUserId: opponentTicket.user_id,
          opponentName: opponentTicket.opponent_name,
          startedAt,
        }),
      ]
    );

    const opponentMatchResult = await client.query(
      `INSERT INTO ${gameModel.GAME_MATCH_TABLE}
        (user_id, game_id, mode, category, difficulty, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING *`,
      [
        opponentTicket.user_id,
        game.id,
        mode,
        game.category || null,
        game.difficulty || null,
        JSON.stringify({
          runtime: game.metadata?.runtime,
          tournamentId,
          matchGroupId,
          opponentUserId: userId,
          opponentName: currentUser.name,
          opponentUsername: currentUser.username,
          startedAt,
        }),
      ]
    );

    const userTicketResult = await client.query(
      `INSERT INTO ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
        (user_id, game_id, tournament_id, mode, status, opponent_user_id, user_match_id, opponent_match_id, match_group_id, metadata, matched_at)
      VALUES ($1, $2, $3, $4, 'MATCHED', $5, $6, $7, $8, $9::jsonb, NOW())
      RETURNING *`,
      [
        userId,
        game.id,
        tournamentId || null,
        mode,
        opponentTicket.user_id,
        userMatchResult.rows[0].id,
        opponentMatchResult.rows[0].id,
        matchGroupId,
        JSON.stringify({runtime: game.metadata?.runtime, matchedAt: startedAt}),
      ]
    );

    await client.query(
      `UPDATE ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
      SET status = 'MATCHED',
        opponent_user_id = $1,
        user_match_id = $2,
        opponent_match_id = $3,
        match_group_id = $4,
        metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
        matched_at = NOW(),
        updated_at = NOW()
      WHERE id = $6`,
      [
        userId,
        opponentMatchResult.rows[0].id,
        userMatchResult.rows[0].id,
        matchGroupId,
        JSON.stringify({matchedAt: startedAt}),
        opponentTicket.id,
      ]
    );

    await client.query('COMMIT');
    return {
      status: 'MATCHED',
      ticket: gameModel.formatMatchmakingTicket({
        ...userTicketResult.rows[0],
        opponent_name: opponentTicket.opponent_name,
        opponent_username: opponentTicket.opponent_username,
      }),
      match: gameModel.formatGameMatch({
        ...userMatchResult.rows[0],
        game_name: game.name,
        game_slug: game.slug,
      }),
      opponent: {
        userId: opponentTicket.user_id,
        name: opponentTicket.opponent_name,
        username: opponentTicket.opponent_username,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


const findGameMatchById = async ({matchId}) => {
  try {
    const {rows} = await pool.query(
      `SELECT gm.id, gm.user_id, gm.game_id, gm.mode, gm.result, gm.score, gm.duration, gm.xp_earned,
        gm.category, gm.difficulty, gm.metadata, gm.created_at, gm.updated_at,
        g.name AS game_name, g.slug AS game_slug
      FROM ${gameModel.GAME_MATCH_TABLE} gm
      JOIN ${gameModel.GAME_TABLE} g ON g.id = gm.game_id
      WHERE gm.id = $1`,
      [matchId]
    )    
    const match = rows[0] ? gameModel.formatGameMatch(rows[0]) : null
    return  match ;
  } catch (error) {
    throw error
  }
}

const cancelMatchmakingTicket = async ({userId, ticketId}) => {
  try {
    const {rows} = await pool.query(
      `UPDATE ${gameModel.GAME_MATCHMAKING_TICKET_TABLE}
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'WAITING'
      RETURNING *`,
      [ticketId, userId]
    );

    return gameModel.formatMatchmakingTicket(rows[0]);
  } catch (error) {
    throw error;
  }
}

const findGameStatsByUserId = async ({userId}) => {
  try {
    const {rows} = await pool.query(
      `SELECT ${gameModel.GAME_STATS_FIELDS}
      FROM ${gameModel.GAME_STATS_TABLE}
      WHERE user_id = $1`,
      [userId]
    )    
    const gameStats = rows[0] ? gameModel.formatGameStats(rows[0]) : null
    return  gameStats ;
  } catch (error) {
    throw error
  }
}

const createGameStatsByUserId = async ({userId}) => {
  try {
    const {rows} = await pool.query(
      `INSERT INTO ${gameModel.GAME_STATS_TABLE}
      (user_id)
      VALUES ($1)
      RETURNING *`,
      [userId]
    )    
    const gameStats = rows[0] ? gameModel.formatGameStats(rows[0]) : null
    return  gameStats ;
  } catch (error) {
    throw error
  }
}






module.exports = {
                  findManyGames, findManyGamesBydDfficulty, findGameById, searchGames,
                  createGameMatche, updateGameMatcheByMatchId, completeGameMatch, findManyGameMatshs,
                  findGameMatchById, findGameStatsByUserId, createGameStatsByUserId, findLeaderboard,
                  findTournaments, findTournamentById, joinTournament, hasTournamentEntry,
                  joinMatchmaking, findMatchmakingTicketById, cancelMatchmakingTicket
                 }
