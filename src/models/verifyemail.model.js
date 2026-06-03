'use strict';

const TABLE = 'verify_email_otp';


const ALL_FIELDS = [
    'id', 'email', 'otp', 'exp_in', 'is_used', 'is_verified', 'created_at', 'updated_at'
].join(', ');


module.exports = {TABLE, ALL_FIELDS }