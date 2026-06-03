'use strict';

const pool = require('../config/database');
const VerifyemailModel = require('../models/verifyemail.model');

const create = async ({email, otp, expIn}) => {
  const { rows } = await pool.query(
    `INSERT INTO ${VerifyemailModel.TABLE}
     (email, otp, exp_in)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, otp, expIn]
  );
  return rows[0];
};

const updateOtp = async ( {otp, expIn, email} ) => {
  const { rows } = await pool.query(
    `UPDATE ${VerifyemailModel.TABLE} SET otp = $1, exp_in = $2, is_used = FALSE, is_verified = FALSE, updated_at = NOW() WHERE email = $3 RETURNING *`,
    [otp, expIn, email]
  );
  return rows[0];
};

const makeVerified = async ( email ) => {
  const { rows } = await pool.query(
    `UPDATE ${VerifyemailModel.TABLE} SET otp = $1, exp_in = $2, is_used = FALSE, is_verified = TRUE, updated_at = NOW() WHERE email = $3 RETURNING *`,
    [null, null, email]
  );
  return rows[0];
};

const findByEmail = async (email) => {
    const { rows } = await pool.query(
        `SELECT ${VerifyemailModel.ALL_FIELDS} FROM ${VerifyemailModel.TABLE} WHERE email = $1`,
        [email]
    );
    return rows[0]
};

const hardDelete = async (email) => pool.query(`DELETE FROM ${VerifyemailModel.TABLE} WHERE email = $1`, [email]);

module.exports = {
    create,
    updateOtp,
    makeVerified,
    findByEmail,
    hardDelete
}