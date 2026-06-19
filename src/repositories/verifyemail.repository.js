'use strict';

const pool = require('../config/database');
const VerifyemailModel = require('../models/verifyemail.model');

const create = async ({ email, otp, expIn }) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO ${VerifyemailModel.TABLE}
     (email, otp, otp_exp_in)
     VALUES ($1, $2, $3)
     RETURNING *`,
      [email, otp, expIn]
    );
    return VerifyemailModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

const updateOtp = async ({ email, otp, expIn }) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${VerifyemailModel.TABLE} SET otp = $1, otp_exp_in = $2, is_verified = FALSE, updated_at = NOW() WHERE email = $3 RETURNING *`,
      [otp, expIn, email]
    );
    return VerifyemailModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

const makeVerified = async (email, verificationExpiresAt) => {
  try {
    const { rows } = await pool.query(
      `UPDATE ${VerifyemailModel.TABLE} SET otp = NULL, otp_exp_in = NULL, is_verified = TRUE, verification_expires_at = $2, updated_at = NOW() WHERE email = $1`,
      [email, verificationExpiresAt]
    );
    return VerifyemailModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

const findByEmail = async (email) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${VerifyemailModel.ALL_FIELDS} FROM ${VerifyemailModel.TABLE} WHERE email = $1`,
      [email]
    );
    return VerifyemailModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};

const hardDelete = async (email) => {
  try {
    pool.query(`DELETE FROM ${VerifyemailModel.TABLE} WHERE email = $1`, [email]);
  } catch (error) {
    throw error;
  }
};

module.exports = {
  create,
  updateOtp,
  makeVerified,
  findByEmail,
  hardDelete,
};
