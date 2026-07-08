import React, { createContext, useContext, useReducer } from 'react';
import type { Transaction } from '../types';
import { TRANSACTIONS } from '../types/mockData';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNow(): string {
  const d = new Date();
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  if (day.getTime() === today.getTime())     return `Today · ${time}`;
  if (day.getTime() === yesterday.getTime()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${time}`;
}

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
};

type Action =
  | { type: 'WITHDRAW';    amount: number }
  | { type: 'CONVERT_XP'; xpAmount: number }
  | { type: 'EARN_XP';    amount: number; title: string }
  | { type: 'EARN_CASH';  amount: number; title: string }
  | { type: 'LINK_UPI';   upiId: string }
  | { type: 'LINK_BANK';  bank: string }
  | { type: 'TOGGLE_SETTING'; key: 'pinEnabled' | 'biometricEnabled' | 'notifXP' | 'notifWithdraw' | 'notifPromos' };

const INITIAL: WalletState = {
  cashBalance:     1250,
  xpBalance:       12840,
  totalEarned:     4820,
  totalWithdrawn:  500,
  transactions:    TRANSACTIONS,
  linkedUPI:       null,
  linkedBank:      null,
  pinEnabled:      false,
  biometricEnabled: false,
  notifXP:         true,
  notifWithdraw:   true,
  notifPromos:     false,
};

function reducer(state: WalletState, action: Action): WalletState {
  switch (action.type) {

    case 'WITHDRAW': {
      const txn: Transaction = {
        id:       `t_${Date.now()}`,
        title:    `Withdrawn to ${state.linkedUPI ?? state.linkedBank ?? 'Account'}`,
        date:     formatNow(),
        amount:   -action.amount,
        currency: 'INR',
        type:     'withdraw',
      };
      return {
        ...state,
        cashBalance:    state.cashBalance - action.amount,
        totalWithdrawn: state.totalWithdrawn + action.amount,
        transactions:   [txn, ...state.transactions],
      };
    }

    case 'CONVERT_XP': {
      const cashGained = Math.floor(action.xpAmount / 100);
      const xpTxn: Transaction = {
        id:       `t_${Date.now()}`,
        title:    `${action.xpAmount.toLocaleString()} XP Redeemed`,
        date:     formatNow(),
        amount:   action.xpAmount,
        currency: 'XP',
        type:     'convert',
      };
      const cashTxn: Transaction = {
        id:       `t_${Date.now() + 1}`,
        title:    'XP → Cash Conversion',
        date:     formatNow(),
        amount:   cashGained,
        currency: 'INR',
        type:     'convert',
      };
      return {
        ...state,
        xpBalance:   state.xpBalance - action.xpAmount,
        cashBalance: state.cashBalance + cashGained,
        totalEarned: state.totalEarned + cashGained,
        transactions: [cashTxn, xpTxn, ...state.transactions],
      };
    }

    case 'EARN_XP': {
      const txn: Transaction = {
        id:       `t_${Date.now()}`,
        title:    action.title,
        date:     formatNow(),
        amount:   action.amount,
        currency: 'XP',
        type:     'earn',
      };
      return { ...state, xpBalance: state.xpBalance + action.amount, transactions: [txn, ...state.transactions] };
    }

    case 'EARN_CASH': {
      const txn: Transaction = {
        id:       `t_${Date.now()}`,
        title:    action.title,
        date:     formatNow(),
        amount:   action.amount,
        currency: 'INR',
        type:     'earn',
      };
      return {
        ...state,
        cashBalance:  state.cashBalance + action.amount,
        totalEarned:  state.totalEarned + action.amount,
        transactions: [txn, ...state.transactions],
      };
    }

    case 'LINK_UPI':  return { ...state, linkedUPI:  action.upiId };
    case 'LINK_BANK': return { ...state, linkedBank: action.bank  };

    case 'TOGGLE_SETTING':
      return { ...state, [action.key]: !state[action.key] };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

type WalletContextType = {
  wallet:          WalletState;
  withdraw:        (amount: number) => void;
  convertXP:       (xpAmount: number) => void;
  earnXP:          (amount: number, title: string) => void;
  earnCash:        (amount: number, title: string) => void;
  linkUPI:         (upiId: string) => void;
  linkBank:        (bank: string) => void;
  toggleSetting:   (key: 'pinEnabled' | 'biometricEnabled' | 'notifXP' | 'notifWithdraw' | 'notifPromos') => void;
};

const WalletContext = createContext<WalletContextType>({
  wallet:        INITIAL,
  withdraw:      () => {},
  convertXP:     () => {},
  earnXP:        () => {},
  earnCash:      () => {},
  linkUPI:       () => {},
  linkBank:      () => {},
  toggleSetting: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, dispatch] = useReducer(reducer, INITIAL);

  const value: WalletContextType = {
    wallet,
    withdraw:      (amount)        => dispatch({ type: 'WITHDRAW',    amount }),
    convertXP:     (xpAmount)      => dispatch({ type: 'CONVERT_XP', xpAmount }),
    earnXP:        (amount, title) => dispatch({ type: 'EARN_XP',    amount, title }),
    earnCash:      (amount, title) => dispatch({ type: 'EARN_CASH',  amount, title }),
    linkUPI:       (upiId)         => dispatch({ type: 'LINK_UPI',   upiId }),
    linkBank:      (bank)          => dispatch({ type: 'LINK_BANK',  bank }),
    toggleSetting: (key)           => dispatch({ type: 'TOGGLE_SETTING', key }),
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useWallet = () => useContext(WalletContext);
