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

// ─── State & Actions ──────────────────────────────────────────────────────────

type State = {
  matches: GameMatch[];

  isLoading: boolean;
};

type Action =
  | { type: 'SET_DATA'; matches: GameMatch[] }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'ADD_MATCH'; match: GameMatch };

const INITIAL: State = {
  matches: [],

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
      return { ...state, matches: action.matches, isLoading: false };
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    case 'ADD_MATCH': {
      return {
        ...state,
        matches: [action.match, ...state.matches],
      };
    }
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

type GamesContextType = {
  matches:  GameMatch[];

  isLoading: boolean;
  fetchGamesData: () => Promise<void>;
  addMatch: (matchData: any) => Promise<void>;
};

const GamesContext = createContext<GamesContextType>({
  matches:  [],

  isLoading: false,
  fetchGamesData: async () => {},
  addMatch: async () => {},
});

export function GamesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const fetchGamesData = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      const historyRes = await gamesService.getMatchHistory(1, 20);
      const history = Array.isArray(historyRes?.data) ? historyRes.data.map(formatMatch) : [];
      dispatch({
        type: 'SET_DATA',
        matches: history,
      });
    } catch (e) {
      console.error('Failed to fetch games data', e);
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  }, []);

  return (
    <GamesContext.Provider value={{
      matches:  state.matches,
      isLoading: state.isLoading,
      fetchGamesData,
      addMatch: async (matchData) => {
        const normalized = matchData?.result === 'WIN' || matchData?.result === 'LOSS'
          ? formatMatch(matchData)
          : matchData;

        const match: GameMatch = {
          id: normalized.id || `local-${Date.now()}`,
          opponent: normalized.opponent || (normalized.mode === 'bot' ? 'AI Bot' : 'Guest Player'),
          playedAt: normalized.playedAt || 'Just now',
          ...normalized,
        };

        dispatch({ type: 'ADD_MATCH', match });
      },
    }}>
      {children}
    </GamesContext.Provider>
  );
}

export const useGames = () => useContext(GamesContext);
