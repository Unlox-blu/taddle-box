import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import type { Transaction, XPUpdatedPayload, WalletUpdatedPayload } from '../types';
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

// Maps the backend's raw XP source_type codes to user-friendly wallet titles.
// Display name for known game slugs (used in XP history titles). Anything
// unknown falls back to the slug prettified, so new games still read fine.
const GAME_NAMES: Record<string, string> = {
  "tap-rush": "Tap Rush",
  "memory-grid": "Memory Grid",
  "scribble": "Scribble",
  "ludo": "Ludo",
  "snake-ladder": "Snake & Ladder",
  "chess": "Chess",
  "word-rush": "Word Rush",
};

const gameNameFromSlug = (slug: string): string =>
  GAME_NAMES[slug] ||
  slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() ||
  "Game";

// Extract the game slug from a game-related sourceType:
//   session_ludo           → 'ludo'
//   game_session_<uuid>    → (unknown — the win source carries a session id)
//   game_match_<uuid>      → (unknown)
//   tournament_<uuid>      → (unknown)
// Returns null when the name can't be recovered from the source string.
const gameSlugFromSource = (st: string): string | null => {
  if (st.startsWith("session_")) {
    const slug = st.slice("session_".length);
    return slug && !slug.includes("-") ? slug : /^[a-z0-9-]+$/.test(slug) ? slug : null;
  }
  if (st.startsWith("game_")) {
    // game_lobby has no id; game_session_/game_match_ are followed by a UUID
    const rest = st.slice("game_".length);
    if (rest === "lobby") return "lobby";
    return null;
  }
  return null;
};

// Referral bonuses get explicit entries so both sides of a referral are visible
// in wallet history. Unknown codes are prettified (snake_case → Title Case)
// rather than ever shown raw. Game transactions get the GAME NAME and an honest
// label — an entry-fee spend is "Played Ludo" (shows as -XP), a win credit is
// "Ludo Reward" (+XP).
function formatXpTitle(sourceType?: string, transactionType?: string, gameName?: string | null): string {
  const st = sourceType || "";
  const isSpend = transactionType === "spent";
  if (st === "referral_signup_bonus") return "Referral Bonus — Welcome!";
  if (st === "referral_invite_bonus") return "Referral Bonus — Friend joined";
  if (st.startsWith("Daily Login")) return "Daily Login Reward";
  if (st.startsWith("Streak Reward")) return "Daily Streak Reward";
  if (st.startsWith("Streak Restore")) return "Streak Restore";
  if (st.startsWith("view_post_")) return "Post View";
  if (st.startsWith("level_up_")) return "Level Up Bonus";
  if (st.startsWith("community_join_")) return "Joined a Community";
  if (st.startsWith("create_post_")) return "Created a Post";
  if (st.startsWith("event_register_") || st.startsWith("event_ticket_"))
    return "Event Reward";
  if (st.startsWith("event_refund_")) return "Event Refund";
  if (st === "cash_to_xp") return "Cash to XP Conversion";
  if (st === "redeem") return "XP Redeemed";
  if (st === "streak") return "Streak Reward";

  // Games — name the game and be honest about spend vs reward. The backend
  // resolves the game name for win/match sources (game_session_/game_match_);
  // entry-fee sessions (session_<slug>) carry the slug directly.
  const gameSlug = gameSlugFromSource(st);
  const gameLabel = gameName || (gameSlug ? gameNameFromSlug(gameSlug) : null);
  if (gameSlug === "lobby") return "Game Lobby";
  if (gameLabel) {
    if (isSpend) return `Played ${gameLabel} — Entry Fee`;
    return `${gameLabel} Reward`;
  }
  if (st.startsWith("game_") || st.startsWith("session_") || st.startsWith("tournament_") || st.startsWith("tourney_")) {
    // Unknown game id (e.g. tournament_<id>) — keep it generic but
    // sign-aware so a deduction never reads as a reward.
    return isSpend ? "Game Entry Fee" : "Game Reward";
  }

  if (st) {
    return st
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  return isSpend ? "XP Spent" : "XP Earned";
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
  /** True while older pages of history exist and can be loaded. */
  hasMoreTxns:  boolean;
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
  | { type: 'APPEND_TRANSACTIONS'; transactions: Transaction[] }
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
  hasMoreTxns:     false,
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
    case 'APPEND_TRANSACTIONS': {
      // Merge + re-sort so older pages slot in by date (cash and XP both
      // stream in from separate paginated endpoints).
      const merged = [...state.transactions, ...action.transactions].sort(
        (a, b) => (b.ts || 0) - (a.ts || 0)
      );
      return { ...state, transactions: merged };
    }
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
  /** Lightweight balance-only refresh (no transactions/settings). */
  fetchWalletSummary: () => Promise<void>;
  /** Append the next page of history (XP + cash) to the transaction list. */
  loadMoreTransactions: () => Promise<void>;
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
  fetchWalletSummary: async () => {},
  loadMoreTransactions: async () => {},
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

  // xpBalance is sourced ONLY from the summary endpoint and socket events —
  // the auth-synced user.xp value is never used as wallet state. Fetch the
  // summary once per logged-in user so a cold start shows real balances
  // instead of 0 until the first socket event or Wallet-screen visit.
  const { user } = useAuth();
  const summaryFetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    const handleWalletUpdated = (data: WalletUpdatedPayload) => {
      // balanceCents arrives in paise — convert to rupees so the hero balance
      // doesn't flash 100x the real amount after an XP conversion.
      dispatch({ type: 'SET_DATA', payload: {
        cashBalance: (data.balanceCents || 0) / 100,
        heldBalance: (data.heldBalanceCents ?? 0) / 100,
      } });
      
      // Auto-refresh transaction history so "Pending" updates to "Completed"
      fetchWalletData().catch(console.error);
    };
    const handleXPUpdated = (data: XPUpdatedPayload) => {
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

  // Shared mapping of an XP transaction row (backend format) to the wallet's
  // display Transaction. Page-aware so 'load more' can append the same shape.
  const mapXpTxn = React.useCallback((t: any): Transaction => ({
    id: t.id,
    title: formatXpTitle(t.sourceType, t.transactionType, t.gameName || t.game_name),
    date: formatTxnDate(t.createdAt),
    ts: new Date(t.createdAt || new Date()).getTime(),
    amount: t.xp || 0,
    currency: 'XP',
    // 'earned' and 'bonus' (daily login / streak rewards) are earnings;
    // only 'spent' is a deduction (e.g. streak restore). Previously
    // 'bonus' fell through to 'spend', so daily-login XP showed up as
    // -50 in wallet history.
    type: t.transactionType === 'spent' ? 'spend' : 'earn',
    status: t.status || 'completed'
  }), []);

  const mapCashTxn = React.useCallback((t: any): Transaction => ({
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
  }), []);

  const xpPageRef = useRef(1);
  const hasMoreRef = useRef(false);

  const fetchWalletData = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      const [walletRes, cashTxnsRes, xpTxnsRes, settingsRes] = await Promise.all([
        walletService.getWallet(),
        walletService.getTransactions(1, 50),
        xpService.getTransactions(1, 50),
        settingsService.getSettings()
      ]);

      const cashTxns = (cashTxnsRes.data || []).map(mapCashTxn);
      const xpTxns = (xpTxnsRes.data || []).map(mapXpTxn);
      xpPageRef.current = 1;
      // Both endpoints share the same pagination meta shape ({hasNext, total}).
      hasMoreRef.current =
        !!(xpTxnsRes.meta && xpTxnsRes.meta.hasNext) ||
        !!(cashTxnsRes.meta && cashTxnsRes.meta.hasNext);

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
        hasMoreTxns: hasMoreRef.current,
      }});
      dispatch({ type: 'SET_TRANSACTIONS', transactions: combinedTxns });
    } catch (e) {
      console.error('Failed to fetch wallet data:', e);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, [mapCashTxn, mapXpTxn]);

  // Lightweight balance refresh — hits the summary endpoint only (cash, held,
  // XP counts) so Home/streak flows don't re-fetch transactions + settings.
  const fetchWalletSummary = useCallback(async () => {
    try {
      const res = await walletService.getWalletSummary();
      const d = res?.data;
      if (!d) return;
      dispatch({ type: 'SET_DATA', payload: {
        cashBalance: (d.balanceCents || 0) / 100,
        heldBalance: (d.heldBalanceCents ?? 0) / 100,
        xpBalance: d.xpBalance ?? 0,
      }});
    } catch (e) {
      console.error('Failed to fetch wallet summary:', e);
    }
  }, []);

  // One summary fetch per logged-in user (id keyed), so logout → login as
  // another account still re-seeds from the endpoint, never from user.xp.
  useEffect(() => {
    if (user?.id && summaryFetchedForRef.current !== user.id) {
      summaryFetchedForRef.current = user.id;
      fetchWalletSummary();
    }
  }, [user?.id, fetchWalletSummary]);

  const loadMoreTransactions = useCallback(async () => {
    if (!hasMoreRef.current) return;
    try {
      const nextPage = xpPageRef.current + 1;
      const [cashPageRes, xpPageRes] = await Promise.all([
        // Cash history too — same 50/50 shape as the first page, appended below.
        walletService.getTransactions(nextPage, 50),
        xpService.getTransactions(nextPage, 50),
      ]);

      const cashTxns = (cashPageRes.data || []).map(mapCashTxn);
      const xpTxns = (xpPageRes.data || []).map(mapXpTxn);
      xpPageRef.current = nextPage;
      hasMoreRef.current =
        !!(xpPageRes.meta && xpPageRes.meta.hasNext) ||
        !!(cashPageRes.meta && cashPageRes.meta.hasNext);

      dispatch({ type: 'APPEND_TRANSACTIONS', transactions: [...cashTxns, ...xpTxns] });
      dispatch({ type: 'SET_DATA', payload: { hasMoreTxns: hasMoreRef.current } });
    } catch (e) {
      console.error('Failed to load more transactions:', e);
    }
  }, [mapCashTxn, mapXpTxn]);

  const value: WalletContextType = {
    wallet,
    fetchWalletData,
    fetchWalletSummary,
    loadMoreTransactions,
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
