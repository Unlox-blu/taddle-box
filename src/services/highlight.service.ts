import { apiClient } from './apiClient';

export interface Highlight {
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  tag: string;
  tagColor: string;
  emoji: string;
  gradient: [string, string];
  type?: string;
  sourceId?: string;
  /** Community spotlights: the community slug (sourceId is the UUID). */
  sourceSlug?: string;
  imageUrl?: string;
  /** Native artwork from the backend (event cover / community banner). */
  description?: string;
}

export interface HighlightPayload {
  /** Curated spotlight rows (event/community) from the spotlight table. */
  spotlight: Highlight[];
  /** Featured upcoming/ongoing events (raw event objects). */
  featuredEvents: any[];
  /** Top-played games (raw game objects). */
  trendingGames: any[];
}

export const highlightService = {
  /** One round-trip for the Home spotlight: curated rows + featured events +
      trending games (previously three separate calls). */
  getHighlights: async (page = 1, limit = 10): Promise<{ data: HighlightPayload; meta?: any }> => {
    const response = await apiClient.get(`/highlight?page=${page}&limit=${limit}`);
    return response.data;
  }
};
