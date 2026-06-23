'use strict';

const pool = require('../config/database');
const UserModel = require('../models/user.model');

// Find user by ID — public fields only
const findById = async (id) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.PUBLIC_FIELDS} FROM ${UserModel.TABLE} WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

// Find user by ID — full private fields (own profile)
const findByIdPrivate = async (id) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.PRIVATE_FIELDS} FROM ${UserModel.TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return rows[0] ? UserModel.sanitize(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

// Find user by email with auth fields (for login)
const findByEmail = async (email) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.AUTH_FIELDS} FROM ${UserModel.TABLE} WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`,
      [email]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const findByUsername = async (username) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.PUBLIC_FIELDS} FROM ${UserModel.TABLE} WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL`,
      [username]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const findByGoogleId = async (googleId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.AUTH_FIELDS} FROM ${UserModel.TABLE} WHERE google_id = $1 AND deleted_at IS NULL`,
      [googleId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const create = async ({name, username, email, passwordHash, isVerified, gender, dateOfBirth}) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${UserModel.TABLE} (name, username, email, password_hash, is_verified, gender, date_of_birth)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${UserModel.PRIVATE_FIELDS}`,
      [name, username, email, passwordHash, isVerified, gender, dateOfBirth]
    );
    return UserModel.sanitize(rows[0]);
  } catch (error) {
    throw error;
  }
};

const createWithGoogle = async ({ name, username, email, googleId, googleAvatar }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${UserModel.TABLE} (name, username, email, google_id, avatar_url, is_verified, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
     RETURNING ${UserModel.PRIVATE_FIELDS}`,
      [name, username, email, googleId, googleAvatar]
    );
    return UserModel.sanitize(rows[0]);
  } catch (error) {
    throw error;
  }
};

const updateProfile = async (userId, fields) => {
  try {
    const allowedFields = ['name', 'bio', 'website_url'];
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
  } catch (error) {
    throw error;
  }
};

const updateAvatar = async (userId, avatarUrl) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${UserModel.TABLE} SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, avatar_url`,
      [avatarUrl, userId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const updateBanner = async (userId, bannerUrl) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${UserModel.TABLE} SET banner_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, banner_url`,
      [bannerUrl, userId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const updateUsername = async (userId, username) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${UserModel.TABLE} SET username = $1, updated_at = NOW() WHERE id = $2 RETURNING ${UserModel.PRIVATE_FIELDS}`,
      [username, userId]
    );
    return UserModel.sanitize(rows[0]);
  } catch (error) {
    throw error;
  }
};

const updatePhone = async (userId, countryCode, phoneNumber) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET country_code = $1, phone_number = $2, updated_at = NOW() WHERE id = $3`,
      [countryCode, phoneNumber, userId]
    );
  } catch (error) {
    throw error;
  }
};

const updatePrivacy = async (userId, privacy) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET privacy = $1, updated_at = NOW() WHERE id = $2`,
      [privacy, userId]
    );
  } catch (error) {
    throw error;
  }
};

const updateRefreshToken = async (userId, tokenHash) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET refresh_token_hash = $1, updated_at = NOW() WHERE id = $2`,
      [tokenHash, userId]
    );
  } catch (error) {
    throw error;
  }
};

const getRefreshTokenById = async (userId) => {
  try {
    const token = await pool.query(
      `SELECT id, role, refresh_token_hash FROM ${UserModel.TABLE} WHERE id = $1`,
      [userId]
    );
    return token.rows[0];
  } catch (error) {
    throw error;
  }
};

const updateEmailVerifyToken = async (userId, tokenHash, exp) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET email_verify_token_hash = $1, email_verify_token_exp = $2, updated_at = NOW() WHERE id = $3`,
      [tokenHash, exp, userId]
    );
  } catch (error) {
    throw error;
  }
};

const findByEmailVerifyToken = async (ResetToken) => {
  try {
    const token = await pool.query(
      `SELECT id, email_verify_token_exp FROM ${UserModel.TABLE} WHERE email_verify_token_hash = $1`,
      [ResetToken]
    );
    return token.rows[0];
  } catch (error) {
    throw error;
  }
};

const updatePasswordResetToken = async (userId, tokenHash, exp) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET password_reset_token_hash = $1, password_reset_token_exp = $2, updated_at = NOW() WHERE id = $3`,
      [tokenHash, exp, userId]
    );
  } catch (error) {
    throw error;
  }
};

const findByPasswordResetToken = async (ResetToken) => {
  try {
    const token = await pool.query(
      `SELECT id, password_reset_token_exp FROM ${UserModel.TABLE} WHERE password_reset_token_hash = $1`,
      [ResetToken]
    );
    return token.rows[0];
  } catch (error) {
    throw error;
  }
};

const getPasswordByUserId = async (userId) => {
  try {
    const {rows} = await pool.query(
      `SELECT password_hash FROM ${UserModel.TABLE}
      WHERE id = $1`,
      [userId]
    )
    return rows.length ? rows[0] : null
  } catch (error) {
    throw error
  }
}

const updatePassword = async (userId, passwordHash) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET password_hash = $1, password_reset_token_hash = NULL, password_reset_token_exp = NULL, updated_at = NOW() WHERE id = $2`,
      [passwordHash, userId]
    );
  } catch (error) {
    throw error;
  }
};

const linkGoogleAccount = async (userId, googleId, googleAvatar) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${UserModel.TABLE} SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), updated_at = NOW() WHERE id = $3 RETURNING ${UserModel.AUTH_FIELDS}`,
      [googleId, googleAvatar, userId]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

const verifyEmail = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET is_verified = TRUE, email_verified_at = NOW(), email_verify_token_hash = NULL, email_verify_token_exp = NULL, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const updateLastLogin = async (userId) => {
  try {
    await pool.query(`UPDATE ${UserModel.TABLE} SET last_login_at = NOW() WHERE id = $1`, [userId]);
  } catch (error) {
    throw error;
  }
};

const incrementFollowerCount = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET follower_count = follower_count + 1 WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const decrementFollowerCount = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET follower_count = GREATEST(0, follower_count - 1) WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const incrementFollowingCount = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET following_count = following_count + 1 WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const decrementFollowingCount = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET following_count = GREATEST(0, following_count - 1) WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const softDelete = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const search = async (query, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.SEARCH_FIELDS}, COUNT(*) OVER() AS total
       FROM ${UserModel.TABLE}
     WHERE deleted_at IS NULL AND is_active = TRUE AND is_banned = FALSE
       AND ($1 = '' OR username ILIKE $1 OR name ILIKE $1)
     ORDER BY follower_count DESC
     LIMIT $2 OFFSET $3`,
      [`%${query}%`, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findById,
  findByIdPrivate,
  findByEmail,
  findByUsername,
  findByGoogleId,
  create,
  createWithGoogle,
  updateProfile,
  updateAvatar,
  updateBanner,
  updateUsername,
  updatePhone,
  updatePrivacy,
  updateRefreshToken,
  getRefreshTokenById,
  updateEmailVerifyToken,
  findByEmailVerifyToken,
  updatePasswordResetToken,
  findByPasswordResetToken,
  getPasswordByUserId,
  updatePassword,
  linkGoogleAccount,
  verifyEmail,
  updateLastLogin,
  incrementFollowerCount,
  decrementFollowerCount,
  incrementFollowingCount,
  decrementFollowingCount,
  softDelete,
  search,
};
