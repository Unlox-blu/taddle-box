-- 013_create_all_indexes.sql

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (LOWER(email))    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_google   ON users (google_id)       WHERE google_id IS NOT NULL;

-- Followers
CREATE INDEX IF NOT EXISTS idx_followers_follower  ON followers (follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following ON followers (following_id);

-- Communities
CREATE INDEX IF NOT EXISTS idx_communities_slug   ON communities (slug)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_communities_owner  ON communities (owner_id) WHERE deleted_at IS NULL;

-- Community Members
CREATE INDEX IF NOT EXISTS idx_cm_user ON community_members (user_id);

-- Posts
CREATE INDEX IF NOT EXISTS idx_posts_author    ON posts (author_id)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_community ON posts (community_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts (published_at DESC) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_tags      ON posts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_posts_category  ON posts USING GIN (category);

-- Post Likes
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes (user_id);

-- Comments
CREATE INDEX IF NOT EXISTS idx_comments_post   ON comments (post_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_path   ON comments USING GIN (path);

-- Events
CREATE INDEX IF NOT EXISTS idx_events_organizer  ON events (organizer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_community  ON events (community_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events (start_time)   WHERE status IN ('upcoming','ongoing');

-- Wallets & Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_wallet     ON transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_rzp_order  ON transactions (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications (recipient_id, is_read, created_at DESC);

-- Media
CREATE INDEX IF NOT EXISTS idx_media_uploader ON media (uploader_id) WHERE deleted_at IS NULL;

-- Post Interactions
CREATE INDEX IF NOT EXISTS idx_interactions_user ON post_interactions (user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_post ON post_interactions (post_id);
