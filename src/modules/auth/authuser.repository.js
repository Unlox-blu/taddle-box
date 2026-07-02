'use strict';

const pool = require('../../config/database');
const AuthModel = require('./auth.model');



const isEmailExist = async (email) => {
  try {
    const { rows } = await pool.query(
      `SELECT id 
      FROM ${AuthModel.USER_TABLE} u
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
      `SELECT 1 
      FROM ${AuthModel.USER_TABLE}       
      WHERE username = $1 AND deleted_at IS NULL`,
      [username]
    );
    return rows[0] || null;
  } catch (error) {
    throw error
  }
}

const create = async ({name, username, email, passwordHash, isVerified, gender, dateOfBirth}) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${AuthModel.USER_TABLE} (name, username, email, password_hash, is_verified, gender, date_of_birth)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${AuthModel.RETURNING_USER_FIELDS}`,
      [name, username, email, passwordHash, isVerified, gender, dateOfBirth]
    );
    return AuthModel.sanitize(rows[0]);
  } catch (error) {
    throw error;
  }
};

const findByEmail = async (email) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.AUTH_FIELDS} 
      FROM ${AuthModel.USER_TABLE} u 
      WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL`,
      [email]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};


const findByIdSecure = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.SECURE_FIELDS} 
      FROM ${AuthModel.USER_TABLE} u 
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    return rows[0] ? rows[0] : null;
  } catch (error) {
    throw error;
}
}


const findByIdAuth = async (id) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.AUTH_FIELDS} FROM ${AuthModel.USER_TABLE} u 
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return rows[0] ? rows[0] : null;
  } catch (error) {
    throw error;
  }
};




const findById = async (id) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.PUBLIC_FIELDS},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${AuthModel.USER_TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = banner_url
      WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

const findByIdPrivate = async (id) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.PRIVATE_FIELDS}, 
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${AuthModel.USER_TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = banner_url
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return rows[0] ? AuthModel.sanitize(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};


const updatePhone = async (userId, countryCode, phoneNumber) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} 
      SET country_code = $1, phone_number = $2, updated_at = NOW() 
      WHERE id = $3`,
      [countryCode, phoneNumber, userId]
    );
  } catch (error) {
    throw error;
  }
};


const getRefreshTokenById = async (userId) => {
  try {
    const token = await pool.query(
      `SELECT id, role, refresh_token_hash 
      FROM ${AuthModel.USER_TABLE} 
      WHERE id = $1`,
      [userId]
    );
    return token.rows[0];
  } catch (error) {
    throw error;
  }
};



const updateRefreshToken = async (userId, tokenHash) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} 
      SET refresh_token_hash = $1, updated_at = NOW() 
      WHERE id = $2`,
      [tokenHash, userId]
    );
  } catch (error) {
    throw error;
  }
};


const getPasswordByUserId = async (userId) => {
  try {
    const {rows} = await pool.query(
      `SELECT password_hash 
      FROM ${AuthModel.USER_TABLE} 
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
      `UPDATE ${AuthModel.USER_TABLE} 
      SET password_hash = $1, password_reset_token_hash = NULL, password_reset_token_exp = NULL, updated_at = NOW() 
      WHERE id = $2`,
      [passwordHash, userId]
    );
  } catch (error) {
    throw error;
  }
};



const updatePasswordResetToken = async (userId, tokenHash, tokenExp) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} 
      SET password_reset_token_hash = $1, password_reset_token_exp = $2, updated_at = NOW() 
      WHERE id = $3`,
      [tokenHash, tokenExp, userId]
    );
  } catch (error) {
    throw error;
  }
};

const findByPasswordResetToken = async (ResetToken) => {
  try {
    const token = await pool.query(
      `SELECT id, password_reset_token_exp 
      FROM ${AuthModel.USER_TABLE} 
      WHERE password_reset_token_hash = $1`,
      [ResetToken]
    );
    return token.rows[0];
  } catch (error) {
    throw error;
  }
};





// Find user by ID — public fields only


// Find user by ID — full private fields (own profile)



const findByUsername = async (username) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.PUBLIC_FIELDS}, 
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${AuthModel.USER_TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = banner_url
      WHERE LOWER(u.username) = LOWER($1) AND u.deleted_at IS NULL`,
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
      `SELECT ${AuthModel.AUTH_FIELDS} FROM ${AuthModel.USER_TABLE} u 
      WHERE u.google_id = $1 AND u.deleted_at IS NULL`,
      [googleId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};



const createWithGoogle = async ({ name, username, email, googleId, googleAvatar }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${AuthModel.USER_TABLE} (name, username, email, google_id, avatar_url, is_verified, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
     RETURNING ${AuthModel.PRIVATE_FIELDS}`,
      [name, username, email, googleId, googleAvatar]
    );
    return AuthModel.sanitize(rows[0]);
  } catch (error) {
    throw error;
  }
};

const updateAppLock = async (userId, pin) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} 
      SET app_lock = $1, app_lock_enabled = TRUE, updated_at = NOW() 
      WHERE id = $2`,
      [pin, userId]
    )
  } catch (error) {
    throw error
  }
}

const removeAppLock = async (userId, pin) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} 
      SET app_lock = NULL, app_lock_enabled = FALSE, updated_at = NOW() 
      WHERE id = $1`,
      [userId]
    )
  } catch (error) {
    throw error
  }
}

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
      `UPDATE ${AuthModel.USER_TABLE} SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length} RETURNING *`,
      values
    );
    return AuthModel.sanitize(rows[0]);
  } catch (error) {
    throw error;
  }
};

const updateAvatar = async (userId, avatarUrl) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, avatar_url`,
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
      `UPDATE ${AuthModel.USER_TABLE} SET banner_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, banner_url`,
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
      `UPDATE ${AuthModel.USER_TABLE} SET username = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [username, userId]
    );
    return AuthModel.sanitize(rows[0]);
  } catch (error) {
    throw error;
  }
};


const updatePrivacy = async (userId, privacy) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} SET privacy = $1, updated_at = NOW() WHERE id = $2`,
      [privacy, userId]
    );
  } catch (error) {
    throw error;
  }
};


const linkGoogleAccount = async (userId, googleId, googleAvatar) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} SET google_id = $1, avatar_url = COALESCE(avatar_url, $2), updated_at = NOW() WHERE id = $3`,
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
      `UPDATE ${AuthModel.USER_TABLE} SET is_verified = TRUE, email_verified_at = NOW(), email_verify_token_hash = NULL, email_verify_token_exp = NULL, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const updateLastLogin = async (userId) => {
  try {
    await pool.query(`UPDATE ${AuthModel.USER_TABLE} SET last_login_at = NOW() WHERE id = $1`, [userId]);
  } catch (error) {
    throw error;
  }
};

const incrementFollowerCount = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} SET follower_count = follower_count + 1 WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const decrementFollowerCount = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} SET follower_count = GREATEST(0, follower_count - 1) WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const incrementFollowingCount = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} SET following_count = following_count + 1 WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const decrementFollowingCount = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} SET following_count = GREATEST(0, following_count - 1) WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const softDelete = async (userId) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
  } catch (error) {
    throw error;
  }
};

const search = async (query, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.SEARCH_FIELDS}, COUNT(*) OVER() AS total
       FROM ${AuthModel.USER_TABLE} u
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












const updateEmailVerifyToken = async (userId, tokenHash, exp) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} SET email_verify_token_hash = $1, email_verify_token_exp = $2, updated_at = NOW() WHERE id = $3`,
      [tokenHash, exp, userId]
    );
  } catch (error) {
    throw error;
  }
};

const findByEmailVerifyToken = async (ResetToken) => {
  try {
    const token = await pool.query(
      `SELECT id, email_verify_token_exp FROM ${AuthModel.USER_TABLE} WHERE email_verify_token_hash = $1`,
      [ResetToken]
    );
    return token.rows[0];
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
  removeAppLock,
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
  isEmailExist,
  isUsernameExist,
  findByIdSecure,
};
