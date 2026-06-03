'use strict';

const TABLE = 'verify_email_otp';


const ALL_FIELDS = [
    'id', 'email', 'otp', 'exp_in', 'is_used', 'is_verified', 'created_at', 'updated_at'
].join(', ');

const format = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    otp: row.otp,
    expIn: row.exp_in,
    isUsed: row.is_used,
    isVerified: row.is_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

module.exports = {TABLE, ALL_FIELDS, format }