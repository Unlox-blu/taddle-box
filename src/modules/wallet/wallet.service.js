'use strict';

const pool = require('../../config/database');
const { createError } = require('../../utils/error.util');
const WalletModel = require('./wallet.model');

class WalletService {
  constructor({ walletRepository}) {
    this.walletRepo = walletRepository;
  }

  async createWallet({userId}) {
    try {
      const isExist = await this.walletRepo.findByUserId(userId);
      if (isExist) throw createError('Wallet already exist', 409);

      const wallet = await this.walletRepo.create(userId)
      return wallet
    } catch (error) {
      throw error
    }
  }

  async getWallet({userId}) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Wallet not found', 404);
      return WalletModel.formatWallet(wallet);
    } catch (error) {
      throw error;
    }
  }

  async getTransactions({userId, limit, offset}) {
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      if (!wallet) throw createError('Wallet not found', 404);
      const { rows, total } = await this.walletRepo.getTransactions(wallet.id, limit, offset);
      return { transactions: rows.map(WalletModel.formatTransaction), total };
    } catch (error) {
      throw error;
    }
  }
  
}

module.exports = WalletService;
