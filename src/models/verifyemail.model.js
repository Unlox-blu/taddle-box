'use strict';

const TABLE = 'verify_email_otp';


const ALL_FIELDS = [
    'id', 'email', 'otp', 'otp_exp_in','is_verified', 'verification_expires_at', 'created_at', 'updated_at'
].join(', ');

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    otp: row.otp,
    expIn: row.otp_exp_in,
    isVerified: row.is_verified,
    verificationExpiresAt: row.verification_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

module.exports = {TABLE, ALL_FIELDS, format }