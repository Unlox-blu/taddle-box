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
        const { rows } = await pool.query(
        `INSERT INTO ${StreakModel.TABLE} 
        (user_id, start_date, end_date)
        VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
        `,
        [userId]
        )
        return StreakModel.format(rows[0]);
    } catch (error) {
        throw error
    }
}

const updateById = async (id) => {
    try {
        const {rows} = await pool.query(
            `UPDATE ${StreakModel.TABLE} 
            SET streak_count = streak_count + 1, end_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $1 
            RETURNING *`,
            [id]
        )
        return StreakModel.format(rows[0]);
    } catch (error) {
        throw error
    }
}

// Freeze the streak after a missed day: opens the 24h restore window.
const freeze = async (id, deadline) => {
    try {
        const { rows } = await pool.query(
            `UPDATE ${StreakModel.TABLE}
            SET restore_deadline = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *`,
            [id, deadline]
        )
        return StreakModel.format(rows[0]);
    } catch (error) {
        throw error
    }
}

// Revive a frozen streak: close the restore window and bring end_date to
// today so the streak continues from here. Count is intentionally unchanged.
const restore = async (id) => {
    try {
        const { rows } = await pool.query(
            `UPDATE ${StreakModel.TABLE}
            SET restore_deadline = NULL, end_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *`,
            [id]
        )
        return StreakModel.format(rows[0]);
    } catch (error) {
        throw error
    }
}

// Record the highest rewarded day so a milestone is only paid out once per row.
const markRewarded = async (id, day) => {
    try {
        const { rows } = await pool.query(
            `UPDATE ${StreakModel.TABLE}
            SET last_rewarded_day = GREATEST(last_rewarded_day, $2), updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *`,
            [id, day]
        )
        return StreakModel.format(rows[0]);
    } catch (error) {
        throw error
    }
}


module.exports = {
    create, updateById, freeze, restore, markRewarded, findManyByUserId, findOneByUserId
}