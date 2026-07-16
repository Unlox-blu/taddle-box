import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { Transaction } from '../types';
import { walletService } from '../services/wallet.service';

// ─── State & Actions ──────────────────────────────────────────────────────────

export type WalletState = {
  cashBalance:  number;
  xpBalance:    number;
  totalEarned:  number;   // cumulative cash earned (for stats)
  totalWithdrawn: number; // cumulative withdrawals
  transactions: Transaction[];
  linkedUPI:    string | null;
  linkedBank:   string | null;
  pinEnabled:   boolean;
  biometricEnabled: boolean;
  notifXP:      boolean;
  notifWithdraw: boolean;
  notifPromos:  boolean;
  isLoading:    boolean;
};

type Action =
  | { type: 'SET_DATA'; payload: any }
  | { type: 'SET_TRANSACTIONS'; transactions: Transaction[] }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'WITHDRAW';    amount: number }
  | { type: 'CONVERT_XP'; xpAmount: number; cashGained: number; txn1: Transaction; txn2: Transaction }
  | { type: 'TOGGLE_SETTING'; key: 'pinEnabled' | 'biometricEnabled' | 'notifXP' | 'notifWithdraw' | 'notifPromos' };

const INITIAL: WalletState = {
  cashBalance:     0,
  xpBalance:       0,
  totalEarned:     0,
  totalWithdrawn:  0,
  transactions:    [],
  linkedUPI:       null,
  linkedBank:      null,
  pinEnabled:      false,
  biometricEnabled: false,
  notifXP:         true,
  notifWithdraw:   true,
  notifPromos:     false,
  isLoading:       false,
};

function reducer(state: WalletState, action: Action): WalletState {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, ...action.payload, isLoading: false };
    case 'SET_TRANSACTIONS':
      return { ...state, transactions: action.transactions };
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    
    case 'WITHDRAW': {
      // Handled by refetching or simple optimistic approach
      return {
        ...state,
        cashBalance: state.cashBalance - action.amount,
        totalWithdrawn: state.totalWithdrawn + action.amount,
      };
    }

    case 'CONVERT_XP': {
      return {
        ...state,
        xpBalance:   state.xpBalance - action.xpAmount,
        cashBalance: state.cashBalance + action.cashGained,
        totalEarned: state.totalEarned + action.cashGained,
        transactions: [action.txn1, action.txn2, ...state.transactions],
      };
    }

    case 'TOGGLE_SETTING':
      return { ...state, [action.key]: !state[action.key] };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

type WalletContextType = {
  wallet:          WalletState;
  fetchWalletData: () => Promise<void>;
  withdraw:        (amount: number) => Promise<string>;
  convertXP:       (xpAmount: number) => Promise<void>;
  linkUPI:         (upiId: string) => void;
  linkBank:        (bank: string) => void;
  toggleSetting:   (key: 'pinEnabled' | 'biometricEnabled' | 'notifXP' | 'notifWithdraw' | 'notifPromos') => void;
};

const WalletContext = createContext<WalletContextType>({
  wallet:        INITIAL,
  fetchWalletData: async () => {},
  withdraw:      async () => '',
  convertXP:     async () => {},
  linkUPI:       () => {},
  linkBank:      () => {},
  toggleSetting: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, dispatch] = useReducer(reducer, INITIAL);

  const fetchWalletData = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      const [walletRes, txnsRes] = await Promise.all([
        walletService.getWallet(),
        walletService.getTransactions(1, 50)
      ]);
      
      dispatch({ type: 'SET_DATA', payload: {
        cashBalance: walletRes.data?.balanceCents || 0,
        // (Assume xp balance is fetched separately or part of auth user)
      }});
      dispatch({ type: 'SET_TRANSACTIONS', transactions: txnsRes.data || [] });
    } catch (e) {
      console.error('Failed to fetch wallet data:', e);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, []);

  const value: WalletContextType = {
    wallet,
    fetchWalletData,
    withdraw: async (amountCents) => {
      try {
        const res = await walletService.initiateWithdrawal(amountCents);
        await fetchWalletData(); // optional, balance won't deduct till webhook 
        return res.data?.handoffUrl;
      } catch (e) {
        console.error('Withdraw failed', e);
        throw e;
      }
    },
    convertXP: async (xpAmount) => {
      try {
        await walletService.convertXpToCash(xpAmount);
        await fetchWalletData();
      } catch (e) {
        console.error('Convert XP failed', e);
        throw e;
      }
    },
    earnXP: (amount, title) => { /* Mock or add to state */ },
    earnCash: (amount, title) => { /* Mock or add to state */ },
    linkUPI: (upi) => { /* Mock or api call */ },
    linkBank: (bank) => { /* Mock or api call */ },
    toggleSetting: (key) => dispatch({ type: 'TOGGLE_SETTING', key }),
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useWallet = () => useContext(WalletContext);
