'use strict';
require('dotenv').config({ path: 'd:/Workspace/Unlox/code/taddle/taddle-box/.env' });
const pool = require('d:/Workspace/Unlox/code/taddle/taddle-box/src/config/database');
const XpService = require('d:/Workspace/Unlox/code/taddle/taddle-box/src/modules/xp/xp.service');
const xpRepository = require('d:/Workspace/Unlox/code/taddle/taddle-box/src/modules/xp/xp.repository');

async function test() {
  try {
    const xpService = new XpService({ xpRepository });
    const { rows } = await pool.query('SELECT id FROM users LIMIT 1');
    const userId = rows[0].id;
    console.log('Testing with user:', userId);

    let wallet = await xpRepository.findByUserId(userId);
    if (!wallet) {
      wallet = await xpService.createXPwallet({ userId });
    }
    console.log('Wallet:', wallet);

    const res = await xpService.creditXP({
      userId,
      xp: 50,
      transactionType: 'earned',
      sourceType: 'Daily Login'
    });
    console.log('Result:', res);

    const txs = await xpService.getTransactions({ userId, limit: 10, offset: 0 });
    console.log('Transactions:', txs);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

test();
