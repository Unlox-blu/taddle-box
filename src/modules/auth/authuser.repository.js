'use strict';

const pool = require('../../config/database');
const AuthModel = require('./auth.model');



const isEmailExist = async ({email}) => {
  try {
    const { rows } = await pool.query(
      `SELECT id 
      FROM ${AuthModel.USER_TABLE} u
      WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email]
    );
    return rows[0] || null;
  } catch (error) {
    throw error
  }
}

const isPhoneExist = async ({countryCode, phone}) => {
  try {
    const { rows } = await pool.query(
      `SELECT id 
      FROM ${AuthModel.USER_TABLE} u
      WHERE u.phone_number = $1 AND u.country_code = $2 AND u.deleted_at IS NULL`,
      [phone, countryCode]
    );
    return rows[0] || null;
  } catch (error) {
    throw error
  }
}


const isUsernameExist = async ({username}) => {
  try {
    const { rows } = await pool.query(
      `SELECT id 
      FROM ${AuthModel.USER_TABLE} u      
      WHERE u.username = $1 AND u.deleted_at IS NULL`,
      [username]
    );
    return rows[0] || null;
  } catch (error) {
    throw error
  }
}


const findByIdUser = async ({userId}) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.USER_DETAIL},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${AuthModel.USER_TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = u.banner_url
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    const safe = rows[0] ? AuthModel.sanitize(rows[0]) : null
    return safe ? AuthModel.format(safe) : null;
  } catch (error) {
    throw error;
  }
};

const findByEmailUser = async ({email}) => {
  try {
    console.log('findByEmailUser received email:', email);
    const { rows } = await pool.query(
      `SELECT ${AuthModel.USER_DETAIL},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${AuthModel.USER_TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = u.banner_url
      WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL`,
      [email]
    );
    console.log('findByEmailUser DB rows:', rows);
    const safe = rows[0] ? AuthModel.sanitize(rows[0]) : null
    const result = safe ? AuthModel.format(safe) : null;
    console.log('findByEmailUser returning:', result);
    return result;
  } catch (error) {
    console.error('findByEmailUser error:', error);
    throw error;
  }
};

const findPhoneByEmail = async ({ email }) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, phone_number AS phone, country_code AS "countryCode"
       FROM ${AuthModel.USER_TABLE}
       WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};


const create = async ({name, username, email, countryCode, phone, passwordHash, dateOfBirth, gender, location, latitude, longitude, occupation, organization, interests, googleId, appleId, avatarUrl, referralCode, referredBy}) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${AuthModel.USER_TABLE} (name, username, email, country_code, phone_number, password_hash, date_of_birth, gender, location, latitude, longitude, occupation, organization, interests, google_id, apple_id, avatar_url, referral_code, referred_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING ${AuthModel.RETURNING_USER_FIELDS}`,
      [name, username, email, countryCode, phone, passwordHash, dateOfBirth, gender, location, latitude, longitude, occupation, organization, JSON.stringify(interests) || '[]', googleId, appleId, avatarUrl, referralCode || null, referredBy || null]
    );
    const safe = rows[0] ? AuthModel.sanitize(rows[0]) : null
    return safe ? AuthModel.format(safe) : null;
  } catch (error) {
    throw error;
  }
};

const findByReferralCode = async ({ referralCode }) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.PRIVATE_FIELDS}
      FROM ${AuthModel.USER_TABLE} u
      WHERE UPPER(u.referral_code) = UPPER($1) AND u.deleted_at IS NULL`,
      [referralCode]
    );
    const safe = rows[0] ? AuthModel.sanitize(rows[0]) : null;
    return safe ? AuthModel.format(safe) : null;
  } catch (error) {
    throw error;
  }
};


const getFlagByID = async ({userId}) => {
  try {
    const { rows } = await pool.query(
      `SELECT flags 
      FROM ${AuthModel.USER_TABLE} 
      WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    return rows[0];
  } catch (error) {
    throw error
  }
}

const verifyEmail = async ({userId}) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE}
      SET flags = flags | 1
      WHERE id = $1`,
      [userId]
    )
  } catch (error) {
    throw error
  }
}

const verifyPhone = async ({userId}) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE}
      SET flags = flags | 2
      WHERE id = $1`,
      [userId]
    )
  } catch (error) {
    throw error
  }
}

const findByEmail = async ({email}) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.AUTH_FIELDS} 
      FROM ${AuthModel.USER_TABLE} u 
      WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email]
    );
    return rows[0] ? AuthModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findByEmailLogin = async ({email}) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.LOGIN},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${AuthModel.USER_TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = u.banner_url
      WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email]
    );
    return rows[0] ? AuthModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findByIdentifierLogin = async ({ identifier }) => {
  try {
    const cleanId = identifier.trim();
    const normalizedPhone = cleanId.replace(/\D/g, '');
    const { rows } = await pool.query(
      `SELECT ${AuthModel.LOGIN},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${AuthModel.USER_TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = u.banner_url
      WHERE (
        LOWER(u.email) = LOWER($1) OR
        LOWER(u.username) = LOWER($1) OR
        u.phone_number = $2 OR
        (u.country_code || u.phone_number) = $1 OR
        (REGEXP_REPLACE(u.country_code, '\\D', '', 'g') || u.phone_number) = $2
      ) AND u.deleted_at IS NULL`,
      [cleanId, normalizedPhone]
    );
    return rows[0] ? AuthModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};


const findByIdSecure = async ({userId}) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.* 
      FROM ${AuthModel.USER_TABLE} u 
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    return rows[0] ? AuthModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findByIdPrivate = async ({userId}) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.PRIVATE_FIELDS},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${AuthModel.USER_TABLE} u 
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = u.banner_url
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    return rows[0] ? AuthModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
}
}

const findByIdAppLock = async ({userId}) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.APP_LOCK} 
      FROM ${AuthModel.USER_TABLE} u 
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    return rows[0] ? AuthModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
}
}

const setAppLock = async ({userId, pin}) => {
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

const removeAppLock = async ({userId}) => {
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


const getRefreshTokenById = async ({userId}) => {
  try {
    const {rows} = await pool.query(
      `SELECT id, role, refresh_token_hash 
      FROM ${AuthModel.USER_TABLE} 
      WHERE id = $1`,
      [userId]
    );
    return rows[0] ? AuthModel.format(rows[0]) : null;
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

const updateEmail = async (userId, email) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} 
      SET email = $1, updated_at = NOW() 
      WHERE id = $2`,
      [email, userId]
    );
  } catch (error) {
    throw error;
  }
};

const updateAvatar = async (userId, mediaId) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.USER_TABLE} 
      SET avatar_url = $1, updated_at = NOW() 
      WHERE id = $2`,
      [mediaId, userId]
    );
  } catch (error) {
    throw error;
  }
};


const updateRefreshToken = async ({userId, tokenHash}) => {
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

const getPasswordByUserId = async ({userId}) => {
  try {
    const {rows} = await pool.query(
      `SELECT password_hash 
      FROM ${AuthModel.USER_TABLE} 
      WHERE id = $1`,
      [userId]
    )
    return rows[0] ? AuthModel.format(rows[0]) : null;
  } catch (error) {
    throw error
  }
}

const updatePassword = async ({userId, passwordHash}) => {
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


const updatePasswordResetToken = async ({userId, tokenHash, tokenExp}) => {
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
    const {rows} = await pool.query(
      `SELECT id, password_reset_token_exp 
      FROM ${AuthModel.USER_TABLE} 
      WHERE password_reset_token_hash = $1`,
      [ResetToken]
    );
    return rows[0] ? AuthModel.format(rows[0]) : null;
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


const updateLastLogin = async ({userId}) => {
  try {
    await pool.query(`UPDATE ${AuthModel.USER_TABLE} SET last_login_at = NOW() WHERE id = $1`, [userId]);
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
    return rows[0] ? AuthModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};

const findByIdentifier = async (identifier) => {
  try {
    const cleanId = identifier.trim();
    const query = `
      SELECT ${AuthModel.USER_DETAIL},
      avatar_media.cloudfront_url AS avatar_media_url,
      banner_media.cloudfront_url AS banner_media_url
      FROM ${AuthModel.USER_TABLE} u
      LEFT JOIN media AS avatar_media ON avatar_media.id = u.avatar_url
      LEFT JOIN media AS banner_media ON banner_media.id = u.banner_url
      WHERE (
        LOWER(u.email) = LOWER($1) OR
        LOWER(u.username) = LOWER($1) OR
        u.phone_number = $1 OR
        (u.country_code || u.phone_number) = $1
      ) AND u.deleted_at IS NULL
    `;
    const { rows } = await pool.query(query, [cleanId]);
    const safe = rows[0] ? AuthModel.sanitize(rows[0]) : null;
    return safe ? AuthModel.format(safe) : null;
  } catch (error) {
    throw error;
  }
};

const findPhoneByUserId = async (userId) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, phone_number AS phone, country_code AS "countryCode"
       FROM ${AuthModel.USER_TABLE}
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    return rows[0] || null;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findByIdPrivate, findByEmail, getFlagByID, verifyEmail, verifyPhone, findByEmailLogin, findByIdentifierLogin, create, setAppLock,
  removeAppLock, updatePhone, updatePrivacy, updateRefreshToken,
  getRefreshTokenById, updateEmailVerifyToken, findByEmailVerifyToken,
  updatePasswordResetToken, findByPasswordResetToken, getPasswordByUserId,
  updatePassword, updateLastLogin, softDelete, isEmailExist, isPhoneExist, isUsernameExist,
  findByIdSecure, findByIdAppLock, findByEmailUser, findByIdUser, updateAvatar, updateEmail, findPhoneByEmail,
  findByIdentifier, findPhoneByUserId, findByReferralCode,
};
