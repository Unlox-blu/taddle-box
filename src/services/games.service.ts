import { apiClient } from './apiClient';
import type { Game } from '../types';
import type { PlayMode } from '../context/GamesContext';

export type GameLeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  username: string;
  avatarUrl?: string;
  gamesPlayed: number;
  wins: number;
  currentStreak: number;
  bestStreak: number;
  totalXP: number;
};

export type GameTournament = {
  id: string;
  gameId: string;
  gameName: string;
  gameSlug: string;
  title: string;
  description?: string;
  entryFeeXP: number;
  prizeXP: number;
  maxPlayers: number;
  playerCount: number;
  isJoined: boolean;
  startsAt: string;
  endsAt: string;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  metadata?: Record<string, any>;
};

export type MatchmakingResponse = {
  status: 'WAITING' | 'MATCHED';
  ticket: {
    id: string;
    gameId: string;
    tournamentId?: string | null;
    mode: 'QUICK' | 'TOURNAMENT';
    status: 'WAITING' | 'MATCHED' | 'CANCELLED' | 'EXPIRED';
    opponentUserId?: string | null;
    opponentName?: string | null;
    opponentUsername?: string | null;
    userMatchId?: string | null;
  };
  match?: any;
  opponent?: {
    userId: string;
    name?: string;
    username?: string;
  } | null;
};

export const gamesService = {
  getGames: async (page = 1, limit = 20): Promise<{ data: Game[] }> => {
    const response = await apiClient.get(`/game?page=${page}&limit=${limit}`);
    return response.data;
  },
  getActiveSession: async (): Promise<{ data: any }> => {
    const response = await apiClient.get('/game/session/active');
    return response.data;
  },

  getTrendingGames: async (limit = 3): Promise<{ data: Game[] }> => {
    const response = await apiClient.get(`/game/trending?limit=${limit}`);
    return response.data;
  },

  getGameDetail: async (id: string): Promise<{ data: Game }> => {
    const response = await apiClient.get(`/game/${id}`);
    return response.data;
  },



  getMatchHistory: async (page = 1, limit = 20) => {
    const response = await apiClient.get(`/game/match/history?page=${page}&limit=${limit}`);
    return response.data;
  },

  createMatch: async (gameId: string, mode: PlayMode) => {
    const response = await apiClient.post('/game/create-match', {
      gameId,
      mode: mode.toUpperCase(),
      metadata: { client: 'html5_webview' },
    });
    return response.data;
  },

  completeMatch: async (data: {
    matchId: string;
    result: 'WIN' | 'LOSS' | 'DRAW';
    score: number;
    duration: number;
    xpEarned?: number;
  }) => {
    const response = await apiClient.patch('/game/update-match', data);
    return response.data;
  },

  startGameSession: async (gameId: string, mode?: string, matchGroupId?: string) => {
    const response = await apiClient.post('/game/session/start', { gameId, mode, matchGroupId });
    return response.data;
  },

  completeGameSession: async (data: {
    sessionId: string;
    tapLog?: any[];
    clientNonce?: string;
  }) => {
    const response = await apiClient.post('/game/session/complete', data);
    return response.data;
  },

  getLeaderboard: async (page = 1, limit = 20): Promise<{ data: GameLeaderboardEntry[] }> => {
    const response = await apiClient.get(`/game/leaderboard?page=${page}&limit=${limit}`);
    return response.data;
  },

  getTournaments: async (page = 1, limit = 20): Promise<{ data: GameTournament[] }> => {
    const response = await apiClient.get(`/game/tournaments?page=${page}&limit=${limit}`);
    return response.data;
  },

  joinTournament: async (tournamentId: string): Promise<{ data: GameTournament }> => {
    const response = await apiClient.post(`/game/tournaments/${tournamentId}/join`);
    return response.data;
  },

  joinMatchmaking: async (data: {
    gameId: string;
    mode: 'QUICK' | 'TOURNAMENT';
    tournamentId?: string;
    targetPlayers?: number;
  }): Promise<{ data: MatchmakingResponse }> => {
    const response = await apiClient.post('/game/matchmaking/join', data);
    return response.data;
  },

  getMatchmakingTicket: async (ticketId: string): Promise<{ data: MatchmakingResponse }> => {
    const response = await apiClient.get(`/game/matchmaking/${ticketId}`);
    return response.data;
  },

  cancelMatchmakingTicket: async (ticketId: string) => {
    const response = await apiClient.post(`/game/matchmaking/${ticketId}/cancel`);
    return response.data;
  },
};
