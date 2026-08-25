import { apiClient } from './apiClient';
import type { Game } from '../types';

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
  /** Current user's wins inside this tournament (null when not joined). */
  myScore?: number | null;
  /** Current user's rank inside this tournament (null when not joined). */
  myRank?: number | null;
  startsAt: string;
  endsAt: string;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  metadata?: Record<string, any>;
};

export type MatchmakingResponse = {
  status: 'WAITING' | 'MATCHED';
  ticket?: {
    id?: string;
    gameId?: string;
    tournamentId?: string | null;
    mode?: 'AUTO' | 'CUSTOM' | 'TOURNAMENT' | 'PRACTICE';
    status?: 'WAITING' | 'MATCHED' | 'CANCELLED' | 'EXPIRED';
    opponentUserId?: string | null;
    opponentName?: string | null;
    opponentUsername?: string | null;
    userMatchId?: string | null;
    lobbyId?: string | null;
    matchGroupId?: string | null;
  };
  match?: any;
  matchMetadata?: {
    lobbyId?: string;
    gameId?: string;
    gameMode?: string;
    playerIds?: string[];
    playerSnapshots?: Array<{
      id: string;
      username?: string;
      displayName?: string;
      avatar?: string;
      isBot?: boolean;
      team?: number;
      seat?: number;
    }>;
    maxPlayers?: number;
    startedAt?: string;
    runtime?: string;
    tournamentId?: string | null;
    matchGroupId?: string;
  } | null;
  opponent?: {
    userId?: string;
    id?: string;
    name?: string;
    username?: string;
    avatarUrl?: string;
    avatar?: string;
  } | null;
  lobbyId?: string | null;
  lobbyState?: any;
  expiresAt?: string;
  players?: any[];
  maxPlayers?: number;
  currentPlayers?: number;
  message?: string;
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

  getMatchHistory: async (page = 1, limit = 20) => {
    const response = await apiClient.get(`/game/match/history?page=${page}&limit=${limit}`);
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
    mode: 'AUTO' | 'CUSTOM' | 'TOURNAMENT' | 'PRACTICE';
    tournamentId?: string;
    targetPlayers?: number;
    /** Number of rounds per match (multi-round games only). Backend validates against game config. */
    rounds?: number;
  }): Promise<{ data: MatchmakingResponse }> => {
    const response = await apiClient.post('/game/matchmaking/join', data);
    return response.data;
  },

  cancelMatchmakingTicket: async () => {
    const response = await apiClient.post(`/game/matchmaking/cancel`);
    return response.data;
  },
};
