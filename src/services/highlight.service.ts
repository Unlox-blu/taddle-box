import { apiClient } from './apiClient';

export interface Highlight {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  tag: string;
  tagColor: string;
  emoji: string;
  gradient: [string, string];
  type?: string;
  sourceId?: string;
  imageUrl?: string;
}

export const highlightService = {
  getHighlights: async (page = 1, limit = 10): Promise<{ data: Highlight[] }> => {
    const response = await apiClient.get(`/highlight?page=${page}&limit=${limit}`);
    return response.data;
  }
};
