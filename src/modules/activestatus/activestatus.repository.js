'use strict';

const pool = require('../../config/database');
const ActiveStatusModel = require('./activestatus.model');

const create = async (userId) => {
    try {
        const {rows} = await pool.query(
            `INSERT INTO ${ActiveStatusModel.TABLE}
            (user_id)
            VALUES($1)
            `,
            [userId]
        )
    } catch (error) {
        throw error
    }
}

const findByUserId = async (userId) => {
    try {
        const {rows} = await pool.query(
            `SELECT ${ActiveStatusModel.LIST_FIELDS} 
            FROM ${ActiveStatusModel.TABLE}
            WHERE user_id = $1
            `,
            [userId]
        )
        return rows[0]
    } catch (error) {
        throw error
    }
}

const hardDelete = async (userId) => {
  try {
    await pool.query(
      `DELETE FROM ${ActiveStatusModel.TABLE}
      WHERE user_id = $1 
      `,
      [userId]
    )
  } catch (error) {
    throw error
  }
}

const setOnline = async (userId) => {
  try {
    const { rows } = await pool.query(
        `UPDATE ${ActiveStatusModel.TABLE} 
        SET is_active = 'online'
        WHERE user_id = $1`,
      [userId]
    );
    
  } catch (error) {
    throw error;
  }
};

const setOffline = async (userId) => {
  try {
    const { rows } = await pool.query(
        `UPDATE ${ActiveStatusModel.TABLE} 
        SET is_active = 'offline', last_seen = NOW()
        WHERE user_id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};


module.exports = {create, findByUserId, hardDelete, setOnline, setOffline}