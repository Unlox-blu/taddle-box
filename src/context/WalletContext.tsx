import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type { Transaction } from '../types';
import { walletService } from '../services/wallet.service';
import { xpService } from '../services/xp.service';
import { settingsService } from '../services/settings.service';
import { useAuth } from './AuthContext';
import { socketClient } from '../services/socketClient';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Turns a raw ISO timestamp into a friendly wallet-history label:
// "Today · 2:30 PM", "Yesterday · 10:15 AM", or "5 Aug · 3:45 PM".
function formatTxnDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfDay) / 86400000);
  // Manual formatting — avoids relying on Hermes Intl (toLocaleTimeString with
  // options can fall back to the raw locale format on some Android builds).
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
  if (diffDays === 0) return `Today · ${time}`;
  if (diffDays === 1) return `Yesterday · ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${time}`;
}

// ─── State & Actions ──────────────────────────────────────────────────────────

export type WalletState = {
  cashBalance:  number;
  /** Cash locked for in-flight withdrawal requests — not withdrawable. */
  heldBalance:  number;
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
  isUnlocked:   boolean;
};

type Action =
  | { type: 'SET_DATA'; payload: any }
  | { type: 'SET_TRANSACTIONS'; transactions: Transaction[] }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'WITHDRAW';    amount: number }
  | { type: 'CONVERT_XP'; xpAmount: number; cashGained: number; txn1: Transaction; txn2: Transaction }
  | { type: 'TOGGLE_SETTING'; key: 'pinEnabled' | 'biometricEnabled' | 'notifXP' | 'notifWithdraw' | 'notifPromos' }
  | { type: 'UNLOCK' }
  | { type: 'LOCK' };

const INITIAL: WalletState = {
  cashBalance:     0,
  heldBalance:     0,
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
  isUnlocked:      false,
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
      // Money leaves the available balance and moves into hold until the
      // admin backend processes the payout (or rejects and refunds it).
      return {
        ...state,
        cashBalance: Math.max(0, state.cashBalance - action.amount),
        heldBalance: state.heldBalance + action.amount,
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

    case 'UNLOCK':
      return { ...state, isUnlocked: true };

    case 'LOCK':
      return { ...state, isUnlocked: false };

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
  recharge:        (amount: number) => Promise<{ html: string; txnid: string }>;
  convertCashToXP: (amount: number) => Promise<void>;
  linkUPI:         (upiId: string) => void;
  linkBank:        (bank: string) => void;
  toggleSetting:   (key: 'pinEnabled' | 'biometricEnabled' | 'notifXP' | 'notifWithdraw' | 'notifPromos') => void;
  unlockWallet:    () => void;
  lockWallet:      () => void; // Used when App Lock re-locks or session ends
};

const WalletContext = createContext<WalletContextType>({
  wallet:        INITIAL,
  fetchWalletData: async () => {},
  withdraw:      async () => '',
  convertXP:     async () => {},
  recharge:      async () => ({ html: '', txnid: '' }),
  convertCashToXP: async () => {},
  linkUPI:       () => {},
  linkBank:      () => {},
  toggleSetting: () => {},
  unlockWallet: () => {},
  lockWallet: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, dispatch] = useReducer(reducer, INITIAL);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.xp !== undefined) {
      dispatch({ type: 'SET_DATA', payload: { xpBalance: user.xp } });
    }
  }, [user?.xp]);

  useEffect(() => {
    const handleWalletUpdated = (data: any) => {
      // balanceCents arrives in paise — convert to rupees so the hero balance
      // doesn't flash 100x the real amount after an XP conversion.
      dispatch({ type: 'SET_DATA', payload: {
        cashBalance: (data.balanceCents || 0) / 100,
        heldBalance: (data.heldBalanceCents ?? 0) / 100,
      } });
    };
    const handleXPUpdated = (data: any) => {
      dispatch({ type: 'SET_DATA', payload: { xpBalance: data.xp } });
    };
    socketClient.events.on('wallet:updated', handleWalletUpdated);
    socketClient.events.on('xp:updated', handleXPUpdated);
    return () => {
      socketClient.events.off('wallet:updated', handleWalletUpdated);
      socketClient.events.off('xp:updated', handleXPUpdated);
    };
  }, []);

  useEffect(() => {
    const loadSecureSettings = async () => {
      try {
        const biometric = await SecureStore.getItemAsync('wallet_biometricEnabled');
        const pin = await SecureStore.getItemAsync('wallet_pinEnabled');
        if (biometric === 'true' && !wallet.biometricEnabled) dispatch({ type: 'TOGGLE_SETTING', key: 'biometricEnabled' });
        if (pin === 'true' && !wallet.pinEnabled) dispatch({ type: 'TOGGLE_SETTING', key: 'pinEnabled' });
      } catch (e) { console.error(e); }
    };
    loadSecureSettings();
  }, []);

  const fetchWalletData = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      const [walletRes, cashTxnsRes, xpTxnsRes, settingsRes] = await Promise.all([
        walletService.getWallet(),
        walletService.getTransactions(1, 50),
        xpService.getTransactions(1, 50),
        settingsService.getSettings()
      ]);
      
      const cashTxns = (cashTxnsRes.data || []).map((t: any) => ({
        id: t.id,
        title: t.description || (t.type === 'credit' ? 'Cash Added' : 'Cash Deducted'),
        date: formatTxnDate(t.createdAt),
        ts: new Date(t.createdAt || new Date()).getTime(),
        amount: (t.amountCents || 0) / 100,
        currency: 'INR',
        type: t.category === 'withdrawal' ? 'withdraw'
          : t.category === 'topup' ? 'topup'
          : (t.type === 'credit' ? 'earn' : 'spend'),
        status: t.status
      }));

      const xpTxns = (xpTxnsRes.data || []).map((t: any) => ({
        id: t.id,
        title: t.sourceType || (t.transactionType === 'spent' ? 'XP Spent' : 'XP Earned'),
        date: formatTxnDate(t.createdAt),
        ts: new Date(t.createdAt || new Date()).getTime(),
        amount: t.xp || 0,
        currency: 'XP',
        // 'earned' and 'bonus' (daily login / weekly streak) are earnings;
        // only 'spent' is a deduction. Previously 'bonus' fell through to
        // 'spend', so daily-login XP showed up as -50 in wallet history.
        type: t.transactionType === 'spent' ? 'spend' : 'earn',
        status: t.status || 'completed'
      }));

      const combinedTxns = [...cashTxns, ...xpTxns].sort((a, b) =>
        (b.ts || 0) - (a.ts || 0)
      );

      dispatch({ type: 'SET_DATA', payload: {
        cashBalance: (walletRes.data?.balanceCents || 0) / 100,
        heldBalance: (walletRes.data?.heldBalanceCents || 0) / 100,
        linkedUPI: walletRes.data?.linkedUpi || null,
        notifXP: settingsRes.data?.notifXP ?? true,
        notifWithdraw: settingsRes.data?.notifWithdraw ?? true,
        notifPromos: settingsRes.data?.notifPromos ?? false,
      }});
      dispatch({ type: 'SET_TRANSACTIONS', transactions: combinedTxns });
    } catch (e) {
      console.error('Failed to fetch wallet data:', e);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, []);

  const value: WalletContextType = {
    wallet,
    fetchWalletData,
    withdraw: async (amountRupees) => {
      try {
        const res = await walletService.initiateWithdrawal(amountRupees * 100);
        // Balance moves to hold immediately server-side; reflect it locally so
        // the hero shows the hold without waiting for a full refetch.
        dispatch({ type: 'WITHDRAW', amount: amountRupees });
        await fetchWalletData();
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
    recharge: async (amountRupees) => {
      const res = await walletService.initiateRecharge(amountRupees * 100);
      return { html: res.data?.html, txnid: res.data?.txnid };
    },
    convertCashToXP: async (amountRupees) => {
      try {
        await walletService.convertCashToXp(amountRupees * 100);
        await fetchWalletData();
      } catch (e) {
        console.error('Buy XP failed', e);
        throw e;
      }
    },

    linkUPI: async (upi) => { 
      try {
        await walletService.linkUPI(upi);
        dispatch({ type: 'SET_DATA', payload: { linkedUPI: upi } });
      } catch (e) {
        console.error('Link UPI failed', e);
      }
    },
    linkBank:      (bank) => { /* Mock or api call */ },
    toggleSetting: async (key) => {
      if (key === 'biometricEnabled' || key === 'pinEnabled') {
        const newValue = !wallet[key];
        try {
          await SecureStore.setItemAsync(`wallet_${key}`, newValue ? 'true' : 'false');
          dispatch({ type: 'TOGGLE_SETTING', key });
        } catch (e) {
          console.error('Toggle failed', e);
        }
      } else {
        dispatch({ type: 'TOGGLE_SETTING', key });
        try {
          if (key === 'notifXP') await settingsService.toggleNotifXP();
          if (key === 'notifWithdraw') await settingsService.toggleNotifWithdraw();
          if (key === 'notifPromos') await settingsService.toggleNotifPromos();
        } catch (e) {
          console.error('Toggle setting failed', e);
          // Revert on failure
          dispatch({ type: 'TOGGLE_SETTING', key });
        }
      }
    },
    
    unlockWallet: useCallback(() => {
      dispatch({ type: 'UNLOCK' });
    }, []),
    
    lockWallet: useCallback(() => {
      dispatch({ type: 'LOCK' });
    }, []),
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useWallet = () => useContext(WalletContext);
