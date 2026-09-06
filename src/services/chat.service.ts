import { apiClient } from "./apiClient";

export interface ChatUser {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  has_conversation: boolean;
}

export interface Conversation {
  id: string;
  last_message: string | null;
  last_message_at: string | null;
  updated_at: string | null;
  last_read_at: string | null;
  other_user_id: string;
  other_user_name: string;
  other_user_username: string;
  other_user_avatar: string | null;
  unread_count: number;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  message_type: "text" | "post" | "game_invite";
  content: string | null;
  post_id: string | null;
  game_name: string | null;
  game_invite_code: string | null;
  game_lobby_id: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  sender_name: string;
  sender_username: string;
  sender_avatar: string | null;
  shared_post_id: string | null;
  shared_post_title: string | null;
  shared_post_content: string | null;
  shared_post_author_name: string | null;
  shared_post_author_username: string | null;
  shared_post_author_avatar: string | null;
  shared_post_created_at: string | null;
  shared_post_media_url: string | null;
  shared_post_media_type: string | null;
  orig_post_id: string | null;
  orig_post_title: string | null;
  orig_post_content: string | null;
  orig_post_created_at: string | null;
  orig_post_author_name: string | null;
  orig_post_author_username: string | null;
  orig_post_author_avatar: string | null;
  game_thumbnail: string | null;
  game_banner_url: string | null;
}

export const chatService = {
  async getInbox(page = 1, limit = 20) {
    const res = await apiClient.get("/chat/inbox", { params: { page, limit } });
    return res.data;
  },

  async searchMutuals(q = "", page = 1, limit = 20) {
    const res = await apiClient.get("/chat/mutuals", { params: { q, page, limit } });
    return res.data as ChatUser[];
  },

  async getOrCreateConversation(otherUserId: string) {
    const res = await apiClient.post("/chat/conversation", { otherUserId });
    return res.data.conversationId as string;
  },

  async getMessages(conversationId: string, page = 1, limit = 50) {
    const res = await apiClient.get(`/chat/conversation/${conversationId}/messages`, {
      params: { page, limit },
    });
    return res.data as ChatMessage[];
  },

  async sendMessage(
    conversationId: string,
    payload: {
      messageType?: string;
      content?: string;
      postId?: string;
      gameName?: string;
      gameInviteCode?: string;
      gameLobbyId?: string;
    }
  ) {
    const res = await apiClient.post(
      `/chat/conversation/${conversationId}/messages`,
      payload
    );
    return res.data as ChatMessage;
  },

  async toggleReaction(messageId: string, emoji: string) {
    const res = await apiClient.post(`/chat/message/${messageId}/reaction`, { emoji });
    return res.data as { id: string; reactions: Record<string, string[]> };
  },

  async deleteMessage(messageId: string) {
    const res = await apiClient.delete(`/chat/message/${messageId}`);
    return res.data;
  },

  async deleteConversation(conversationId: string) {
    const res = await apiClient.delete(`/chat/conversation/${conversationId}`);
    return res.data;
  },
};
