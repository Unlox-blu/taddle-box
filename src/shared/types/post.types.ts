import type { User } from './user.types';

export interface Post {
  id: string;
  content_id?: string;
  author: User;
  community: string;
  content: string;
  title?: string;
  image?: string;
  mediaUri?: string;
  mediaAspectRatio?: '1:1' | '16:9';
  /** Backend-enriched media array. */
  media?: Array<{
    media_id: string;
    media_type: 'image' | 'video' | 'audio';
    media_url: string;
    preview_url?: string | null;
    width?: number;
    height?: number;
    duration_seconds?: number;
    file_size_bytes?: number;
    mime_type?: string;
    has_audio?: boolean;
  }>;
  hashtags: string[];
  likes: number;
  comments: number;
  shares: number;
  xpEarned: number;
  createdAt: string;
  isLiked: boolean;
  isSaved?: boolean;
  isXpClaimed?: boolean;
  /** Server-computed post-view XP reward (backend SSOT). */
  xpReward?: number;
  /** Whether the current user already reposted this post. */
  repostedByMe?: boolean;
  repostOfId?: string | null;
  /** Optional place tag captured at creation — shown in the card's rolling text. */
  location?: { lat: number; lon: number; place?: string } | null;
  /** Poll attached to the post: question + options with their vote tallies. */
  pollData?: {
    question: string;
    options: { text: string; votes: number }[];
    totalVotes?: number;
    /** Author closed the poll — no further votes are accepted. */
    closed?: boolean;
    closedAt?: string;
  } | null;
  /** Index of the poll option the current user voted for (null = not voted). */
  myPollVote?: number | null;
  type: 'text' | 'image' | 'video' | 'poll';
}