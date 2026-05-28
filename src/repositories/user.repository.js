'use strict';

const pool = require('../config/database');
const UserModel = require('../models/user.model');

// Find user by ID — public fields only
const findById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${UserModel.PUBLIC_FIELDS} FROM ${UserModel.TABLE} WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] || null;
};

// Find user by ID — full private fields (own profile)
const findByIdPrivate = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${UserModel.PRIVATE_FIELDS} FROM ${UserModel.TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] ? UserModel.sanitize(rows[0]) : null;
};

// Find user by email with auth fields (for login)
const findByEmail = async (email) => {
  const { rows } = await pool.query(
    `SELECT ${UserModel.AUTH_FIELDS}, refresh_token_hash FROM ${UserModel.TABLE} WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`,
    [email]
  );
  return rows[0] || null;
};

const findByUsername = async (username) => {
  const { rows } = await pool.query(
    `SELECT ${UserModel.PUBLIC_FIELDS} FROM ${UserModel.TABLE} WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL`,
    [username]
  );
  return rows[0] || null;
};

const findByGoogleId = async (googleId) => {
  const { rows } = await pool.query(
    `SELECT ${UserModel.AUTH_FIELDS} FROM ${UserModel.TABLE} WHERE google_id = $1 AND deleted_at IS NULL`,
    [googleId]
  );
  return rows[0] || null;
};

const create = async ({ name, username, email, passwordHash }) => {
  const { rows } = await pool.query(
    `INSERT INTO ${UserModel.TABLE} (name, username, email, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING ${UserModel.PRIVATE_FIELDS}`,
    [name, username, email, passwordHash]
  );
  return UserModel.sanitize(rows[0]);
};

const createWithGoogle = async ({ name, username, email, googleId, googleAvatar }) => {
  const { rows } = await pool.query(
    `INSERT INTO ${UserModel.TABLE} (name, username, email, google_id, avatar_url, is_verified, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
     RETURNING ${UserModel.PRIVATE_FIELDS}`,
    [name, username, email, googleId, googleAvatar]
  );
  return UserModel.sanitize(rows[0]);
};

const updateProfile = async (userId, fields) => {
  const allowedFields = ['name', 'bio', 'website_url', 'banner_url'];
  const updates = [];
  const values = [];
  Object.entries(fields).forEach(([k, v]) => {
    const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(col)) {
      values.push(v);
      updates.push(`${col} = $${values.length}`);
    }
  });
  if (updates.length === 0) return findByIdPrivate(userId);
  values.push(userId);
  const { rows } = await pool.query(
    `UPDATE ${UserModel.TABLE} SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length} RETURNING ${UserModel.PRIVATE_FIELDS}`,
    values
  );
  return UserModel.sanitize(rows[0]);
};

const updateAvatar = async (userId, avatarUrl) => {
  const { rows } = await pool.query(
    `UPDATE ${UserModel.TABLE} SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, avatar_url`,
    [avatarUrl, userId]
  );
  return rows[0];
};

const updateUsername = async (userId, username) => {
  const { rows } = await pool.query(
    `UPDATE ${UserModel.TABLE} SET username = $1, updated_at = NOW() WHERE id = $2 RETURNING ${UserModel.PRIVATE_FIELDS}`,
    [username, userId]
  );
  return UserModel.sanitize(rows[0]);
};

const updateRefreshToken = async (userId, tokenHash) => {
  await pool.query(
    `UPDATE ${UserModel.TABLE} SET refresh_token_hash = $1, updated_at = NOW() WHERE id = $2`,
    [tokenHash, userId]
  );
};

const updateEmailVerifyToken = async (userId, tokenHash, exp) => {
  await pool.query(
    `UPDATE ${UserModel.TABLE} SET email_verify_token_hash = $1, email_verify_token_exp = $2, updated_at = NOW() WHERE id = $3`,
    [tokenHash, exp, userId]
  );
};

const updatePasswordResetToken = async (userId, tokenHash, exp) => {
  await pool.query(
    `UPDATE ${UserModel.TABLE} SET password_reset_token_hash = $1, password_reset_token_exp = $2, updated_at = NOW() WHERE id = $3`,
    [tokenHash, exp, userId]
  );
};

const updatePassword = async (userId, passwordHash) => {
  await pool.query(
    `UPDATE ${UserModel.TABLE} SET password_hash = $1, password_reset_token_hash = NULL, password_reset_token_exp = NULL, updated_at = NOW() WHERE id = $2`,
    [passwordHash, userId]
  );
};

const linkGoogleAccount = async (userId, googleId, googleAvatar) => {
  const { rows } = await pool.query(
    `UPDATE ${UserModel.TABLE} SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), updated_at = NOW() WHERE id = $3 RETURNING ${UserModel.AUTH_FIELDS}`,
    [googleId, googleAvatar, userId]
  );
  return rows[0];
};

const verifyEmail = async (userId) => {
  await pool.query(
    `UPDATE ${UserModel.TABLE} SET is_verified = TRUE, email_verified_at = NOW(), email_verify_token_hash = NULL, email_verify_token_exp = NULL, updated_at = NOW() WHERE id = $1`,
    [userId]
  );
};

const updateLastLogin = async (userId) => {
  await pool.query(`UPDATE ${UserModel.TABLE} SET last_login_at = NOW() WHERE id = $1`, [userId]);
};

const incrementFollowerCount = async (userId) => {
  await pool.query(`UPDATE ${UserModel.TABLE} SET follower_count = follower_count + 1 WHERE id = $1`, [userId]);
};
const decrementFollowerCount = async (userId) => {
  await pool.query(`UPDATE ${UserModel.TABLE} SET follower_count = GREATEST(0, follower_count - 1) WHERE id = $1`, [userId]);
};
const incrementFollowingCount = async (userId) => {
  await pool.query(`UPDATE ${UserModel.TABLE} SET following_count = following_count + 1 WHERE id = $1`, [userId]);
};
const decrementFollowingCount = async (userId) => {
  await pool.query(`UPDATE ${UserModel.TABLE} SET following_count = GREATEST(0, following_count - 1) WHERE id = $1`, [userId]);
};

const softDelete = async (userId) => {
  await pool.query(`UPDATE ${UserModel.TABLE} SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1`, [userId]);
};

const search = async (query, limit, offset) => {
  const { rows } = await pool.query(
    `SELECT ${UserModel.SEARCH_FIELDS} FROM ${UserModel.TABLE}
     WHERE deleted_at IS NULL AND is_active = TRUE AND is_banned = FALSE
       AND ($1 = '' OR username ILIKE $1 OR name ILIKE $1)
     ORDER BY follower_count DESC
     LIMIT $2 OFFSET $3`,
    [`%${query}%`, limit, offset]
  );
  return rows;
};

module.exports = {
  findById, findByIdPrivate, findByEmail, findByUsername, findByGoogleId,
  create, createWithGoogle, updateProfile, updateAvatar, updateUsername,
  updateRefreshToken, updateEmailVerifyToken, updatePasswordResetToken,
  updatePassword, linkGoogleAccount, verifyEmail, updateLastLogin,
  incrementFollowerCount, decrementFollowerCount,
  incrementFollowingCount, decrementFollowingCount,
  softDelete, search,
};
