'use strict';

const pool = require('../../config/database');
const StreakModel = require('./streak.model');


const findManyByUserId = async (userId, limit, offset) => {
    try {
        const { rows } = await pool.query(
            `SELECT ${StreakModel.LIST_FIELDS}, 
            COUNT(*) OVER() AS total
            FROM ${StreakModel.TABLE}
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        )

        const total = rows[0]?.total || 0;
        const streaks = rows.map(StreakModel.format)
        return { streaks, total: parseInt(total, 10) };
    } catch (error) {
        throw error
    }
}

const findOneByUserId = async (userId) => {
    try {
        const { rows } = await pool.query(
            `SELECT ${StreakModel.LIST_FIELDS}
            FROM ${StreakModel.TABLE}
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
            [userId]
        )
        return StreakModel.format(rows[0]);
    } catch (error) {
        throw error
    }
}


const create = async (userId) => {
    try {
        await pool.query(
        `INSERT INTO ${StreakModel.TABLE} 
        (user_id)
        VALUES ($1)
        `,
        [userId]
        )
    } catch (error) {
        throw error
    }
}

const updateById = async (id) => {
    try {
        const {rows} = await pool.query(
            `UPDATE ${StreakModel.TABLE} 
            SET streak_count = streak_count + 1, end_date = CURRENT_DATE, updated_at = NOW() 
            WHERE id = $1 
            RETURNING *`,
            [id]
        )
        return StreakModel.format(rows[0]);
    } catch (error) {
        throw error
    }
}


module.exports = {
    create, updateById, findManyByUserId, findOneByUserId
}