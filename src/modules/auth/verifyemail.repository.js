'use strict';

const pool = require('../../config/database');
const VerifyEmailModel = require('./verifyemail.model');


const isEmailExist = async ({email}) => {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM ${VerifyEmailModel.VERIFy_EMAIL_TABLE} 
      WHERE email = $1`,
      [email]
    );
    return rows[0] || null;
  } catch (error) {
    throw error
  }
}


const create = async ({ email, otp, expIn }) => {
  try {
    await pool.query(
      `INSERT INTO ${VerifyEmailModel.VERIFy_EMAIL_TABLE}
     (email, otp, otp_exp_in)
     VALUES ($1, $2, $3)`,
      [email, otp, expIn]
    );
  } catch (error) {
    throw error;
  }
};

const updateOtp = async ({ email, otp, expIn }) => {
  try {
    await pool.query(
      `UPDATE ${VerifyEmailModel.VERIFy_EMAIL_TABLE} 
      SET otp = $1, otp_exp_in = $2, is_verified = FALSE, updated_at = NOW() 
      WHERE email = $3`,
      [otp, expIn, email]
    );
  } catch (error) {
    throw error;
  }
};

const findByEmail = async ({email}) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${VerifyEmailModel.VERIFy_EMAIL_FIELDS} 
      FROM ${VerifyEmailModel.VERIFy_EMAIL_TABLE} 
      WHERE email = $1`,
      [email]
    );
    
    return VerifyEmailModel.format(rows[0]);
  } catch (error) {
    throw error;
  }
};





const makeVerified = async ({email, verificationExpiresAt}) => {
  try {
    await pool.query(
      `UPDATE ${AuthModel.VERIFy_EMAIL_TABLE} SET otp = NULL, otp_exp_in = NULL, is_verified = TRUE, verification_expires_at = $2, updated_at = NOW() WHERE email = $1`,
      [email, verificationExpiresAt]
    );
  } catch (error) {
    throw error;
  }
};



const hardDelete = async ({email}) => {
  try {
    await pool.query(`
        DELETE FROM ${AuthModel.VERIFy_EMAIL_TABLE} 
        WHERE email = $1`,
        [email]
    );
  } catch (error) {
    throw error;
  }
};

module.exports = {
  isEmailExist,  
  create,
  updateOtp,
  makeVerified,
  findByEmail,
  hardDelete,
};
