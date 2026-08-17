'use strict';

const { createError } = require('../../utils/error.util');
const PostModel = require('./post.model');
const { notificationService } = require('../notification/notification.container');

class PostService {
  constructor({ postRepository, communityRepository, followerRepository, bookmarkRepository, notificationService, feedService, userRepository, taskService, xpService, settingsRepository }) {
    this.postRepo = postRepository;
    this.communityRepo = communityRepository;
    this.followerRepo = followerRepository;
    this.bookmarkRepo = bookmarkRepository;
    this.userRepo = userRepository;
    this.notifSvc = notificationService;
    this.feedSvc = feedService;
    this.taskSvc = taskService;
    this.xpSvc = xpService;
    this.settingsRepo = settingsRepository;
  }  

  async createPost({userId: authorId, body: data}) {
    try {
      const { communityId } = data;

      // Validate community membership if posting to a community. The OWNER can
      // always post to their own community, even without an explicit member row.
      if (communityId) {
        const isCommunityExist = await this.communityRepo.findById(communityId);
        if (!isCommunityExist) throw createError('Community not found', 404);

        const isOwner =
          isCommunityExist.owner_id === authorId ||
          isCommunityExist.ownerId === authorId;
        if (!isOwner) {
          const isMember = await this.communityRepo.isMember(communityId, authorId);
          if (!isMember || isMember.status !== 'active')
            throw createError("Only community members can make posts", 403);
        }
      }

      const post = await this.postRepo.create({ ...data, authorId });
      
      const populatedPost = await this.postRepo.findById(post.id);

      this.feedSvc.updatePreferences({userId: authorId, categories: data.category || [], tags: data.tags || []}).catch(err => console.error('Feed pref update failed:', err));
      this.taskSvc.incrementPostCount({userId: authorId}).catch(err => console.error('Task increment failed:', err));
      this.userRepo.incrementPostCount(authorId).catch(err => console.error('User post increment failed:', err));
      if (communityId) {
        this.communityRepo.incrementPostCount(communityId).catch(err => console.error('Community post increment failed:', err));
        // A community post moves the author's Community-activity score (+8).
        const { emitLeaderboardsChanged } = require('../../sockets/notification.socket');
        emitLeaderboardsChanged(authorId, 'community_activity');
      }

      // Calculate and credit XP for creating post
      const hasText = !!data.content && data.content.trim().length > 0;
      const allMedia = data.media || [];
      const visualMedia = allMedia.filter(m => m.media_type !== "audio" && m.type !== "audio");
      const audioMedia = allMedia.filter(m => m.media_type === "audio" || m.type === "audio");
      
      const typesCount = (hasText ? 1 : 0) + (visualMedia.length > 0 ? 1 : 0) + (audioMedia.length > 0 ? 1 : 0);
      let xpReward = 2;
      if (typesCount >= 3) xpReward = 10;
      else if (typesCount === 2) xpReward = 5;

      this.xpSvc.creditXP({
        userId: authorId,
        xp: xpReward,
        transactionType: 'earned',
        sourceType: `create_post_${post.id}`
      }).catch(err => console.error('XP credit failed:', err));

      // Handle mentions — explicit ids from the composer (data.mentions) plus
      // @handles in the content, in BOTH the plain `@user` form and the
      // composer's structured `{@}[user](id)` form (which plain regexes miss).
      const content = data.content || '';
      const mentionedIds = new Set(Array.isArray(data.mentions) ? data.mentions.filter(Boolean) : []);
      const structuredMatches = content.match(/\{@\}\[[^\]]+\]\([^)]+\)/g) || [];
      structuredMatches.forEach((m) => {
        const idMatch = m.match(/\{@\}\[[^\]]+\]\(([^)]+)\)/);
        if (idMatch && idMatch[1]) mentionedIds.add(idMatch[1]);
      });
      const mentionMatches = content.match(/@(\w+)/g) || [];
      const mentionedUsernames = [...new Set(mentionMatches.map(m => m.slice(1)))];
      const mentionUsers = await Promise.all(
        mentionedUsernames.map((username) =>
          this.userRepo.findByUsername(username).catch(() => null)
        )
      );
      mentionUsers.forEach((user) => {
        if (user && user.id !== authorId) mentionedIds.add(user.id);
      });
      for (const id of mentionedIds) {
        if (id === authorId) continue;
        this.notifSvc.create({
          recipientId: id,
          senderId: authorId,
          type: 'MENTION',
          title: 'New mention',
          message: 'mentioned you in a post',
          resourceType: 'post',
          resourceId: post.id,
        }).catch(e => console.error('Failed to notify mentioned user', e));
      }

      // Fan-out: notify the author's followers that they published a post.
      this.notifyFollowersOfPost(authorId, post.id, false).catch(err =>
        console.error('Post follower notification failed:', err)
      );
      
      return PostModel.format(populatedPost);
    } catch (error) {
      throw error; 
    }
  }

  async getPost({postId, userId, viaRepostId}) {
    try {
      const post = await this.postRepo.findById(postId, userId);
      if (!post) throw createError('Post not found', 404);
      const { community_id: communityId, author_id: authorId } = post;

      if(userId === authorId){
        return PostModel.format(post);
      }

      // If requested via a wrapper repost, check authorization against the wrapper instead
      if (viaRepostId) {
        const wrapper = await this.postRepo.findById(viaRepostId, userId);
        if (wrapper && wrapper.repost_of_id === postId) {
          let wrapperAuthorized = true;
          
          if (wrapper.community_id) {
            const wCommunity = await this.communityRepo.findById(wrapper.community_id);
            if (wCommunity.privacy === 'private') {
              if (!userId) wrapperAuthorized = false;
              else {
                const wMember = await this.communityRepo.isMember(wrapper.community_id, userId);
                if (!wMember || wMember.status !== 'active') wrapperAuthorized = false;
              }
            }
          } else {
            const wAuthor = await this.userRepo.findById(wrapper.author_id);
            if (wAuthor.privacy !== 'public' && wrapper.author_id !== userId) {
              const wFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, wrapper.author_id);
              if (!wFollow || wFollow.status !== 'active') wrapperAuthorized = false;
            }
          }
          
          if (wrapperAuthorized) {
            return PostModel.format(post);
          }
        }
      }

      const author = await this.userRepo.findById(authorId)

      if (communityId) {
        const community = await this.communityRepo.findById(communityId);
        if (community.privacy === 'private') {
          if (!userId) throw createError('This is a private community', 403);

          const isMember = await this.communityRepo.isMember(communityId, userId);
          if (!isMember || isMember.status !== 'active')
            throw createError("You are not a member of this private community", 403);
        }
      }
      else if(author.privacy !== 'public') {
        const isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, authorId)
        if(!isFollow || isFollow.status !== 'active')
          throw createError("You don't have permission to view posts from this private account", 403);
      }
      return PostModel.format(post);
    } catch (error) {
      throw error;
    }
  }

  async getUserPosts({authorId, userId, limit, offset, type = 'all'}) {
    try {
      if (userId === authorId) {
        const { rows, total } = await this.postRepo.findManyByUser(userId, limit, offset, userId, type);
        return { posts: rows.map(PostModel.format), total };
      }
      const author = await this.userRepo.findById(authorId)
      if(!author)
        throw createError("Author not found", 404)
      
      let isFollow = null;
      if(author.privacy !== 'public') {
        isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, authorId)
        if(!isFollow || isFollow.status !== 'active')
          throw createError("You don't have permission to view posts from this private account", 403);
      }

      const { rows, total } = await this.postRepo.findManyByUser(authorId, limit, offset, userId, type);

      // Approved followers of a PUBLIC account also see its followers-only posts;
      // everyone else only sees the public ones (private-account authors were
      // already gated above).
      const isApprovedFollower = (isFollow?.status === 'active') || userId === authorId;
      const posts = rows.filter(
        (ele) =>
          ele.community_privacy !== 'private' &&
          (ele.visibility === 'public' ||
            (ele.visibility === 'followers' && isApprovedFollower))
      );
      return { posts: posts.map(PostModel.format), total };
    } catch (error) {
      throw error;
    }
  }

  async updatePost({postId, userId: authorId, body: data}) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);
      if (post.author_id !== authorId) throw createError('Not authorized to edit this post', 403);
      const updated = await this.postRepo.update(postId, data);
      
      this.feedSvc.updatePreferences({userId: authorId, categories: data.category || [], tags: data.tags || []})
      return PostModel.format(updated);
    } catch (error) {
      throw error;
    }
  }

  async deletePost({postId, userId, userRole}) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);
      const isOwner = post.author_id === userId;
      const isMod = ['admin', 'moderator', 'superadmin'].includes(userRole);
      if (!isOwner && !isMod) {
        // Community owner/admins can delete posts inside their community.
        if (post.community_id) {
          const community = await this.communityRepo.findById(post.community_id);
          const member = await this.communityRepo.getMember(post.community_id, userId);
          const isCommunityOwner = community?.ownerId === userId;
          const isCommunityAdmin = member?.role === 'admin' || member?.role === 'moderator';
          if (!isCommunityOwner && !isCommunityAdmin)
            throw createError('Not authorized to delete this post', 403);
        } else {
          throw createError('Not authorized to delete this post', 403);
        }
      }
      // NOTE: repost rows intentionally KEEP their repost_of_id link to the
      // soft-deleted original. Detaching it (setRepostNull) turns every repost
      // of a deleted post into a bare, content-less card; keeping the link lets
      // the app resolve the original, get a 404, and show "Original post is
      // unavailable" — the expected UX. softDelete hides the row from all
      // queries (findById filters deleted_at IS NULL) so nothing leaks.
      await this.postRepo.softDelete(postId);
      this.userRepo.decrementPostCount(post.author_id).catch(err => console.error('User post decrement failed:', err));
      if (post.community_id) {
        this.communityRepo.decrementPostCount(post.community_id).catch(err => console.error('Community post decrement failed:', err));
        // A moderator/admin deleting someone else's post inside the community
        // is a moderation action — record it (author self-deletes are not).
        if (!isOwner) {
          this.communityRepo.logModeration({
            communityId: post.community_id,
            actorId: userId,
            action: 'delete_post',
            targetUserId: post.author_id,
            postId,
          }).catch(err => console.error('Moderation log write failed:', err));
        }
      }

    } catch (error) {
      throw error;
    }
  }

  // Record a post impression (thread opened) as a UNIQUE viewer. Fire-and-
  // forget friendly — never throws on a missing post so a stale deep link
  // can't 500 the thread screen.
  async recordView({postId, userId}) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) return;
      // Only the FIRST view by this user bumps the counter (post_views has a
      // partial unique index on (post_id, user_id)); re-opens are no-ops so
      // views_count measures unique viewers, not raw impressions.
      const isNewView = await this.postRepo.recordView(postId, userId);
      if (isNewView) await this.postRepo.incrementViewCount(postId);
      // A fresh unique view moves the author's Feed-impact score — trigger a
      // silent leaderboard refresh so the Feed tab stays live.
      if (isNewView) {
        const { emitLeaderboardsChanged } = require('../../sockets/notification.socket');
        emitLeaderboardsChanged(post.author_id, 'feed_impact');
      }
    } catch (error) {
      console.error('Failed to record post view:', error);
    }
  }

  async likePost({postId, userId}) {
    try {
      const post = await this.postRepo.findById(postId)
      if(!post) throw createError("Post not found", 404)

      const authorId = post.author_id  
      const author = await this.userRepo.findById(authorId)
      if(authorId !== userId && author.privacy !== 'public') {
        const isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, authorId)
        if(!isFollow || isFollow.status !== 'active')
          throw createError("You don't have permission to like posts", 403);
      }  

      const alreadyLiked = await this.postRepo.isLikedByUser(postId, userId);
      if (alreadyLiked) return;
      
      await this.postRepo.addLike(postId, userId);
      await this.postRepo.incrementLikeCount(postId);
      // A like moves the author's Feed-impact score (likes*3).
      const { emitLeaderboardsChanged } = require('../../sockets/notification.socket');
      emitLeaderboardsChanged(post.author_id, 'feed_impact');
      const user = await this.userRepo.findById(userId)
      const jobdata = { 
        postId: post.id, 
        recipientId: post.author_id, 
        emiterName: user.name, 
        emiterUsername: user.username, 
        emiterId: user.id
      }
      
      await notificationService.publishNotification({
        type: 'POST_LIKE',
        recipientId: post.author_id,
        // publishNotification reads senderId/resourceType/resourceId — without
        // them the batched row lands with NULL sender + resource, so tapping
        // the notification has nothing to open.
        senderId: user.id,
        resourceType: 'post',
        resourceId: post.id,
        title: 'Post liked',
        message: `${user.name} liked your post`,
      })

      const categories = Array.isArray(post.category) ? post.category : (post.category ? [post.category] : []);
      const tags = Array.isArray(post.tags) ? post.tags : (post.tags ? [post.tags] : []);
      this.feedSvc.updatePreferences({userId, categories, tags}).catch(e => console.error('Failed to update feed prefs on like:', e));
    } catch (error) {
      throw error;
    }
  }

  async unlikePost({postId, userId}) {
    try {
      const isLiked = await this.postRepo.isLikedByUser(postId, userId);
      if (!isLiked) return;
      await this.postRepo.removeLike(postId, userId);
      await this.postRepo.decrementLikeCount(postId);
    } catch (error) {
      throw error;
    }
  }

  async sharePost({userId, postId}) {
    try {
      const post = await this.postRepo.findById(postId)
      if(!post) throw createError("Post not found", 404)

      const authorId = post.author_id  
      const author = await this.userRepo.findById(authorId)
      if(author.privacy !== 'public') {
        const isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, authorId)
        if(!isFollow || isFollow.status !== 'active')
          throw createError("You don't have permission to view posts from this private account", 403);
      }

      await this.postRepo.incrementShareCount(postId);
      this.taskSvc.incrementShareCount(userId, 1)
    } catch (error) {
      throw error;
    }
  }

  // Twitter/Reddit-style repost: re-share a post verbatim, or attach your own
  // thoughts (quote repost). A repost is a NEW post row that references the
  // original via repost_of_id; the original's share counter is bumped too.
  // Quote reposts support hashtags + mentions just like regular posts.
  async repostPost({userId, postId, content, tags, mentions, communityId}) {
    try {
      let original = await this.postRepo.findById(postId);
      if (!original) throw createError('Post not found', 404);

      // Resolve repost-of-repost chains: if the target is itself a repost,
      // anchor the new repost to the ROOT original so the embedded preview
      // shows real content/media instead of another empty repost row.
      const seen = new Set();
      while (original.repost_of_id && !seen.has(original.repost_of_id)) {
        seen.add(original.repost_of_id);
        const root = await this.postRepo.findById(original.repost_of_id);
        if (!root) break;
        original = root;
      }
      // If the walk ended with repost_of_id still set, the next hop resolved
      // to a soft-deleted/nonexistent post — the root content is gone. Creating
      // a new repost here would produce a card that only ever shows "Original
      // post is unavailable", so refuse (the client hides the button too).
      if (original.repost_of_id) {
        throw createError('The original post is no longer available to repost', 410);
      }
      const targetId = original.id;

      // Self-reposts are allowed — reposting your own post (e.g. cross-posting
      // it into a community) is a legitimate share action, and the multiple-
      // repost model keeps any count inflation bounded.

      // Don't repost a post that was itself deleted/hidden.
      const author = await this.userRepo.findById(original.author_id);
      // Private accounts gate reposts to approved followers — except the
      // author themselves, who can always repost their own post (cross-post).
      if (author && author.privacy !== 'public' && original.author_id !== userId) {
        const isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, original.author_id);
        if (!isFollow || isFollow.status !== 'active')
          throw createError("You don't have permission to repost posts from this private account", 403);
      }

      // Respect the REPOSTING user's account privacy — private accounts repost
      // to their followers only, mirroring the create-post audience rule.
      const reposter = await this.userRepo.findById(userId);
      const repostVisibility = reposter && reposter.privacy !== 'public'
        ? 'followers'
        : 'public';

      // Optional destination community — same rules as a normal post: the
      // owner always can, otherwise the reposter must be an active member.
      if (communityId) {
        const community = await this.communityRepo.findById(communityId);
        if (!community) throw createError('Community not found', 404);
        const isOwner = community.owner_id === userId || community.ownerId === userId;
        if (!isOwner) {
          const isMember = await this.communityRepo.isMember(communityId, userId);
          if (!isMember || isMember.status !== 'active')
            throw createError("Only community members can repost here", 403);
        }
      }

      // MULTIPLE-REPOST semantics: every repost action creates a NEW repost
      // row. The repost button exists purely to repost again (each repost
      // picks ONE audience) — there is no "edit my repost" flow; changing or
      // removing a repost is done from the profile's Reposts tab. Each new
      // repost also bumps the original's share count, so N reposts = N
      // shares (the client's optimistic count mirrors this).

      // Respect the ORIGINAL author's "Allow Reposting" toggle — when it's
      // OFF, no NEW reposts of their posts can be created. Users who already
      // reposted can still manage their existing repost (quote / move / remove)
      // since that path returned above.
      const authorSettings = await this.settingsRepo.findByUserId(original.author_id);
      if (authorSettings && authorSettings.allowReposts === false) {
        throw createError('This user has disabled reposting on their posts', 403);
      }

      // Community-level "Allow Reposting" toggle — when the ORIGINAL post was
      // published in a community whose owner turned reposting OFF, no NEW
      // reposts of it can be created, regardless of who reposts or where.
      if (original.community_id) {
        const community = await this.communityRepo.findById(original.community_id);
        if (community && community.allowReposts === false) {
          throw createError('This community has disabled reposting on its posts', 403);
        }
      }

      const contentText = (content || '').trim();
      // Hashtags: prefer the client's parsed list, else extract from text.
      let postTags = Array.isArray(tags) ? tags.map(t => String(t).replace(/^#/, '').toLowerCase()) : [];
      if (postTags.length === 0 && contentText) {
        postTags = Array.from(contentText.matchAll(/(?:^|\s)(#[a-z0-9_]+)/gi)).map(m => m[1].replace('#', '').toLowerCase());
      }

      const post = await this.postRepo.create({
        authorId: userId,
        repostOfId: targetId,
        communityId: communityId || null,
        title: null,
        content: contentText || null,
        tags: postTags,
        visibility: communityId ? 'community_only' : repostVisibility,
        status: 'published',
        media: [],
        // Carry the ORIGINAL's place onto the repost row so every read path
        // (feed, detail, profile, bookmarks, search) shows the location tag
        // in the rolling text without needing to resolve the original.
        location: original.latitude != null && original.longitude != null
          ? { lat: original.latitude, lon: original.longitude, place: original.place || undefined }
          : undefined,
      });

      // Mention notifications: explicit ids from the composer + @handles in text.
      const mentionedIds = new Set(Array.isArray(mentions) ? mentions.filter(Boolean) : []);
      const mentionMatches = contentText.match(/@(\w+)/g) || [];
      const mentionedUsernames = [...new Set(mentionMatches.map(m => m.slice(1)))];
      const mentionUsers = await Promise.all(
        mentionedUsernames.map((username) =>
          this.userRepo.findByUsername(username).catch(() => null)
        )
      );
      mentionUsers.forEach((user) => {
        if (user && user.id !== userId) mentionedIds.add(user.id);
      });
      for (const id of mentionedIds) {
        this.notifSvc.create({
          recipientId: id,
          senderId: userId,
          type: 'MENTION',
          title: 'New mention',
          message: `mentioned you in a post`,
          resourceType: 'post',
          resourceId: post.id,
        }).catch(e => console.error(`Failed to notify mentioned user`, e));
      }

      const populatedPost = await this.postRepo.findById(post.id, userId);

      this.postRepo.incrementShareCount(targetId).catch(err => console.error('Repost share count failed:', err));
      this.taskSvc.incrementShareCount(userId, 1).catch(err => console.error('Repost task increment failed:', err));
      this.userRepo.incrementPostCount(userId).catch(err => console.error('User post increment failed:', err));

      // Fan-out: notify the reposter's followers that they shared something.
      this.notifyFollowersOfPost(userId, post.id, true).catch(err =>
        console.error('Repost follower notification failed:', err)
      );

      return PostModel.format(populatedPost);
    } catch (error) {
      throw error;
    }
  }

  // Remove the repost the current user created for a post (repost toggle off).
  // Deletes the repost row and unwinds the counters the repost bumped.
  async unrepostPost({userId, postId}) {
    try {
      const repost = await this.postRepo.findMyRepost(postId, userId);
      if (!repost) return { message: 'No repost found to remove' };

      await this.postRepo.softDelete(repost.id);
      this.postRepo.decrementShareCount(postId).catch(err => console.error('Unrepost share count failed:', err));
      this.userRepo.decrementPostCount(userId).catch(err => console.error('User post decrement failed:', err));

      return { message: 'Repost removed' };
    } catch (error) {
      throw error;
    }
  }

  // NEW_POST fan-out: everyone who follows `authorId` gets a "X posted /
  // reposted" notification — capped, batched, and preference-aware so huge
  // accounts don't hammer the DB with one row-insert per follower.
  //  - Cap: at most 1000 most-recent followers are notified per post.
  //  - Prefs: followers who disabled the new_post category are skipped.
  //  - Batch: the rows land in ONE multi-row INSERT (see notifSvc.createMany).
  async notifyFollowersOfPost(authorId, postId, isRepost = false) {
    const followerIds = await this.followerRepo.getActiveFollowerIds(authorId, {
      limit: 1000,
      prefColumn: 'new_post',
    });
    if (!followerIds || followerIds.length === 0) return;
    const actor = await this.userRepo.findById(authorId);
    const actorName = actor ? actor.name : 'Someone';
    const title = isRepost ? 'New repost' : 'New post';
    const message = isRepost
      ? `${actorName} reposted a post`
      : `${actorName} posted a new post`;
    await this.notifSvc.createMany(
      followerIds.map((recipientId) => ({
        recipientId,
        senderId: authorId,
        type: 'NEW_POST',
        title,
        message,
        resourceType: 'post',
        resourceId: postId,
      }))
    );
  }

  async bookmarkPost({userId, postId}) {
    try {
      const post = await this.postRepo.findById(postId)
      if(!post) throw createError('Post not found', 404)
      
      const authorId = post.author_id  
      const author = await this.userRepo.findById(authorId)
      if(authorId !== userId && author.privacy !== 'public') {
        const isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, authorId)
        if(!isFollow || isFollow.status !== 'active')
          throw createError("You don't have permission to bookmark posts of this private account", 403);
      }

      const isBookmarked = await this.bookmarkRepo.findByUserIdAndPostId(userId, postId)
      if(isBookmarked)
        throw createError("Post already bookmarked", 409)

      await this.bookmarkRepo.create(userId, postId)
    } catch (error) {
      throw error
    }
  }

  async removebookmarkPost({userId, postId}) {
    try {
      const isBookmarked = await this.bookmarkRepo.findByUserIdAndPostId(userId, postId)
      if(!isBookmarked) throw createError('Post alreadey not bookmarked', 409)
      
      await this.bookmarkRepo.hardDelete(userId, postId)
    } catch (error) {
      throw error
    }
  }

  async forceDeletePost({userRole, postId}) {
    try {
      if (userRole !== 'superadmin' || userRole !== 'admin')
        throw createError('Not authorized to delete this post', 403);

      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);
      await this.postRepo.hardDelete(postId);
      this.userRepo.decrementPostCount(post.author_id).catch(err => console.error('User post decrement failed:', err));
      if (post.community_id) {
        this.communityRepo.decrementPostCount(post.community_id).catch(err => console.error('Community post decrement failed:', err));
      }
    } catch (error) {
      throw error;
    }
  }

  async findPostByCommunity({communityId, limit, offset, userId}) {
    try {
      const { rows, total } = await this.postRepo.findManyByCommunity(communityId, limit, offset, userId);

      return { rows, total }
    } catch (error) {
      throw error
    }
  }

  // Paginated likers with the viewer's follow state on each user.
  async getLikers({postId, userId, limit, offset}) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);

      // Privacy gate: likers of a private account's post are only visible to
      // the author and their active followers — same rule as bookmarking.
      const author = await this.userRepo.findById(post.author_id);
      if (post.author_id !== userId && author?.privacy !== 'public') {
        const isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, post.author_id);
        if (!isFollow || isFollow.status !== 'active')
          throw createError("You don't have permission to view likes on this post", 403);
      }

      const { rows, total } = await this.postRepo.findLikers(postId, userId, limit, offset);
      const likers = rows.map((row) => ({
        id: row.id,
        name: row.name,
        username: row.username,
        avatarUrl: row.avatar_url,
        privacy: row.privacy || 'public',
        isFollowing: row.is_following || false,
        isFollower: row.is_follower || false,
        isMutual: (row.is_following && row.is_follower) || false,
        // Pending follow request from the viewer (private accounts only).
        followRequested: row.follow_status === 'pending',
      }));
      return { likers, total };
    } catch (error) {
      throw error;
    }
  }

  // Paginated list of users who reposted a post — mirrors getLikers (same
  // privacy gate + response shape) so the app can reuse the users-list modal.
  async getReposters({postId, userId, limit, offset}) {
    try {
      const post = await this.postRepo.findById(postId);
      if (!post) throw createError('Post not found', 404);

      // Privacy gate: reposters of a private account's post are only visible
      // to the author and their active followers — same rule as likes.
      const author = await this.userRepo.findById(post.author_id);
      if (post.author_id !== userId && author?.privacy !== 'public') {
        const isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, post.author_id);
        if (!isFollow || isFollow.status !== 'active')
          throw createError("You don't have permission to view reposts on this post", 403);
      }

      const { rows, total } = await this.postRepo.findReposters(postId, userId, limit, offset);
      const reposters = rows.map((row) => ({
        id: row.id,
        name: row.name,
        username: row.username,
        avatarUrl: row.avatar_url,
        privacy: row.privacy || 'public',
        isFollowing: row.is_following || false,
        isFollower: row.is_follower || false,
        isMutual: (row.is_following && row.is_follower) || false,
        // Pending follow request from the viewer (private accounts only).
        followRequested: row.follow_status === 'pending',
      }));
      return { reposters, total };
    } catch (error) {
      throw error;
    }
  }

  // Paginated voters of ONE poll option, with the viewer's follow state on
  // each voter (same response shape as getLikers so the app reuses the
  // users-list modal).
  async getPollVoters({ postId, optionIndex, userId, limit, offset }) {
    try {
      const post = await this.postRepo.findPollByPostId(postId);
      if (!post) throw createError('Post not found', 404);
      if (!post.poll_data || !Array.isArray(post.poll_data.options)) {
        throw createError('This post has no poll', 400);
      }
      if (!post.poll_data.options[optionIndex]) {
        throw createError('Invalid poll option', 400);
      }

      // Privacy gate mirrors getLikers: voters of a private account's poll
      // are only visible to the author and their active followers.
      const author = await this.userRepo.findById(post.author_id);
      if (post.author_id !== userId && author?.privacy !== 'public') {
        const isFollow = await this.followerRepo.findByFollowerIdAndFollowingId(userId, post.author_id);
        if (!isFollow || isFollow.status !== 'active')
          throw createError("You don't have permission to view voters on this poll", 403);
      }

      const { rows, total } = await this.postRepo.findPollVoters(postId, optionIndex, userId, limit, offset);
      const voters = rows.map((row) => ({
        id: row.id,
        name: row.name,
        username: row.username,
        avatarUrl: row.avatar_url,
        privacy: row.privacy || 'public',
        isFollowing: row.is_following || false,
        isFollower: row.is_follower || false,
        isMutual: (row.is_following && row.is_follower) || false,
        followRequested: row.follow_status === 'pending',
      }));
      return { voters, total };
    } catch (error) {
      throw error;
    }
  }

  async castPollVote({ userId, postId, optionIndex }) {
    try {
      const post = await this.postRepo.findPollByPostId(postId);
      if (!post) throw createError('Post not found', 404);
      if (!post.poll_data || !Array.isArray(post.poll_data.options)) {
        throw createError('This post has no poll', 400);
      }
      if (!post.poll_data.options[optionIndex]) {
        throw createError('Invalid poll option', 400);
      }
      if (post.poll_data.closed) {
        throw createError('This poll is closed', 400);
      }
      try {
        const result = await this.postRepo.castPollVote({ postId, userId, optionIndex });
        return result;
      } catch (error) {
        // The author closed the poll between our pre-check and the row lock
        // inside the transaction — surface it as a normal 400, not a 500.
        if (error?.message === 'This poll is closed') {
          throw createError('This poll is closed', 400);
        }
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }

  async closePoll({ userId, postId }) {
    try {
      const post = await this.postRepo.findPollByPostId(postId);
      if (!post) throw createError('Post not found', 404);
      if (String(post.author_id) !== String(userId)) {
        throw createError('Only the poll author can close this poll', 403);
      }
      if (!post.poll_data) {
        throw createError('This post has no poll', 400);
      }
      const updated = await this.postRepo.closePoll(postId);
      return { pollData: updated?.poll_data || post.poll_data, closed: true };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = PostService;
