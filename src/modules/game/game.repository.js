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


module.exports = {findManyGames, findManyGamesBydDfficulty, findGameById}