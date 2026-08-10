import { apiClient } from "./apiClient";

import { Notification } from "../types";

export const notificationService = {
  getNotifications: async (
    page = 1,
    limit = 20,
    unreadOnly = false,
    type?: string,
  ): Promise<{ data: Notification[]; meta: { unreadCount: number } }> => {
    const typeParam = type ? `&type=${encodeURIComponent(type)}` : '';
    const unreadParam = unreadOnly ? '&unread=true' : '';
    const response = await apiClient.get(
      `/notifications?page=${page}&limit=${limit}${unreadParam}${typeParam}`,
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

      // Carry the sender id for presence dots on avatars.
      (n as any).senderId = n.senderId || undefined;
      // "X joined the community" / "X approved your request" are stored as
      // FOLLOW rows with a community resource — route them to the community,
      // not to the sender's profile with a Follow Back button. This must be
      // checked BEFORE the generic FOLLOW branch below.
      if (rawType === 'FOLLOW' && n.resourceType === 'community') mappedType = 'community';
      else if (rawType === 'FOLLOW' || rawType === 'REQUEST_TO_FOLLOW' || rawType === 'APPROVED_TO_FOLLOW') mappedType = 'follow';
      else if (rawType === 'NEW_POST') mappedType = 'post';
      else if (rawType.includes('LIKE')) mappedType = 'like';
      else if (rawType.includes('COMMENT')) mappedType = 'comment';
      else if (rawType === 'REPLY') mappedType = 'comment';
      else if (
        rawType === 'REQUEST_TO_JOIN_COMMUNITY' ||
        rawType === 'NEW_MEMBER_JOIN_COMMUNITY' ||
        rawType === 'APPROVED_TO_JOIN_COMMUNITY' ||
        rawType === 'COMMUNITY_JOIN_REQUEST' ||
        rawType === 'COMMUNITY_JOIN_APPROVED'
      ) mappedType = 'community';
      else if (rawType.includes('EVENT')) mappedType = 'event';
      else if (rawType === 'WALLET_CREDIT' || rawType === 'REFERRAL_REWARD' || rawType === 'LEVEL_UP') mappedType = 'achievement';
      else if (rawType === 'GAME_INVITE') mappedType = 'game_invite';
      // Streak reminders / milestone rewards → the Home tab (the streak popup
      // lives there), never to a post or profile.
      else if (rawType === 'STREAK_AT_RISK' || rawType === 'STREAK_REWARD') mappedType = 'streak';

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
          // Server-resolved live state (see notification.service getAll):
          //  - isMutual: recipient already follows the sender → hide Follow Back
          //  - requestActive: the pending request still exists → hide Approve/Decline
          //  - senderPrivacy: private senders make follow-back a REQUEST
          isMutual: n.isMutual === true,
          requestActive: n.requestActive !== false,
          senderPrivacy: n.senderPrivacy || 'public',
        };
      } else if (mappedType === 'achievement') {
        // Route wallet/referral rewards to the Wallet tab; level-ups go to the
        // profile. The screen reads payload.kind to pick the destination.
        if (rawType === 'REFERRAL_REWARD') payload = { kind: 'referral_reward', userId: n.senderId };
        else if (rawType === 'WALLET_CREDIT') payload = { kind: 'wallet_credit', userId: n.senderId };
        else payload = { kind: 'level_up', userId: n.senderId };
      } else if (mappedType === 'community') {
        // Community rows carry the community id in resourceId — the screen
        // resolves the slug from it and opens the community detail page.
        payload = { communityId: n.resourceId, userId: n.senderId };
      }

      // Comment mentions carry the exact comment id in the message
      // ("<name> mentioned you in a comment | <id>") so the app can deep-link
      // and auto-scroll to the mentioned comment on the post page.
      const commentMentionMatch = String(text).match(
        /^(.*mentioned you in a comment)\s*\|\s*([0-9a-fA-F-]{36})$/
      );
      if (commentMentionMatch) {
        text = commentMentionMatch[1].trim();
        payload = { ...(payload || {}), commentId: commentMentionMatch[2] };
      }

      return {
        id: n.id,
        type: mappedType,
        senderId: n.senderId || undefined,
        avatar: firstWord.charAt(0).toUpperCase(),
        avatarUrl: n.senderAvatarUrl || undefined,
        // Server-enriched preview image (post media / community avatar / game
        // cover) — rendered as a thumbnail on the right side of the row.
        thumbnailUrl: n.thumbnailUrl || undefined,
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
          // Generic sender id — available for every row (presence dots etc.).
          senderId: n.senderId || undefined,
          // Every row carries the sender's username so tapping a post/like/
          // comment/mention notification can still land on a profile even when
          // the post can't be fetched (deleted / private / legacy NULL
          // resource_id rows).
          username: n.senderUsername || undefined,
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
