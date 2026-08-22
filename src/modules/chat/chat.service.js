'use strict';

const chatRepo = require('./chat.repository');

class ChatService {
  // ── Inbox ──
  async getInbox(userId, page, limit) {
    return chatRepo.getInbox(userId, page, limit);
  }

  // ── Get or create conversation ──
  async getOrCreateConversation(userId, otherUserId) {
    // Verify mutual followers
    const mutual = await chatRepo.areMutual(userId, otherUserId);
    if (!mutual) {
      throw new Error('You can only message mutual followers');
    }
    const conversationId = await chatRepo.getOrCreateConversation(userId, otherUserId);
    return conversationId;
  }

  // ── Messages ──
  async getMessages(conversationId, userId, page, limit) {
    return chatRepo.getMessages(conversationId, userId, page, limit);
  }

  // ── Send message ──
  async sendMessage(conversationId, senderId, payload) {
    const message = await chatRepo.sendMessage({
      conversationId,
      senderId,
      messageType: payload.messageType || 'text',
      content: payload.content,
      postId: payload.postId,
      gameName: payload.gameName,
      gameInviteCode: payload.gameInviteCode,
      gameLobbyId: payload.gameLobbyId,
    });
    // Emit real-time to recipient
    try {
      const { emitChatMessage } = require('../../sockets/chat.socket');
      const pool = require('../../config/database');
      const { rows } = await pool.query(
        `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2`,
        [conversationId, senderId]
      );
      for (const row of rows) {
        emitChatMessage(row.user_id, { ...message, conversationId });
      }
    } catch (e) { /* socket emit is best-effort */ }
    return message;
  }

  // ── Toggle reaction ──
  async toggleReaction(messageId, userId, emoji) {
    const result = await chatRepo.toggleReaction(messageId, userId, emoji);
    try {
      const { emitChatReaction } = require('../../sockets/chat.socket');
      const pool = require('../../config/database');
      const { rows } = await pool.query(
        `SELECT conversation_id FROM messages WHERE id = $1`, [messageId]
      );
      if (rows.length) {
        const { rows: participants } = await pool.query(
          `SELECT user_id FROM conversation_participants WHERE conversation_id = $1`,
          [rows[0].conversation_id]
        );
        for (const p of participants) {
          emitChatReaction(p.user_id, { messageId, reactions: result.reactions });
        }
      }
    } catch (e) { /* socket emit is best-effort */ }
    return result;
  }

  // ── Mutual followers ──
  async getMutualFollowers(userId, query, page, limit) {
    return chatRepo.getMutualFollowers(userId, query, page, limit);
  }
}

module.exports = new ChatService();
