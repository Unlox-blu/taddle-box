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
      const { addJob } = require('../../jobs/queues/job.queue');
      const userRepo = require('../user/user.repository');
      
      const { rows } = await pool.query(
        `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2`,
        [conversationId, senderId]
      );
      
      let senderInfo = null;
      if (rows.length > 0) {
        senderInfo = await userRepo.findByIdPrivate(senderId);
      }
      
      for (const row of rows) {
        emitChatMessage(row.user_id, { ...message, conversationId });
        
        // Dispatch a push notification job for the chat message
        const senderName = senderInfo ? senderInfo.name : 'Someone';
        const messageBody = payload.messageType === 'text' ? payload.content : `Sent a ${payload.messageType}`;
        
        addJob('push', {
          recipientId: row.user_id,
          senderId: senderId,
          type: 'chat:message',
          title: `New message from ${senderName}`,
          message: messageBody,
          resourceId: conversationId,
          resourceType: 'chat'
        }).catch(err => console.error('[ChatService] addJob push error:', err));
      }
    } catch (e) { /* socket emit/push is best-effort */ }
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
