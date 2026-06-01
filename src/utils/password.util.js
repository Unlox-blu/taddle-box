'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config/app.config')

const SALT_ROUNDS = config.BCRYPT_ROUNDS;

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

const comparePassword = async (password, hash) => await bcrypt.compare(password, hash);

module.exports = { hashPassword, comparePassword };
