export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'event' | 'achievement' | 'game_invite' | 'post' | 'community' | 'streak';
  /** Actor (sender) id — used for active-status dots on the avatar. */
  senderId?: string;
  avatar: string;
  avatarUrl?: string;
  /** Server-enriched preview image (post media / community avatar / game cover). */
  thumbnailUrl?: string;
  /** How many distinct actors this stacked notification aggregates (Instagram-style "A and N others"). */
  actorCount?: number;
  /** Display names of all stacked actors (first = sender). */
  actorNames?: string[];
  /** Community identity for community notifications (enriched server-side). */
  communityName?: string;
  communityAvatarUrl?: string;
  communityBannerUrl?: string;
  actor: string;
  text: string;
  /** Feed-style notifications may surface title/message instead of actor/text. */
  title?: string;
  message?: string;
  time: string;
  isRead: boolean;
  group: 'today' | 'yesterday' | 'earlier';
  resourceId?: string;
  resourceType?: string;
  createdAt?: string;
  payload?: Record<string, any>;
}