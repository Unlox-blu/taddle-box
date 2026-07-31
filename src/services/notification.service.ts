import { apiClient } from "./apiClient";

import { Notification } from "../types";

export const notificationService = {
  getNotifications: async (
    page = 1,
    limit = 20,
    unreadOnly = false,
  ): Promise<{ data: Notification[]; meta: { unreadCount: number } }> => {
    const response = await apiClient.get(
      `/notifications?page=${page}&limit=${limit}`,
    );
    
    const now = new Date();
    const mappedData: Notification[] = (response.data?.data || []).map((n: any) => {
      const createdAt = new Date(n.createdAt);
      const diffHrs = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      
      let group: 'today' | 'yesterday' | 'earlier' = 'earlier';
      if (diffHrs < 24 && createdAt.getDate() === now.getDate()) group = 'today';
      else if (diffHrs < 48 && createdAt.getDate() === now.getDate() - 1) group = 'yesterday';

      let timeStr = '';
      if (diffHrs < 1) timeStr = `${Math.floor(diffHrs * 60)}m ago`;
      else if (diffHrs < 24) timeStr = `${Math.floor(diffHrs)}h ago`;
      else timeStr = createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      // Fallback avatar: first letter of the message if missing
      const match = n.message?.match(/^(\S+)/);
      const firstWord = match ? match[1] : 'U';

      // backend type could be 'follow', 'like_post', etc. Map it to frontend Notification['type'].
      let mappedType: Notification['type'] = 'mention';
      if (n.type === 'follow') mappedType = 'follow';
      else if (n.type?.includes('like')) mappedType = 'like';
      else if (n.type?.includes('comment')) mappedType = 'comment';
      else if (n.type?.includes('event')) mappedType = 'event';
      else if (n.type === 'wallet_credit') mappedType = 'achievement';
      else if (n.type === 'GAME_INVITE' || n.type === 'game_invite') mappedType = 'game_invite';

      let payload: any = undefined;
      let text = n.message || '';
      if (mappedType === 'game_invite') {
        const parts = text.split('|');
        if (parts.length > 1) {
          payload = { gameId: n.resourceId, matchGroupId: parts[1] };
          text = parts[0];
        } else {
          payload = { gameId: n.resourceId };
        }
      }

      return {
        id: n.id,
        type: mappedType,
        avatar: firstWord.charAt(0).toUpperCase(),
        actor: n.title || 'Notification',
        text: text,
        time: timeStr,
        isRead: n.isRead,
        group,
        payload,
      };
    });

    return { data: mappedData, meta: response.data?.meta };
  },

  markAllRead: async () => {
    const response = await apiClient.patch("/notifications/read-all");
    return response.data;
  },

  markOneRead: async (id: string) => {
    const response = await apiClient.patch(`/notifications/${id}/read`);
    return response.data;
  },
};
