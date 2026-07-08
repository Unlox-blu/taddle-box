import React, { createContext, useContext, useReducer } from 'react';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BOT_NAMES = ['ChessBot Pro', 'QuickAI', 'GrandMaster Bot', 'EasyBot', 'TurboAI'];
const randomBot = () => BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];

function formatNow(): string {
  const d    = new Date();
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day   = new Date(d); day.setHours(0, 0, 0, 0);
  return day.getTime() === today.getTime() ? `Today · ${time}` : `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${time}`;
}

// ─── Seed history ─────────────────────────────────────────────────────────────

const SEED_MATCHES: GameMatch[] = [
  { id: 'm1', gameId: 'g1', gameName: 'Chess',         gameEmoji: '♟️', mode: 'bot',        result: 'win',  xpEarned: 120, score: '1–0',     duration: '4m 12s', opponent: 'ChessBot Pro',    playedAt: 'Today · 11:30 AM'     },
  { id: 'm2', gameId: 'g2', gameName: 'Ludo',          gameEmoji: '🎲', mode: 'quick',      result: 'loss', xpEarned: 10,  score: '2nd',     duration: '7m 44s', opponent: 'Priya_Dev',        playedAt: 'Today · 10:15 AM'     },
  { id: 'm3', gameId: 'g3', gameName: 'Block Blaster', gameEmoji: '💥', mode: 'bot',        result: 'win',  xpEarned: 55,  score: '1840 pts', duration: '3m 02s', opponent: 'GrandMaster Bot',  playedAt: 'Yesterday · 9:00 PM'  },
  { id: 'm4', gameId: 'g1', gameName: 'Chess',         gameEmoji: '♟️', mode: 'tournament', result: 'win',  xpEarned: 150, score: '1–0',     duration: '6m 50s', opponent: 'Champion_Raj',     playedAt: 'Yesterday · 4:20 PM'  },
  { id: 'm5', gameId: 'g4', gameName: 'Candy Connect', gameEmoji: '🍬', mode: 'quick',      result: 'loss', xpEarned: 10,  score: '3240 pts', duration: '2m 18s', opponent: 'Sana_Codes',       playedAt: 'Jun 11 · 8:00 PM'    },
  { id: 'm6', gameId: 'g2', gameName: 'Ludo',          gameEmoji: '🎲', mode: 'bot',        result: 'win',  xpEarned: 75,  score: '1st',     duration: '9m 31s', opponent: 'EasyBot',          playedAt: 'Jun 10 · 3:10 PM'    },
];

// ─── State & Actions ──────────────────────────────────────────────────────────

type State = {
  matches: GameMatch[];
  stats:   PlayerStats;
};

type Action =
  | { type: 'ADD_MATCH'; match: Omit<GameMatch, 'id' | 'playedAt' | 'opponent'> };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_MATCH': {
      const match: GameMatch = {
        ...action.match,
        id:       `m_${Date.now()}`,
        playedAt: formatNow(),
        opponent: action.match.mode === 'bot' ? randomBot() : 'Online Player',
      };
      const isWin = match.result === 'win';
      const newStreak = isWin ? state.stats.currentStreak + 1 : 0;
      return {
        matches: [match, ...state.matches],
        stats: {
          totalXP:       state.stats.totalXP + match.xpEarned,
          gamesPlayed:   state.stats.gamesPlayed + 1,
          wins:          state.stats.wins + (isWin ? 1 : 0),
          currentStreak: newStreak,
          bestStreak:    Math.max(state.stats.bestStreak, newStreak),
        },
      };
    }
    default:
      return state;
  }
}

const INITIAL: State = {
  matches: SEED_MATCHES,
  stats: {
    totalXP:       2980,
    gamesPlayed:   142,
    wins:          97,
    currentStreak: 3,
    bestStreak:    12,
  },
};

// ─── Context ──────────────────────────────────────────────────────────────────

type GamesContextType = {
  matches:  GameMatch[];
  stats:    PlayerStats;
  addMatch: (match: Omit<GameMatch, 'id' | 'playedAt' | 'opponent'>) => void;
};

const GamesContext = createContext<GamesContextType>({
  matches:  [],
  stats:    INITIAL.stats,
  addMatch: () => {},
});

export function GamesProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  return (
    <GamesContext.Provider value={{
      matches:  state.matches,
      stats:    state.stats,
      addMatch: (match) => dispatch({ type: 'ADD_MATCH', match }),
    }}>
      {children}
    </GamesContext.Provider>
  );
}

export const useGames = () => useContext(GamesContext);
