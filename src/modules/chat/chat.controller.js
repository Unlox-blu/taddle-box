'use strict';

const chatService = require('./chat.service');

class ChatController {
  async getInbox(req, res) {
    try {
      const userId = req.userId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const result = await chatService.getInbox(userId, page, limit);
      res.json(result);
    } catch (e) {
      console.error('[chat] getInbox error:', e.message, e.stack);
      res.status(500).json({ message: e.message });
    }
  }

  async getOrCreateConversation(req, res) {
    try {
      const userId = req.userId;
      const { otherUserId } = req.body;
      if (!otherUserId) return res.status(400).json({ message: 'otherUserId required' });
      const conversationId = await chatService.getOrCreateConversation(userId, otherUserId);
      res.json({ conversationId });
    } catch (e) {
      console.error('[chat] getOrCreateConversation error:', e.message);
      res.status(400).json({ message: e.message });
    }
  }

  async getMessages(req, res) {
    try {
      const userId = req.userId;
      const { conversationId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const messages = await chatService.getMessages(conversationId, userId, page, limit);
      res.json(messages);
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  }

  async sendMessage(req, res) {
    try {
      const senderId = req.userId;
      const { conversationId } = req.params;
      const message = await chatService.sendMessage(conversationId, senderId, req.body);
      res.json(message);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  async toggleReaction(req, res) {
    try {
      const userId = req.userId;
      const { messageId } = req.params;
      const { emoji } = req.body;
      if (!emoji) return res.status(400).json({ message: 'emoji required' });
      const result = await chatService.toggleReaction(messageId, userId, emoji);
      res.json(result);
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  }

  async searchMutuals(req, res) {
    try {
      const userId = req.userId;
      const q = req.query.q || '';
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const users = await chatService.getMutualFollowers(userId, q, page, limit);
      res.json(users);
    } catch (e) {
      console.error('[chat] searchMutuals error:', e.message, e.stack);
      res.status(500).json({ message: e.message });
    }
  }
}

module.exports = new ChatController();
