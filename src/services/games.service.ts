import { apiClient } from './apiClient';
import type { Game } from '../types';

export const gamesService = {
  getGames: async (page = 1, limit = 20): Promise<{ data: Game[] }> => {
    const response = await apiClient.get(`/game?page=${page}&limit=${limit}`);
    return response.data;
  },

  getGameDetail: async (id: string): Promise<{ data: Game }> => {
    const response = await apiClient.get(`/game/${id}`);
    return response.data;
  }
};
