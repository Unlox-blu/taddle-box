import type { Post } from './post.types';
import type { User } from './user.types';
import type { Story } from './feed.types';

// ── Navigation param lists ──────────────────────────────────────
// PostDetail and UserProfile are registered in BOTH the root stack (full-screen
// opens from any tab) and the Home stack (in-tab navigation). These shared
// param types are the single source of truth — both param lists reference them
// so the two registrations can never drift apart (e.g. one gaining commentId
// and the other not).
export type PostDetailParams = {
  post: Post;
  /** Deep-link straight to this comment (mention/reply notifications). */
  commentId?: string;
  /** Reel mode: flat list of posts seeded by the caller to enable swipe-next.
   *  The reel starts at the index of `post` within this array. */
  feedItems?: Post[];
  /** Which context opened the reel — used to fetch more posts when feedItems
   *  runs out or was not provided by the caller. */
  feedContext?: 'home' | 'profile' | 'bookmarks' | 'community' | 'search';
  /** Scoped id for profile / community contexts (userId or communitySlug). */
  feedContextId?: string;
};

export type UserProfileParams = {
  user?: User;
  username?: string;
  /** openPostId deep-links a post (e.g. from a notification) into the profile. */
  /** openPost ships the full post so the deep-link opens without re-fetching. */
  openPostId?: string;
  openPost?: any;
};

export type HomeStackParamList = {
  HomeMain:       undefined;
  Notifications:  undefined;
  Comments:       { post: Post };
  PostDetail:      PostDetailParams;
  UserProfile:    UserProfileParams;
  StoryViewer:    { stories: Story[]; initialIndex: number };
  Bookmarks:      undefined;
  Leaderboards:   { initialTab?: 'Global' | 'Friends' | 'Games' | 'Feed' | 'Community' | 'Events' } | undefined;
  Settings:       undefined;
  EditProfile:    undefined;
  Terms:          undefined;
  Privacy:        undefined;
  LockScreen:     { mode?: 'app' | 'wallet'; returnScreen?: keyof HomeStackParamList; isSetup?: boolean; isDisable?: boolean };
  ChangePassword: undefined;
  ChangePhone:    undefined;
  ChangeEmail:    undefined;
  FollowRequests: undefined;
  Search:         { query?: string; tab?: 'all' | 'posts' | 'people' | 'communities' | 'events' | 'games' | 'hashtags'; scopeCommunity?: string; authorFilter?: string; source?: 'bookmarks' | 'settings' | 'notifications' | 'wallet' | 'messages'; type?: string } | undefined;
  ChatInbox:      undefined;
  Chat:           { conversationId: string; otherUserId?: string; otherUser?: any; isCommunityChat?: boolean; communityName?: string; communityAvatar?: string };
};

export type CommunityStackParamList = {
  CommunityList:   undefined;
  CommunityDetail: { communitySlug: string };
  CommunitySettings: { communitySlug: string };
  ManageRequests: { communityId: string };
  ModerationLog: { communityId: string };
  Chat: { conversationId: string; otherUserId?: string; otherUser?: any; isCommunityChat?: boolean; communityName?: string; communityAvatar?: string };
};

export type AuthStackParamList = {
  Splash:         undefined;
  Onboarding:     undefined;
  Welcome:        undefined;
  Login:          undefined;
  Register:       undefined;
  OTP:            { phone: string; accessToken?: string; refreshToken?: string };
  ForgotPassword: { initialIdentifier?: string } | undefined;
  CompleteProfile: undefined;
  Terms:          undefined;
  Privacy:        undefined;
};

export type MainTabParamList = {
  Home:      undefined;
  Community: undefined;   // handled by CommunityStackNavigator
  Events:    undefined;
  Games:     undefined;
  Profile:   undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  ForceUpdate: undefined;
  /** Full-screen post page — registered at the ROOT so it opens above the tab
      bar from any tab (feed, community, profile, notifications, tray taps). */
  PostDetail: PostDetailParams;
  /** Also at root so profile navigation from the full-screen post page works. */
  UserProfile: UserProfileParams;
  /** Also at root so hashtag taps (@#tag inside a post body) work from the
      full-screen post page and pushed profiles — the Home-stack copy still
      handles search inside the tab. */
  Search: HomeStackParamList['Search'];
  EventDetail: { event: any };
  CommunityDetail: { communitySlug: string };
  ChatInbox: undefined;
  Chat: { conversationId: string; otherUserId?: string; otherUser?: any; isCommunityChat?: boolean; communityName?: string; communityAvatar?: string };
  /** SideDrawer screens — at root so they don't activate any tab. */
  Bookmarks: undefined;
  Wallet: undefined;
  Settings: undefined;
  Leaderboards: HomeStackParamList['Leaderboards'];
  Terms: undefined;
  Privacy: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  ChangePhone: undefined;
  ChangeEmail: undefined;
  FollowRequests: undefined;
  LockScreen: HomeStackParamList['LockScreen'];
};