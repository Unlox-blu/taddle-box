'use strict';

const pool = require('../../config/database');
const UserModel = require('./user.model');


const findByUsername = async (username) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.PUBLIC_FIELDS}, 
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${UserModel.TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = banner_url
      WHERE LOWER(u.username) = LOWER($1) AND u.deleted_at IS NULL`,
      [username]
    );
    return rows[0] ? UserModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findByIdPrivate = async (id) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.PRIVATE_FIELDS}, 
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${UserModel.TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = banner_url
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    const safe = rows[0] ? UserModel.sanitize(rows[0]) : null;
    return safe ? UserModel.format(safe) : null;
  } catch (error) {
    throw error;
  }
};

const updateProfile = async (userId, fields) => {
  try {
    // Every editable column on users — mirror of the signup form.
    const allowedFields = ['name', 'bio', 'website_url', 'location', 'organization', 'occupation', 'gender', 'date_of_birth', 'interests'];
    const updates = [];
    const values = [];
    Object.entries(fields).forEach(([k, v]) => {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(col)) {
        // Empty-string clears a nullable text field (keeps it in the SET list
        // so the column actually becomes NULL instead of staying stale).
        if (v === '' && col !== 'interests') {
          values.push(null);
          updates.push(`${col} = $${values.length}`);
          return;
        }
        if (col === 'interests') {
          values.push(JSON.stringify(v));
          updates.push(`${col} = $${values.length}`);
          return;
        }
        values.push(v);
        updates.push(`${col} = $${values.length}`);
      }
    });
    if (updates.length === 0) return findByIdPrivate(userId);
    values.push(userId);
    const { rows } = await pool.query(
      `UPDATE ${UserModel.TABLE} SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length} RETURNING *`,
      values
    );
    const safe = rows[0] ? UserModel.sanitize(rows[0]) : null;
    return safe ? UserModel.format(safe) : null;
  } catch (error) {
    throw error;
  }
};

const findAvatarAndBanner = async (userId) => {
  try {
    const {rows} = await pool.query(
      `SELECT ${UserModel.MEDIA_FIELDS}
      FROM ${UserModel.TABLE} u
      WHERE u.id = $1`,
      [userId]
    )
    return rows[0] ?  UserModel.format(rows[0]) : null;
  } catch (error) {
    throw error
  }
} 

const updateAvatar = async (userId, avatarUrl) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${UserModel.TABLE} SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, avatar_url`,
      [avatarUrl, userId]
    );
    return rows[0] ?  UserModel.format(rows[0]) : null;
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
    return rows[0] ?  UserModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const updateUsername = async (userId, username) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${UserModel.TABLE} SET username = $1, updated_at = NOW() WHERE id = $2 RETURNING username`,
      [username, userId]
    );
    return rows[0] ?  UserModel.format(rows[0]) : null;
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

const findById = async (id) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.PUBLIC_FIELDS},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${UserModel.TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = banner_url
      WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL`,
      [id]
    );
    return rows[0] ?  UserModel.format(rows[0]) : null;
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

const incrementPostCount = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET post_count = post_count + 1 WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const decrementPostCount = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} SET post_count = GREATEST(0, post_count - 1) WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};





///////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////


const findByGoogleId = async (googleId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.AUTH_FIELDS} FROM ${UserModel.TABLE} u 
      WHERE u.google_id = $1 AND u.deleted_at IS NULL`,
      [googleId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const create = async ({name, username, email, passwordHash, isVerified, gender, dateOfBirth, appleRefreshToken, occupation, organization, location, latitude, longitude, interests}) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${UserModel.TABLE} (name, username, email, password_hash, is_verified, gender, date_of_birth, apple_refresh_token, occupation, organization, location, latitude, longitude, interests)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
      [name, username, email, passwordHash, isVerified, gender, dateOfBirth, appleRefreshToken, occupation, organization, location, latitude, longitude, interests ? JSON.stringify(interests) : null]
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

const updateAppLock = async (userId, pin, enableGlobal = null) => {
  try {
    // If enableGlobal is true/false, it will set app_lock_enabled to that value.
    // If enableGlobal is null, it preserves the existing app_lock_enabled state.
    await pool.query(
      `UPDATE ${UserModel.TABLE} 
      SET app_lock = $1, app_lock_enabled = COALESCE($3, app_lock_enabled), updated_at = NOW() 
      WHERE id = $2`,
      [pin, userId, enableGlobal]
    )
  } catch (error) {
    throw error
  }
}

const toggleAppLockEnabled = async (userId, isEnabled) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE}
       SET app_lock_enabled = $1, updated_at = NOW()
       WHERE id = $2`,
      [isEnabled, userId]
    )
  } catch (error) {
    throw error
  }
}

const removeAppLock = async (userId, pin) => {
  try {
    await pool.query(
      `UPDATE ${UserModel.TABLE} 
      SET app_lock = NULL, app_lock_enabled = FALSE, updated_at = NOW() 
      WHERE id = $1`,
      [userId]
    )
  } catch (error) {
    throw error
  }
}

const getAppLock = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT app_lock FROM ${UserModel.TABLE} WHERE id = $1`,
      [userId]
    );
    return rows[0]?.app_lock;
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




const linkGoogleAccount = async (userId, googleId, googleAvatar) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${UserModel.TABLE} SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), updated_at = NOW() WHERE id = $3`,
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

const hardDelete = async (userId) => {
  try {
    await pool.query(
      `DELETE FROM ${UserModel.TABLE} WHERE id = $1`,
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
       FROM ${UserModel.TABLE} u
     WHERE u.deleted_at IS NULL AND u.is_active = TRUE AND u.is_banned = FALSE
       AND ($1 = '' OR username ILIKE $1 OR name ILIKE $1)
     ORDER BY u.follower_count DESC
     LIMIT $2 OFFSET $3`,
      [`%${query}%`, limit, offset]
    );
    const total = rows[0]?.total || 0;
    return { rows, total: parseInt(total, 10) };
  } catch (error) {
    throw error;
  }
};


// for auth

const isEmailExist = async (email) => {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM ${UserModel.TABLE} u
      WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL`,
      [email]
    );
    return rows[0] || null;
  } catch (error) {
    throw error
  }
}

const isUsernameExist = async (username) => {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM ${UserModel.TABLE} u
      WHERE u.username = $1 AND u.deleted_at IS NULL`,
      [username]
    );
    return rows[0] || null;
  } catch (error) {
    throw error
  }
}

const findByEmail = async (email) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.AUTH_FIELDS} FROM ${UserModel.TABLE} u 
      WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL`,
      [email]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const findByIdAuth = async (id) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${UserModel.AUTH_FIELDS} FROM ${UserModel.TABLE} u 
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return rows[0] ? rows[0] : null;
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
      `SELECT password_hash FROM ${UserModel.TABLE} u
      WHERE u.id = $1`,
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

// Last-known device location (only ever sent when the user granted permission).
// GEO location telemetry — append a row to the history table (one row per
// capture). Distinct from the user's declared PROFILE location (users.location).
// `place` is an optional free-text reverse-geocoded place name.
const insertLocationCapture = async (userId, { lat, lng, accuracy, place }) => {
  try {
    await pool.query(
      `INSERT INTO location_history (user_id, lat, lng, accuracy, place)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, lat, lng, accuracy || null, place || null]
    );
  } catch (error) {
    throw error;
  }
};

// Privacy: wipe every captured location row for the user (Settings → Clear
// location data). Does NOT touch the declared profile location.
const clearLocationHistory = async (userId) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM location_history WHERE user_id = $1`,
      [userId]
    );
    return rowCount || 0;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findById,
  findByIdPrivate,
  findByIdAuth,
  findByEmail,
  findByUsername,
  findByGoogleId,
  create,
  createWithGoogle,
  updateProfile,
  updateAppLock,
  toggleAppLockEnabled,
  getAppLock,
  removeAppLock,
  findAvatarAndBanner,
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
  incrementPostCount,
  decrementPostCount,
  softDelete,
  hardDelete,
  search,
  isEmailExist,
  isUsernameExist,
  insertLocationCapture,
  clearLocationHistory,
};
