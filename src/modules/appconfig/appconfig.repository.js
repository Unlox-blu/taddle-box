'use strict';

const pool = require('../../config/database');
const AppConfigModel = require('./appconfig.model');


const findAppConfig = async () => {
    try {
        const {rows} = await pool.query(
            `SELECT ${AppConfigModel.LIST_FIELDS} 
            FROM ${AppConfigModel.TABLE}
            ORDER BY created_at DESC
            LIMIT 1
            `
        )
        return AppConfigModel.format(rows[0]) 
    } catch (error) {
        throw error
    }
}


module.exports = {
    findAppConfig
}