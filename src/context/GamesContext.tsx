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
      // In a real scenario, you'd have an endpoint that returns the match history and player stats
      // const res = await gamesService.getMatchHistory();
      // For now, setting to empty to clean up the dummy data
      dispatch({ type: 'SET_DATA', matches: [], stats: INITIAL.stats });
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
        // Implement API call to submit match result here
      },
    }}>
      {children}
    </GamesContext.Provider>
  );
}

export const useGames = () => useContext(GamesContext);
