'use strict';

const { createError } = require('../../utils/error.util');
const CommentModel = require('./comment.model');

class CommentService {
  constructor({
    commentRepository,
    postRepository,
    userRepository,
    followerRepository,
    notificationService,
    feedService,
    communityRepository,
  }) {
    this.commentRepo = commentRepository;
    this.communityRepo = communityRepository;
    this.userRepo = userRepository;
    this.postRepo = postRepository;
    this.followerRepo = followerRepository;
    this.notifSvc = notificationService;
    this.feedSvc = feedService;
  }

  async create({ postId, authorId, content, parentId }) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);

      const { author_id: postAuthorId } = post;

      const author = await this.userRepo.findById(postAuthorId);

      if (post.community_id) {
        if (post.community_privacy !== 'public' && postAuthorId !== authorId) {
          //do authorization
          const isMember = await this.communityRepo.isMember(post.community_id, authorId);
  
          if (!isMember || isMember.status !== 'active') {
            throw createError("You are not allowed to comment on this community post", 403);
          }
        }
      } else if (author.privacy !== 'public' && postAuthorId !== authorId) {
        const isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(authorId, postAuthorId);
        if (!isFollow || isFollow.status !== 'active')
          throw createError("You must follow the post author to access this post", 403);
      }

      // Compute nested thread path + depth
      let depth = 0;
      let path = [];
      let parentComment = null;
      if (parentId) {
        const parent = await this.commentRepo.findById(parentId);
        if (!parent) throw createError("Parent comment not found", 404);
        if (parent.depth >= 5) throw createError("Maximum reply depth exceeded", 400);
        depth = parent.depth + 1;
        path = [...(parent.path || []), parent.id];
        parentComment = parent;
      }

      const comment = await this.commentRepo.create({
        postId,
        authorId,
        content,
        parentId,
        depth,
        path,
      });
      await this.postRepo.incrementCommentCount(postId);
      // A new comment moves the post author's Feed-impact score (comments*5).
      const { emitLeaderboardsChanged } = require('../../sockets/account.socket');
      emitLeaderboardsChanged(postAuthorId, 'feed_impact');

      const user = await this.userRepo.findById(authorId);

      await this.notifSvc.create({
        type: 'COMMENT',
        recipientId: post.author_id,
        senderId: user.id,
        resourceId: post.id,
        resourceType: 'post',
        title: 'New comment',
        message: content,
      });

      // Mention notifications: @handles in the comment text notify the mentioned
      // users (never the comment author or the post owner — the owner already
      // gets the COMMENT notification above). Handles both the plain `@user`
      // form and the composer's structured `{@}[user](id)` form.
      const mentionedIds = new Set();
      const structuredMatches = content.match(/\{@\}\[[^\]]+\]\([^)]+\)/g) || [];
      structuredMatches.forEach((m) => {
        const idMatch = m.match(/\{@\}\[[^\]]+\]\(([^)]+)\)/);
        if (idMatch && idMatch[1]) mentionedIds.add(idMatch[1]);
      });
      const mentionMatches = content.match(/@(\w+)/g) || [];
      const mentionedUsernames = [...new Set(mentionMatches.map(m => m.slice(1)))];
      for (const username of mentionedUsernames) {
        this.userRepo.findByUsername(username).then(mentioned => {
          if (mentioned && mentioned.id !== authorId && mentioned.id !== post.author_id) {
            this.notifSvc.create({
              type: 'MENTION',
              recipientId: mentioned.id,
              senderId: user.id,
              resourceId: post.id,
              resourceType: 'post',
              title: 'New mention',
              message: `${user.name} mentioned you in a comment`,
            }).catch(e => console.error(`Failed to notify mentioned user ${username}`, e));
          }
        }).catch(e => console.error(`Failed to find user ${username}`, e));
      }
      for (const id of mentionedIds) {
        if (id === authorId || id === post.author_id) continue;
        this.notifSvc.create({
          type: 'MENTION',
          recipientId: id,
          senderId: user.id,
          resourceId: post.id,
          resourceType: 'post',
          title: 'New mention',
          // The comment id rides in the message (| <id> suffix, same pattern
          // as game invites) so the app can deep-link and auto-scroll to the
          // exact comment that mentioned the user.
          message: `${user.name} mentioned you in a comment | ${comment.id}`,
        }).catch(e => console.error('Failed to notify mentioned user', e));
      }

      // Reply notification: ping the PARENT comment's author when someone
      // replies to their comment. Skipped when the reply is their own, and when
      // the parent author IS the post owner (they already got the COMMENT
      // notification above) — no duplicate pings.
      if (parentComment && parentComment.author_id !== authorId && parentComment.author_id !== postAuthorId) {
        this.notifSvc.create({
          type: 'REPLY',
          recipientId: parentComment.author_id,
          senderId: user.id,
          resourceId: post.id,
          resourceType: 'post',
          title: 'New reply',
          message: `${user.name} replied to your comment`,
        }).catch(e => console.error('Failed to notify comment reply', e));
      }

      this.feedSvc.updatePreferences({userId: authorId, categories: post.category || [], tags: post.tags || []});

      // The INSERT row has no author JOIN, so format() leaves author.name /
      // username / avatarUrl undefined — that would render a nameless, icon-only
      // comment the moment the client swaps its optimistic row for this
      // response. Merge the commenter's profile so the created comment is fully
      // populated (same shape the list endpoints return).
      const created = CommentModel.format(comment);
      if (created && user) {
        created.author = {
          id: user.id,
          name: user.name,
          username: user.username,
          avatarUrl: user.avatarUrl || null,
          isVerified: user.isVerified || false,
        };
      }
      return created;
    } catch (error) {
      throw error;
    }
  }

  async getComments({ postId, userId, parentId, limit, offset, sort }) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);
            const { author_id: authorId } = post;

      const author = await this.userRepo.findById(authorId);

      if (post.community_id) {
        if (post.community_privacy !== 'public' && userId !== authorId) {
          //do authorization
          const isMember = await this.communityRepo.isMember(post.community_id, userId);
  
          if (!isMember || isMember.status !== 'active') {
            throw createError("You are not allowed to get the comment of this community post", 403);
          }
        }
      } else if (author && author.privacy !== 'public' && userId !== authorId) {
        const isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, authorId);
        if (!isFollow || isFollow.status !== 'active')
          throw createError("You must follow the post author to access this post comment", 403);
      }

      const { rows, total } = await this.commentRepo.findByPost(postId, limit, offset, parentId, userId, sort);
      return { comments: rows.map(CommentModel.format), total };
    } catch (error) {
      throw error;
    }
  }

  // Single comment (for deep-linking a mention/reply straight to it). Returns
  // the formatted comment so the client can scroll to it (and its parent if it
  // is a nested reply).
  async getComment({ commentId }) {
    try {
      const comment = await this.commentRepo.findById(commentId);
      if (!comment) throw createError('Comment not found', 404);
      return CommentModel.format(comment);
    } catch (error) {
      throw error;
    }
  }

  async update({ commentId, userId, content }) {
    try {
      const comment = await this.commentRepo.findById(commentId);
      if (!comment) throw createError('Comment not found', 404);
      
      if (comment.author_id !== userId)
        throw createError("You are not authorized to edit this comment", 403);

      const updated = await this.commentRepo.update(commentId, content);

      const post = await this.postRepo.findById(comment.post_id);
      const user = await this.userRepo.findById(userId);

      await this.notifSvc.publishNotification({
        type: 'COMMENT',
        recipientId: post.author_id,
        senderId: user.id,
        resourceType: 'post',
        resourceId: post.id,
        title: 'New comment',
        message: content,
      });

      return CommentModel.format(updated);
    } catch (error) {
      throw error;
    }
  }

  async delete({ commentId, userId, userRole }) {
    try {
      const comment = await this.commentRepo.findById(commentId);
      if (!comment) throw createError('Comment not found', 404);

      const isOwner = comment.author_id === userId;
      const isMod = ['admin', 'moderator', 'superadmin'].includes(userRole);

      // Post owners can moderate comments left on their own post.
      let isPostAuthor = false;
      try {
        const post = await this.postRepo.findById(comment.post_id);
        isPostAuthor = !!(post && post.author_id === userId);
      } catch (e) {
        isPostAuthor = false;
      }

      if (!isOwner && !isPostAuthor && !isMod) throw createError("You are not authorized to delete this comment", 403);

      await this.commentRepo.softDelete(commentId);
      await this.postRepo.decrementCommentCount(comment.post_id);
    } catch (error) {
      throw error;
    }
  }

  async like({ commentId, userId }) {
    try {
      const comment = await this.commentRepo.findById(commentId);
      if (!comment) throw createError('Comment not found', 404);

      const alreadyLiked = await this.commentRepo.isLikedByUser(commentId, userId);
      if (alreadyLiked) return;
      await this.commentRepo.addLike(commentId, userId);
      await this.commentRepo.incrementLikeCount(commentId);
    } catch (error) {
      throw error;
    }
  }

  async unlike({ commentId, userId }) {
    try {
      const comment = await this.commentRepo.findById(commentId);
      if (!comment) throw createError('Comment not found', 404);
      
      const isLiked = await this.commentRepo.isLikedByUser(commentId, userId);
      if (!isLiked) return;

      await this.commentRepo.removeLike(commentId, userId);
      await this.commentRepo.decrementLikeCount(commentId);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = CommentService;
