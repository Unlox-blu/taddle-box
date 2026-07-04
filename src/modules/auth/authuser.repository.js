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
      `SELECT ${AuthModel.USER_DETAIL}
      FROM ${AuthModel.USER_TABLE} u 
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
    const { rows } = await pool.query(
      `SELECT ${AuthModel.USER_DETAIL} 
      FROM ${AuthModel.USER_TABLE} u 
      WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email]
    );
    const safe = rows[0] ? AuthModel.sanitize(rows[0]) : null
    return safe ? AuthModel.format(safe) : null;
  } catch (error) {
    throw error;
  }
};


const create = async ({name, username, email, passwordHash, isVerified, gender, dateOfBirth}) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${AuthModel.USER_TABLE} (name, username, email, password_hash, is_verified, gender, date_of_birth)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${AuthModel.RETURNING_USER_FIELDS}`,
      [name, username, email, passwordHash, isVerified, gender, dateOfBirth]
    );
    const safe = rows[0] ? AuthModel.sanitize(rows[0]) : null
    return safe ? AuthModel.format(safe) : null;
  } catch (error) {
    throw error;
  }
};

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
      `SELECT ${AuthModel.LOGIN} 
      FROM ${AuthModel.USER_TABLE} u 
      WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email]
    );
    return rows[0] ? AuthModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
  }
};


const findByIdSecure = async ({userId}) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.SECURE_FIELDS} 
      FROM ${AuthModel.USER_TABLE} u 
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    return rows[0] ? AuthModel.format(rows[0]) : null;
  } catch (error) {
    throw error;
}
}

const findByIdPrivate = async ({userId}) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${AuthModel.PRIVATE_FIELDS} 
      FROM ${AuthModel.USER_TABLE} u 
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



module.exports = {
  findByIdPrivate, findByEmail, findByEmailLogin, create, updateAppLock,
  removeAppLock, updatePhone, updatePrivacy, updateRefreshToken,
  getRefreshTokenById, updateEmailVerifyToken, findByEmailVerifyToken,
  updatePasswordResetToken, findByPasswordResetToken, getPasswordByUserId,
  updatePassword, updateLastLogin, softDelete, isEmailExist, isUsernameExist,
  findByIdSecure, findByIdAppLock, findByEmailUser, findByIdUser,
};
