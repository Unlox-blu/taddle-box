'use strict';

const pool = require('../../config/database');

class ChatRepository {
  // ── Get or create a 1:1 conversation between two mutual followers ──
  async getOrCreateConversation(userIdA, userIdB) {
    // Check if conversation already exists
    const existing = await pool.query(
      `SELECT cp1.conversation_id
       FROM conversation_participants cp1
       JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
       WHERE cp1.user_id = $1 AND cp2.user_id = $2
       LIMIT 1`,
      [userIdA, userIdB]
    );
    if (existing.rows.length > 0) {
      return existing.rows[0].conversation_id;
    }
    // Create new conversation
    const conv = await pool.query(
      `INSERT INTO conversations DEFAULT VALUES RETURNING id`
    );
    const convId = conv.rows[0].id;
    await pool.query(
      `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
      [convId, userIdA, userIdB]
    );
    return convId;
  }

  // ── Inbox: list conversations for a user ──
  async getInbox(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(
      `SELECT c.id, c.last_message, c.last_message_at, c.updated_at,
              cp_joined.last_read_at,
              u.id AS other_user_id, u.name AS other_user_name,
              u.username AS other_user_username,
              au.cloudfront_url AS other_user_avatar,
              (SELECT COUNT(*) FROM messages m
               WHERE m.conversation_id = c.id
                 AND m.sender_id != $1
                 AND m.deleted_at IS NULL
                 AND m.created_at > COALESCE(cp_joined.last_read_at, cp_joined.joined_at)
              )::int AS unread_count
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
       JOIN conversation_participants cp_joined ON cp_joined.conversation_id = c.id AND cp_joined.user_id = $1
       JOIN conversation_participants cp_other ON cp_other.conversation_id = c.id AND cp_other.user_id != $1
       JOIN users u ON u.id = cp_other.user_id
       LEFT JOIN media au ON au.id = u.avatar_url
       WHERE c.id IN (
         SELECT conversation_id FROM conversation_participants WHERE user_id = $1
       )
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const countResult = await pool.query(
      `SELECT COUNT(*)::int FROM conversation_participants WHERE user_id = $1`,
      [userId]
    );
    return { conversations: rows, total: countResult.rows[0].count };
  }

  // ── Messages for a conversation ──
  async getMessages(conversationId, userId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(
      `SELECT m.id, m.sender_id, m.message_type, m.content, m.post_id,
              m.game_name, m.game_invite_code, m.game_lobby_id,
              m.reactions, m.created_at,
              u.name AS sender_name, u.username AS sender_username,
              au.cloudfront_url AS sender_avatar,
              -- Shared post preview (simplified)
              p.id AS shared_post_id, p.title AS shared_post_title,
              p.content AS shared_post_content,
              pu.name AS shared_post_author_name,
              -- First media of shared post for thumbnail
              (SELECT pm.cloudfront_url FROM media pm
               WHERE pm.post_id = p.id AND pm.deleted_at IS NULL
               ORDER BY pm.created_at LIMIT 1) AS shared_post_media_url,
              (SELECT pm.media_type FROM media pm
               WHERE pm.post_id = p.id AND pm.deleted_at IS NULL
               ORDER BY pm.created_at LIMIT 1) AS shared_post_media_type
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN media au ON au.id = u.avatar_url
       LEFT JOIN posts p ON p.id = m.post_id AND p.deleted_at IS NULL
       LEFT JOIN users pu ON pu.id = p.author_id
       WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
       ORDER BY m.created_at ASC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );
    // Mark as read
    await pool.query(
      `UPDATE conversation_participants
       SET last_read_at = NOW()
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    // Notify devices that unread counts have changed
    const { emitDeviceUnreadPing } = require('../../sockets/device.socket');
    emitDeviceUnreadPing(userId).catch(err => console.error('[ChatRepo] emitDeviceUnreadPing error:', err.message));

    return rows;
  }

  // ── Send a message ──
  async sendMessage({ conversationId, senderId, messageType, content, postId, gameName, gameInviteCode, gameLobbyId }) {
    const { rows } = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, message_type, content, post_id, game_name, game_invite_code, game_lobby_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, sender_id, message_type, content, post_id, game_name, game_invite_code, game_lobby_id, reactions, created_at`,
      [conversationId, senderId, messageType || 'text', content || null, postId || null, gameName || null, gameInviteCode || null, gameLobbyId || null]
    );
    return rows[0];
  }

  // ── Add/remove reaction ──
  async toggleReaction(messageId, userId, emoji) {
    const { rows } = await pool.query(
      `SELECT reactions FROM messages WHERE id = $1`,
      [messageId]
    );
    if (!rows.length) return null;
    const reactions = rows[0].reactions || {};
    const users = reactions[emoji] || [];
    const idx = users.indexOf(userId);
    if (idx >= 0) {
      users.splice(idx, 1);
    } else {
      users.push(userId);
    }
    if (users.length === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = users;
    }
    const { rows: updated } = await pool.query(
      `UPDATE messages SET reactions = $1 WHERE id = $2 RETURNING id, reactions`,
      [JSON.stringify(reactions), messageId]
    );
    return updated[0];
  }

  // ── Mutual followers for user search ──
  async getMutualFollowers(userId, query = '', page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const searchTerm = query ? `%${query}%` : '';
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.username,
              au.cloudfront_url AS avatar_url,
              EXISTS(
                SELECT 1 FROM conversations c
                JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
                JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = u.id
              ) AS has_conversation
       FROM users u
       LEFT JOIN media au ON au.id = u.avatar_url
       WHERE u.id != $1
         AND EXISTS (
           SELECT 1 FROM followers f1
           WHERE f1.follower_id = $1 AND f1.following_id = u.id AND f1.status = 'active'
         )
         AND EXISTS (
           SELECT 1 FROM followers f2
           WHERE f2.follower_id = u.id AND f2.following_id = $1 AND f2.status = 'active'
         )
         AND ($2 = '' OR u.name ILIKE $2 OR u.username ILIKE $2)
       ORDER BY u.name
       LIMIT $3 OFFSET $4`,
      [userId, searchTerm, limit, offset]
    );
    return rows;
  }

  // ── Check if two users are mutual followers ──
  async areMutual(userIdA, userIdB) {
    const { rows } = await pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM followers WHERE follower_id = $1 AND following_id = $2 AND status = 'active'
       ) AND EXISTS(
         SELECT 1 FROM followers WHERE follower_id = $2 AND following_id = $1 AND status = 'active'
       ) AS mutual`,
      [userIdA, userIdB]
    );
    return rows[0].mutual;
  }
}

module.exports = new ChatRepository();
