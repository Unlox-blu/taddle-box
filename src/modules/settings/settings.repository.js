'use strict';

const pool = require('../.././config/database');
const SettingsModel = require('./settings.model');

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

const getSystemNotificationByUserId = async (userId) => {
  const { rows } = await pool.query(
    `
    SELECT system_notification
    FROM ${SettingsModel.TABLE}
    WHERE user_id = $1
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};

const getPromotionalNotificationByUserId = async (userId) => {
  const { rows } = await pool.query(
    `
    SELECT promotional_notification
    FROM ${SettingsModel.TABLE}
    WHERE user_id = $1
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};

const getAppLockByUserId = async (userId) => {
  const { rows } = await pool.query(
    `
    SELECT app_lock
    FROM ${SettingsModel.TABLE}
    WHERE user_id = $1
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};

const getThemeByUserId = async (userId) => {
  const { rows } = await pool.query(
    `
    SELECT theme
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

const toggleSystemNotification = async (userId) => {
  const { rows } = await pool.query(
    `
    UPDATE ${SettingsModel.TABLE}
    SET
      system_notification = NOT system_notification,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING system_notification
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};

const togglePromotionalNotification = async (userId) => {
  const { rows } = await pool.query(
    `
    UPDATE ${SettingsModel.TABLE}
    SET
      promotional_notification = NOT promotional_notification,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING promotional_notification
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};



const toggleNotifXP = async (userId) => {
  const { rows } = await pool.query(
    `
    UPDATE ${SettingsModel.TABLE}
    SET
      notif_xp = NOT notif_xp,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING notif_xp
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};

const toggleNotifWithdraw = async (userId) => {
  const { rows } = await pool.query(
    `
    UPDATE ${SettingsModel.TABLE}
    SET
      notif_withdraw = NOT notif_withdraw,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING notif_withdraw
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};

const toggleNotifPromos = async (userId) => {
  const { rows } = await pool.query(
    `
    UPDATE ${SettingsModel.TABLE}
    SET
      notif_promos = NOT notif_promos,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING notif_promos
  `,
    [userId]
  );
  return SettingsModel.format(rows[0]);
};

module.exports = {
  create,
  findByUserId,
  getSystemNotificationByUserId,
  getPromotionalNotificationByUserId,
  getAppLockByUserId,
  getThemeByUserId,
  setTheme,
  toggleSystemNotification,
  togglePromotionalNotification,
  toggleNotifXP,
  toggleNotifWithdraw,
  toggleNotifPromos,
};
