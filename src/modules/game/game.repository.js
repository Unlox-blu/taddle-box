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
    return { game };
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
    return {match}
  } catch (error) {
    throw error
  }
}

const updateGameMatcheByMatchId = async ({matchData}) => {
  try {
    const {rows} = await pool.query(
      `UPDATE ${gameModel.GAME_MATCH_TABLE}
      SET result = $1, score = $2, duration = $3, xp_earned = $4
      WHERE id = $5 AND user_id = $6
      RETURNING *`,
      [
        matchData.result, matchData.score, matchData.duration, 
        matchData.xpEarned, matchData.matchId, matchData.userId
      ]
    )
    const match = gameModel.formatGameMatch(rows[0])
    return {match}
  } catch (error) {
    throw error
  }
}

const findManyGameMatshs = async ({userId, limit, offset}) => {
  try {
    const {rows} = await pool.query(
      `SELECT ${gameModel.GAME_MATCH_FIELDS}, COUNT(*) OVER() AS total
      FROM ${gameModel.GAME_MATCH_TABLE}
      WHERE user_is = $1
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
      [userId, limit, offset]
    )
    const total = rows[0]?.total || 0;
    const matchs = rows.map(gameModel.formatGame)
    return { matchs, total: parseInt(total, 10) };
  } catch (error) {
    throw error
  }
}


const findGameMatchById = async ({matchId}) => {
  try {
    const {rows} = await pool.query(
      `SELECT ${gameModel.GAME_MATCH_FIELDS}
      FROM ${gameModel.GAME_MATCH_TABLE}
      WHERE id = $1`,
      [matchId]
    )    
    const match = rows[0] ? gameModel.formatGame(rows[0]) : null
    return { match };
  } catch (error) {
    throw error
  }
}




module.exports = {
                  findManyGames, findManyGamesBydDfficulty, findGameById, searchGames,
                  createGameMatche, updateGameMatcheByMatchId, findManyGameMatshs, 
                  findGameMatchById
                 }