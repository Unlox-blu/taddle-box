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

      // backend type could be 'follow', 'FOLLOW', 'like_post', 'GAME_INVITE', etc.
      // Normalize case so both lowercase (legacy job processor) and uppercase
      // (publishNotification/normalizeType) stored types map correctly.
      const rawType = String(n.type || '').toUpperCase();
      let mappedType: Notification['type'] = 'mention';
      if (rawType === 'FOLLOW' || rawType === 'REQUEST_TO_FOLLOW' || rawType === 'APPROVED_TO_FOLLOW') mappedType = 'follow';
      else if (rawType.includes('LIKE')) mappedType = 'like';
      else if (rawType.includes('COMMENT')) mappedType = 'comment';
      else if (rawType.includes('EVENT')) mappedType = 'event';
      else if (rawType === 'WALLET_CREDIT' || rawType === 'REFERRAL_REWARD' || rawType === 'LEVEL_UP') mappedType = 'achievement';
      else if (rawType === 'GAME_INVITE') mappedType = 'game_invite';

      let payload: any = undefined;
      let text = n.message || '';
      if (mappedType === 'game_invite') {
        // Backend message format: "Tap to join their private lobby | <lobbyId> | <inviteCode>"
        const parts = text.split('|');
        if (parts.length > 1) {
          const lobbyId = parts[1]?.trim();
          const inviteCode = parts[2]?.trim() || lobbyId;
          // Title format: "<sender> invited you to play <game>!"
          const gameName = n.title?.match(/play\s+(.+?)\s*!/)?.[1];
          payload = {
            gameId: n.resourceId,
            lobbyId,
            matchGroupId: lobbyId,
            inviteCode,
            gameName,
            senderId: n.senderId,
          };
          text = parts[0];
        } else {
          payload = { gameId: n.resourceId, inviteCode: n.resourceId };
        }
      } else if (mappedType === 'follow') {
        // Carry the follower's identity so the NotificationsScreen can render a
        // Follow Back action without another API call.
        const username = n.message?.match(/\(@([^)]+)\)/)?.[1];
        payload = {
          userId: n.senderId,
          username,
          // REQUEST_TO_FOLLOW needs Approve/Reject actions instead of Follow Back.
          isFollowRequest: rawType === 'REQUEST_TO_FOLLOW',
        };
      } else if (mappedType === 'achievement' && rawType === 'REFERRAL_REWARD') {
        payload = { kind: 'referral_reward', userId: n.senderId };
      }

      return {
        id: n.id,
        type: mappedType,
        avatar: firstWord.charAt(0).toUpperCase(),
        avatarUrl: n.senderAvatarUrl || undefined,
        actor: n.senderName || n.title || 'Notification',
        text: text,
        time: timeStr,
        isRead: n.isRead,
        group,
        resourceId: n.resourceId ?? undefined,
        resourceType: n.resourceType ?? undefined,
        createdAt: n.createdAt,
        payload: {
          ...(payload || {}),
          // Prefer the server-resolved sender identity for follow-back actions.
          ...(mappedType === 'follow' && n.senderUsername
            ? { userId: n.senderId, username: n.senderUsername, name: n.senderName }
            : {}),
        },
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
