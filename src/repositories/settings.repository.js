'use strict';

const pool = require('.././config/database');
const SettingsModel = require('../models/settings.model');

const create = async (userId) => {
  const { rows } = await pool.query(
    ` INSERT INTO ${SettingsModel.TABLE}
    ( user_id )
    VALUES ($1)
    RETURNING ${SettingsModel.LIST_FIELDS}
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};

const findByUserId = async (userId) => {
  const { rows } = await pool.query(
    `
    SELECT ${SettingsModel.LIST_FIELDS}
    FROM ${SettingsModel.TABLE}
    WHERE user_id = $1
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};

const setTheme = async (userId, theme) => {
  const { rows } = await pool.query(
    `
    UPDATE ${SettingsModel.TABLE}
    SET
      theme = $2,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING theme
  `,
    [userId, theme]
  );
  return SettingsModel.format(rows[0]);
};

const toggleNotification = async (userId) => {
  const { rows } = await pool.query(
    `
    UPDATE ${SettingsModel.TABLE}
    SET
      notification = NOT notification,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING notification
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};

const setappLock = async (userId, appLock) => {
  await pool.query(
    `
    UPDATE ${SettingsModel.TABLE}
    SET
      app_lock = $2,
      updated_at = NOW()
    WHERE user_id = $1
  `,
    [userId, appLock]
  );
  
};


module.exports = {
  create,
  findByUserId,
  setTheme,
  toggleNotification,
  setappLock,
};
