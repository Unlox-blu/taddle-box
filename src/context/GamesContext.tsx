import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { gamesService } from '../services/games.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlayMode = 'bot' | 'quick' | 'tournament';

export type GameMatch = {
  id:         string;
  gameId:     string;
  gameName:   string;
  gameEmoji:  string;
  mode:       PlayMode;
  result:     'win' | 'loss';
  xpEarned:   number;
  score:      string;
  duration:   string;
  opponent:   string;
  playedAt:   string;
};

export type PlayerStats = {
  totalXP:       number;
  gamesPlayed:   number;
  wins:          number;
  currentStreak: number;
  bestStreak:    number;
};

// ─── State & Actions ──────────────────────────────────────────────────────────

type State = {
  matches: GameMatch[];
  stats:   PlayerStats;
  isLoading: boolean;
};

type Action =
  | { type: 'SET_DATA'; matches: GameMatch[]; stats: PlayerStats }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'ADD_MATCH'; match: GameMatch; newStats: PlayerStats };

const INITIAL: State = {
  matches: [],
  stats: {
    totalXP:       0,
    gamesPlayed:   0,
    wins:          0,
    currentStreak: 0,
    bestStreak:    0,
  },
  isLoading: false,
};

const GAME_EMOJIS: Record<string, string> = {
  'tap-rush': 'TR',
  'memory-grid': 'MG',
};

const formatDuration = (seconds = 0) => {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(safe / 60)}m ${safe % 60}s`;
};

const formatMatch = (match: any): GameMatch => ({
  id: match.id,
  gameId: match.gameId,
  gameName: match.gameName || 'Game',
  gameEmoji: GAME_EMOJIS[match.gameSlug] || 'GM',
  mode: String(match.mode || 'BOT').toLowerCase() as PlayMode,
  result: String(match.result || 'LOSS').toLowerCase() === 'win' ? 'win' : 'loss',
  xpEarned: match.xpEarned || 0,
  score: `${(match.score || 0).toLocaleString()} pts`,
  duration: formatDuration(match.duration),
  opponent: String(match.mode || 'BOT') === 'BOT'
    ? 'AI Bot'
    : (match.metadata?.opponentName || match.metadata?.opponentUsername || 'Matched Player'),
  playedAt: match.createdAt ? new Date(match.createdAt).toLocaleDateString() : 'Just now',
});

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, matches: action.matches, stats: action.stats, isLoading: false };
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    case 'ADD_MATCH': {
      return {
        matches: [action.match, ...state.matches],
        stats: action.newStats,
        isLoading: state.isLoading
      };
    }
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

type GamesContextType = {
  matches:  GameMatch[];
  stats:    PlayerStats;
  isLoading: boolean;
  fetchGamesData: () => Promise<void>;
  addMatch: (matchData: any) => Promise<void>;
};

const GamesContext = createContext<GamesContextType>({
  matches:  [],
  stats:    INITIAL.stats,
  isLoading: false,
  fetchGamesData: async () => {},
  addMatch: async () => {},
});

export function GamesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const fetchGamesData = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      const [statsRes, historyRes] = await Promise.all([
        gamesService.getStats(),
        gamesService.getMatchHistory(1, 20),
      ]);
      const stats = statsRes?.data || INITIAL.stats;
      const history = Array.isArray(historyRes?.data) ? historyRes.data.map(formatMatch) : [];
      dispatch({
        type: 'SET_DATA',
        matches: history,
        stats: {
          totalXP: stats.totalXP || 0,
          gamesPlayed: stats.gamesPlayed || 0,
          wins: stats.wins || 0,
          currentStreak: stats.currentStreak || 0,
          bestStreak: stats.bestStreak || 0,
        },
      });
    } catch (e) {
      console.error('Failed to fetch games data', e);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, []);

  return (
    <GamesContext.Provider value={{
      matches:  state.matches,
      stats:    state.stats,
      isLoading: state.isLoading,
      fetchGamesData,
      addMatch: async (matchData) => {
        const normalized = matchData?.result === 'WIN' || matchData?.result === 'LOSS'
          ? formatMatch(matchData)
          : matchData;
        const isWin = normalized.result === 'win';
        const newStats: PlayerStats = {
          totalXP: state.stats.totalXP + (normalized.xpEarned || 0),
          gamesPlayed: state.stats.gamesPlayed + 1,
          wins: state.stats.wins + (isWin ? 1 : 0),
          currentStreak: isWin ? state.stats.currentStreak + 1 : 0,
          bestStreak: isWin
            ? Math.max(state.stats.bestStreak, state.stats.currentStreak + 1)
            : state.stats.bestStreak,
        };

        const match: GameMatch = {
          id: normalized.id || `local-${Date.now()}`,
          opponent: normalized.opponent || (normalized.mode === 'bot' ? 'AI Bot' : 'Guest Player'),
          playedAt: normalized.playedAt || 'Just now',
          ...normalized,
        };

        dispatch({ type: 'ADD_MATCH', match, newStats });
      },
    }}>
      {children}
    </GamesContext.Provider>
  );
}

export const useGames = () => useContext(GamesContext);
