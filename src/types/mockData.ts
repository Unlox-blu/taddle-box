import type {
  User, Post, Story, Community, Event, Game,
  Transaction, Badge, LeaderboardEntry, OnboardingSlide,
  Notification, Comment,
} from '../types';

export const CURRENT_USER: User = {
  id: 'u1',
  name: 'Arjun Kumar',
  handle: '@arjun_builds',
  avatar: '🧑‍💻',
  level: 12,
  xp: 1240,
  xpToNext: 1500,
  rank: 'Pioneer',
  followers: 12400,
  following: 892,
  posts: 248,
  bio: 'CS @ IIT Delhi · Building cool stuff · Chess ♟️ enthusiast',
  college: 'IIT Delhi',
  badges: [
    { id: 'b1', name: 'Tournament\nWinner', emoji: '🏆', color: 'gold' },
    { id: 'b2', name: 'XP Pioneer',        emoji: '⚡', color: 'purple' },
    { id: 'b3', name: 'Game Shark',         emoji: '🎮', color: 'cyan' },
    { id: 'b4', name: '7-Day Streak',       emoji: '🔥', color: 'green' },
    { id: 'b5', name: 'Event Hero',         emoji: '🚀', color: 'gold' },
    { id: 'b6', name: 'Level 20',           emoji: '🌟', color: 'locked' },
  ],
};

export const STORIES: Story[] = [
  { id: 's0', user: 'Your Story', avatar: '+',     seen: false, isOwn: true },
  { id: 's1', user: 'Priya_Dev',  avatar: '🎮',    seen: false },
  { id: 's2', user: 'CodeKing',   avatar: '🚀',    seen: false },
  { id: 's3', user: 'Champion',   avatar: '🏆',    seen: false },
  { id: 's4', user: 'DesignHub',  avatar: '🎨',    seen: true },
  { id: 's5', user: 'StudyGrp',   avatar: '📚',    seen: true },
  { id: 's6', user: 'HackTeam',   avatar: '⚡',    seen: true },
];

export const POSTS: Post[] = [
  {
    id: 'p1',
    author: { ...CURRENT_USER, name: 'Priya_Dev', handle: '@priya_dev', avatar: '🎮' },
    community: 'r/GameDev',
    content: 'Just built my first multiplayer game using Unity! 🎮 The lag compensation algorithm was a nightmare but finally cracked it. DM if anyone wants to collab on the next hackathon!',
    hashtags: ['#GameDev', '#Unity3D', '#Hackathon'],
    likes: 248, comments: 42, shares: 18, xpEarned: 25,
    createdAt: '2h ago', isLiked: true, isSaved: false, type: 'text',
  },
  {
    id: 'p2',
    author: { ...CURRENT_USER, name: 'Champion_Raj', handle: '@champion_raj', avatar: '🏆' },
    community: 'r/Chess',
    content: 'Won the weekly chess tournament! 🏆 ELO now at 1842. Who wants to challenge me? Accepting all challengers this weekend.',
    hashtags: ['#Chess', '#Tournament', '#ELO'],
    likes: 512, comments: 89, shares: 34, xpEarned: 50,
    createdAt: '5h ago', isLiked: false, isSaved: true, type: 'image',
    image: '♟️',
  },
  {
    id: 'p3',
    author: { ...CURRENT_USER, name: 'Sana_Codes', handle: '@sana_codes', avatar: '💡' },
    community: 'r/TechBuilders',
    content: "Finally cracked the DSA grind! 200+ LeetCode problems in 60 days 🔥 Here's my study plan for anyone struggling with placement prep.",
    hashtags: ['#DSA', '#Placement', '#LeetCode'],
    likes: 934, comments: 156, shares: 278, xpEarned: 75,
    createdAt: '8h ago', isLiked: false, isSaved: false, type: 'text',
  },
];

export const COMMUNITIES: Community[] = [
  {
    id: 'c1', name: 'TechBuilders India',
    description: 'The largest dev community for Indian college students — hackathons, projects & networking.',
    banner: '🚀', avatar: '⚡', members: 24500,
    isJoined: false, isPrivate: false, category: 'Tech',
  },
  {
    id: 'c2', name: 'Campus Life',
    description: 'Memes, events, gossip, and everything campus life has to offer!',
    banner: '🌿', avatar: '🎓', members: 18200,
    isJoined: true, isPrivate: false, category: 'Lifestyle',
  },
  {
    id: 'c3', name: 'GameZone Hub',
    description: 'For gaming enthusiasts — find opponents, share clips, compete in tournaments.',
    banner: '🎮', avatar: '🕹️', members: 41800,
    isJoined: false, isPrivate: false, category: 'Gaming',
  },
  {
    id: 'c4', name: 'Startup Founders',
    description: 'Build in public. Share your journey. Find co-founders and early users.',
    banner: '💡', avatar: '🦄', members: 9800,
    isJoined: true, isPrivate: false, category: 'Startup',
  },
];

export const LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, user: 'Champion_Raj',  avatar: '🏆', xp: 4820 },
  { rank: 2, user: 'Priya_Dev',     avatar: '🚀', xp: 3640 },
  { rank: 3, user: 'Arjun Kumar',   avatar: '🎯', xp: 2980 },
  { rank: 4, user: 'Sana_Codes',    avatar: '🎮', xp: 2410 },
  { rank: 5, user: 'GameMaster77',  avatar: '⚡', xp: 1990 },
];

export const EVENTS: Event[] = [
  {
    id: 'e1', title: 'HackTaddle 2025 — 36 Hour Build Sprint',
    type: 'hackathon', banner: '🚀', date: 'Jun 14–15, 2025',
    location: 'Online', xpReward: 500, cashPrize: 50000,
    registrations: 1240, isLive: true, isFeatured: true, isRegistered: false,
  },
  {
    id: 'e2', title: 'AI/ML Workshop — Beginner Friendly',
    type: 'workshop', banner: '🎯', date: 'Jun 20, 2025', time: '2:00 PM',
    location: 'Online', xpReward: 100,
    registrations: 380, isLive: false, isFeatured: false, isRegistered: true,
  },
  {
    id: 'e3', title: 'Bangalore Student Dev Meetup',
    type: 'meetup', banner: '🌐', date: 'Jun 22, 2025',
    location: 'Koramangala, Bangalore', xpReward: 200,
    registrations: 125, isLive: false, isFeatured: false, isRegistered: false,
  },
  {
    id: 'e4', title: 'Startup Pitching Masterclass',
    type: 'webinar', banner: '🎤', date: 'Jun 25, 2025', time: '5:00 PM',
    location: 'Online', xpReward: 150,
    registrations: 430, isLive: false, isFeatured: false, isRegistered: false,
  },
  {
    id: 'e5', title: 'Chess Championship — Monthly Cup',
    type: 'competition', banner: '♟️', date: 'Jun 28, 2025',
    location: 'Online', xpReward: 300, cashPrize: 5000,
    registrations: 224, isLive: false, isFeatured: false, isRegistered: false,
  },
];

export const GAMES: Game[] = [
  { id: 'g1', name: 'Chess',         emoji: '♟️', gradient: ['#1a1a2e', '#16213e'], playersOnline: 1200, maxXp: 150, isHot: false },
  { id: 'g2', name: 'Ludo',          emoji: '🎲', gradient: ['#1a0a2e', '#2e0a1a'], playersOnline: 3800, maxXp: 80,  isHot: true  },
  { id: 'g3', name: 'Block Blaster', emoji: '💥', gradient: ['#0a1a0a', '#0a2e1a'], playersOnline: 892,  maxXp: 60,  isHot: false },
  { id: 'g4', name: 'Candy Connect', emoji: '🍬', gradient: ['#2e0a1a', '#2e1a0a'], playersOnline: 2100, maxXp: 50,  isHot: false },
];

export const TRANSACTIONS: Transaction[] = [
  { id: 't1', title: 'Chess Tournament Win',         date: 'Today · 3:24 PM',      amount: 250,  currency: 'INR', type: 'earn'    },
  { id: 't2', title: 'XP Converted to Cash',         date: 'Yesterday · 11:00 AM', amount: 100,  currency: 'INR', type: 'convert' },
  { id: 't3', title: 'Daily Reward Claimed',          date: 'Jun 11 · 8:00 AM',     amount: 250,  currency: 'XP',  type: 'earn'    },
  { id: 't4', title: 'Weekly Leaderboard Bonus',      date: 'Jun 10 · 12:00 AM',    amount: 500,  currency: 'XP',  type: 'earn'    },
  { id: 't5', title: 'Withdrawal to UPI',             date: 'Jun 8 · 4:10 PM',      amount: -500, currency: 'INR', type: 'withdraw'},
  { id: 't6', title: 'Event Registration Fee',        date: 'Jun 7 · 9:15 AM',      amount: 0,    currency: 'INR', type: 'spend'   },
];

export const NOTIFICATIONS: Notification[] = [
  { id: 'n1', type: 'like',        avatar: '🎮', actor: 'Priya_Dev',       text: 'liked your post about chess strategy',                               time: '2 min ago',            isRead: false, group: 'today'     },
  { id: 'n2', type: 'comment',     avatar: '🏆', actor: 'Champion_Raj',    text: 'commented: "Great explanation, would love to connect!"',              time: '15 min ago',           isRead: false, group: 'today'     },
  { id: 'n3', type: 'follow',      avatar: '💡', actor: 'Sana_Codes',      text: 'started following you',                                              time: '1h ago',               isRead: false, group: 'today'     },
  { id: 'n4', type: 'event',       avatar: '🚀', actor: 'HackTaddle 2025', text: 'is now live! Only 48 hours left to register.',                       time: '3h ago',               isRead: true,  group: 'today'     },
  { id: 'n5', type: 'achievement', avatar: '🔥', actor: 'TADDLEBOX',       text: "You've unlocked the 7-Day Streak badge! Keep it going!",             time: '5h ago',               isRead: true,  group: 'today'     },
  { id: 'n6', type: 'mention',     avatar: '⚡', actor: 'GameMaster77',    text: 'mentioned you: "@arjun_builds you\'ve got to try this game!"',       time: 'Yesterday · 9:30 PM',  isRead: true,  group: 'yesterday' },
  { id: 'n7', type: 'like',        avatar: '🌟', actor: 'StarCoder99',     text: 'and 14 others liked your DSA post',                                  time: 'Yesterday · 2:00 PM',  isRead: true,  group: 'yesterday' },
  { id: 'n8', type: 'comment',     avatar: '🎨', actor: 'DesignHub',       text: 'replied to your comment: "Totally agree with your approach!"',        time: 'Yesterday · 11:00 AM', isRead: true,  group: 'yesterday' },
  { id: 'n9', type: 'follow',      avatar: '📚', actor: 'StudyCircle_23',  text: 'started following you',                                              time: '2 days ago',           isRead: true,  group: 'earlier'   },
  { id: 'n10', type: 'event',      avatar: '♟️', actor: 'Chess Championship', text: 'Registration closes in 3 days. You haven\'t registered yet!',     time: '3 days ago',           isRead: true,  group: 'earlier'   },
];

export const COMMENTS: Comment[] = [
  // Post p1 — GameDev post
  { id: 'cm1', postId: 'p1', author: { id: 'u2', name: 'Champion_Raj',  handle: '@champion_raj',  avatar: '🏆' }, text: "Incredible work! The lag compensation must've been brutal. Did you use client-side prediction or server reconciliation?", likes: 18, isLiked: false, createdAt: '30m ago', replies: 3 },
  { id: 'cm2', postId: 'p1', author: { id: 'u3', name: 'Sana_Codes',    handle: '@sana_codes',    avatar: '💡' }, text: "Would love to collab on the hackathon! Building a game engine in Rust myself. DM'd you 🤝",                             likes:  7, isLiked: true,  createdAt: '1h ago'   },
  { id: 'cm3', postId: 'p1', author: { id: 'u4', name: 'GameMaster77',  handle: '@gamemaster77',  avatar: '⚡' }, text: "Unity multiplayer is a whole beast 😅 Have you tried Mirror Networking? Way easier than native UNET.",                 likes: 24, isLiked: false, createdAt: '1.5h ago', replies: 1 },
  { id: 'cm4', postId: 'p1', author: { id: 'u5', name: 'CodeKing_21',   handle: '@codeking_21',   avatar: '🚀' }, text: "This is goals! I spent 3 weeks on lag comp alone for my game jam entry 😭 What stack are you using for the backend?",  likes:  5, isLiked: false, createdAt: '2h ago'   },
  // Post p2 — Chess post
  { id: 'cm5', postId: 'p2', author: { id: 'u3', name: 'Sana_Codes',    handle: '@sana_codes',    avatar: '💡' }, text: "1842 is no joke! I'm stuck at 1550 for months 😭 Any advice for breaking through the 1600 barrier?",                 likes: 31, isLiked: false, createdAt: '2h ago', replies: 5 },
  { id: 'cm6', postId: 'p2', author: { id: 'u1', name: 'Arjun Kumar',   handle: '@arjun_builds',  avatar: '🧑‍💻' }, text: "Challenge accepted! Joining this weekend. Prepare for the Sicilian Defense 🤺",                                    likes: 14, isLiked: true,  createdAt: '4h ago', replies: 2 },
  { id: 'cm7', postId: 'p2', author: { id: 'u4', name: 'GameMaster77',  handle: '@gamemaster77',  avatar: '⚡' }, text: "Can I watch? I'm a certified chess spectator 😂 But seriously impressive grind, congrats!",                          likes:  9, isLiked: false, createdAt: '4.5h ago' },
  { id: 'cm8', postId: 'p2', author: { id: 'u5', name: 'CodeKing_21',   handle: '@codeking_21',   avatar: '🚀' }, text: "ELO 1842 is literally top 3% globally. You're a monster 🏆",                                                          likes: 42, isLiked: false, createdAt: '5h ago'   },
  // Post p3 — DSA post
  { id: 'cm9',  postId: 'p3', author: { id: 'u2', name: 'Champion_Raj', handle: '@champion_raj',  avatar: '🏆' }, text: "200 problems in 60 days is insane! I managed 150 in 3 months. Would love your DP and graphs breakdown.",             likes: 45, isLiked: false, createdAt: '5h ago', replies: 8 },
  { id: 'cm10', postId: 'p3', author: { id: 'u4', name: 'GameMaster77', handle: '@gamemaster77',  avatar: '⚡' }, text: "On problem 67 right now. Can you share which platforms besides LeetCode you used?",                                    likes: 22, isLiked: true,  createdAt: '6h ago', replies: 3 },
  { id: 'cm11', postId: 'p3', author: { id: 'u1', name: 'Arjun Kumar',  handle: '@arjun_builds',  avatar: '🧑‍💻' }, text: "The placement anxiety is real 😅 200 problems is legendary. What's your success rate on medium/hard?",            likes: 33, isLiked: false, createdAt: '7h ago', replies: 2 },
  { id: 'cm12', postId: 'p3', author: { id: 'u5', name: 'CodeKing_21',  handle: '@codeking_21',   avatar: '🚀' }, text: "Just shared this with my whole study group. This is exactly the motivation we needed before campus placements!",         likes: 18, isLiked: false, createdAt: '8h ago' },
];

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 'o1', emoji: '🚀',
    title: 'Learn, Connect & Grow',
    subtitle: 'Join thousands of students in communities built around your passions and interests.',
    gradient: ['#0f0a2e', '#1a0a4e'],
  },
  {
    id: 'o2', emoji: '⚡',
    title: 'Earn XP & Real Rewards',
    subtitle: 'Every post, game win, and event you attend earns you XP — convert it to real cash.',
    gradient: ['#0a1f1a', '#0a2e1f'],
  },
  {
    id: 'o3', emoji: '🎮',
    title: 'Play. Compete. Dominate.',
    subtitle: 'Challenge peers in Chess, Ludo, and arcade games. Climb the leaderboard. Win prizes.',
    gradient: ['#1a0a0a', '#2e0a1a'],
  },
  {
    id: 'o4', emoji: '🏆',
    title: 'Events Made for You',
    subtitle: 'Hackathons, meetups, webinars — discover campus and national events with XP rewards.',
    gradient: ['#0a0a2e', '#1a0a3e'],
  },
];
