# TADDLEBOX — Feature Document

> Version 1.0 · React Native (Expo) · Platform: iOS & Android

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Authentication & Onboarding](#2-authentication--onboarding)
3. [Home Feed](#3-home-feed)
4. [Social Features](#4-social-features)
5. [Stories](#5-stories)
6. [Communities](#6-communities)
7. [Events](#7-events)
8. [Games](#8-games)
9. [Wallet & Monetization](#9-wallet--monetization)
10. [Gamification System](#10-gamification-system)
11. [User Profiles](#11-user-profiles)
12. [Notifications](#12-notifications)
13. [Settings & Personalization](#13-settings--personalization)
14. [Navigation Architecture](#14-navigation-architecture)
15. [Data & State Management](#15-data--state-management)

---

## 1. Product Overview

TADDLEBOX is a gamified social platform built for college students. It combines a social media feed, community spaces, competitive mini-games, and an XP-based reward economy into a single app. Users earn XP by posting content, attending events, winning games, and maintaining daily login streaks — all of which can be converted into real cash rewards via a built-in wallet.

**Core Value Pillars**

| Pillar | Description |
|--------|-------------|
| Social | Post, comment, like, share and follow other students |
| Compete | Play games (Chess, Ludo, Block Blaster, Candy Connect) for XP |
| Earn | Accumulate XP through activity; convert to real cash |
| Discover | Browse events, hackathons, webinars, and communities |
| Grow | Level up, collect badges, climb leaderboards |

---

## 2. Authentication & Onboarding

### 2.1 Splash Screen
- Animated app logo with bounce + glow fade sequence
- Auto-transitions to Onboarding after 2.5 seconds
- Full-screen dark gradient background

### 2.2 Onboarding Carousel
- 3-slide FlatList carousel with snap scrolling
- Each slide has: gradient background, large emoji illustration, title, subtitle
- Topics: Social Feed, Earn XP, Play & Win
- Skip button (top-right) and Next/Get Started buttons

### 2.3 Welcome Screen
- Feature highlights: XP rewards, games, communities, events
- Two CTAs: **Login** and **Register**

### 2.4 Registration (3-Step Flow)

**Step 1 — Account Details**
- Full name, email, password, confirm password
- Real-time validation with inline error messages
- Progress indicator (1/3)

**Step 2 — Profile Info**
- Username / handle (with @ prefix)
- College name
- Bio (optional)
- Progress indicator (2/3)

**Step 3 — Interests**
- Grid of interest chips (e.g. Tech, Gaming, Design, Startup, Music, Sports)
- Multi-select toggle — tap to add/remove
- Progress indicator (3/3)
- Submit triggers OTP verification

### 2.5 OTP Verification
- 6-digit code input with individual boxes
- Auto-focus advances cursor to next box
- Auto-submits when all 6 digits are filled
- Resend button with 30-second countdown timer
- Edit phone number link

### 2.6 Login
- Email + password form
- Inline validation errors
- Loading state (spinner in button) during submission
- Forgot Password link → ForgotPasswordScreen

### 2.7 Forgot Password
- Email input field
- Submit shows confirmation UI: success icon, instructions, Back to Login button

---

## 3. Home Feed

The Home tab is the app's central experience, combining a social feed with gamification widgets.

### 3.1 Header Bar
- Hamburger menu (opens Side Drawer)
- Centered logo "TADDLEBOX"
- Notification bell with unread count badge

### 3.2 Mini Status Cards
Two cards displayed side-by-side below the header:

| Card | Color | Taps to |
|------|-------|---------|
| 🔥 Streak (N Days) | Amber | Streak detail modal |
| ⚡ Total XP | Purple | Wallet screen |

The XP card bounces with a spring animation when a Daily Reward is claimed (XP fly-to-card effect).

### 3.3 Stories Row
- Horizontal scrollable list of story avatars
- First item is always the user's own story (+ icon)
- Unseen stories: animated gradient ring border
- Seen stories: grey ring border
- Tap any avatar → StoryViewer screen

### 3.4 Spotlight Carousel
- Horizontal snap-scroll carousel of featured items
- 3-4 cards: hackathons, competitions, platform announcements
- Each card shows: gradient background, emoji, title, subtitle, tag label, metadata
- Dot indicator for position

### 3.5 Trending Chips
- Horizontal scrollable filter bar: `All`, `#Hackathon`, `#GameTime`, `#CollegeFest`, `#DevLife`, `#StudyTips`
- Tap a chip to filter the post feed
- Active chip: filled purple background + bold text

### 3.6 Daily Login Reward Card
- Shown once per day (auto-dismissed after claim)
- Shows: gift icon, title "Daily Login Reward", progress track, Claim button
- On claim:
  1. Gift icon bounces (spring animation)
  2. "+50 XP" text floats upward and fades
  3. Golden "⚡ +50 XP" pill particle flies from card to XP mini-card
  4. XP mini-card springs to 1.4× scale then snaps back
  5. Card fades + slides down and removes itself after 1.8 s

### 3.7 Post Feed
- Vertical list of PostCard components
- Filtered by active trending chip
- Pull-to-refresh (900ms delay, themed tint color)
- Empty state message if no posts match active filter

### 3.8 Side Drawer
- Slides in from left with backdrop overlay
- Header: user avatar, name, handle
- Navigation links: Notifications, Bookmarks, Leaderboard, Settings, Wallet, Events
- Badge counts on relevant items
- Tap outside or back button closes drawer (280ms transition delay to prevent flicker)

### 3.9 Streak Modal (Sheet)
- Appears from bottom when Streak card is tapped
- Shows 7-day M-T-W-T-F-S-S grid with completion status per day
- Today highlighted with fire emoji
- "Next reward in N more days" section
- Full milestone list: 3d (+50 XP), 7d (Exclusive Badge), 14d (₹5 Cash), 30d (Elite Status)
- Tap backdrop or close button to dismiss

---

## 4. Social Features

### 4.1 Post Card

Each post card shows:
- Author avatar, name, handle, post timestamp
- Community tag (colored pill) + XP earned pill
- Post text content
- Optional media: emoji banner OR actual image (from media picker), with aspect ratio support (1:1 or 16:9)
- Hashtag display
- Action bar: ❤️ Like (with count), 💬 Comment (with count), 🔗 Share, 🔖 Bookmark

**Interactions:**
- Like: Toggles liked state, count updates optimistically
- Bookmark: Toggles saved state, saved posts appear in Bookmarks screen
- Comment: Navigates to CommentsScreen with post context
- Share: Native OS share sheet with post text
- Author tap: Navigates to UserProfileScreen

### 4.2 Create Post (FAB)

Accessible via the center FAB (⊕) in the bottom tab bar.

**CreatePostModal fields:**
- Post content text input (multi-line, character count)
- Hashtag input: type and add chips; tap chip to remove
- Media picker: photo or video from device library; choose aspect ratio
- Community selector: dropdown to post to a specific community
- Submit button (disabled when empty)

### 4.3 Comments Screen

- Post preview card at the top
- Threaded comment list (FlatList)
- Each comment: avatar, name, handle, text, timestamp, like count
- Nested replies support
- Text input at bottom for composing a new reply
- Keyboard-aware layout (avoids keyboard overlap)

### 4.4 Bookmarks Screen

- Header with total saved count badge
- Flat list of saved PostCards (fully interactive)
- Empty state: 🔖 icon + "No bookmarks yet" message
- Works identically to the main feed for interactions

---

## 5. Stories

### 5.1 Story Row Component
- Scrollable avatar list embedded in Home feed
- Your story (first) shows a ⊕ icon; tap to create
- Other stories: colored ring = unseen, grey = seen

### 5.2 Story Viewer Screen
- Full-screen immersive viewer
- Segmented progress bar at top (1 segment per story, 5s each)
- Tap left half of screen: go to previous story
- Tap right half: go to next story
- Press and hold: pause progress
- Release: resume
- Each story: gradient background, emoji, text content, username
- Swipe down or back button exits

---

## 6. Communities

### 6.1 Community Browse (CommunityScreen)
- Category filter tabs: All, Joined, Tech, Gaming, Lifestyle, Startup, Creative, Study
- Community cards in a scrollable grid/list:
  - Banner emoji + gradient background
  - Community name, description snippet
  - Member count
  - Join/Leave toggle button
  - Private badge for private communities
- Leaderboard section showing top XP earners in communities

### 6.2 Community Detail (CommunityDetailScreen)
- Banner header (gradient per category + emoji)
- Community avatar (gradient circle with emoji)
- Join/Joined button (gradient vs outline)
- Stats row: Members, Posts, Category
- Write post bar (only visible if joined)
- Feed filter tabs: All, 🔥 Trending, ✨ New
- Filtered post feed (posts belonging to or tagged with this community)
- Create post FAB → CreatePostModal pre-filled with community

**Categories & their colors:**
| Category | Gradient |
|----------|----------|
| Tech | Deep purple → dark blue |
| Lifestyle | Forest green → teal |
| Gaming | Burnt orange → red |
| Startup | Olive → amber |
| Creative | Violet → pink |
| Study | Navy → cyan |

---

## 7. Events

### 7.1 Event Feed (EventsScreen)
- Filter chips: All, 🔴 Live, 💻 Online, 📍 Offline, 🏆 Contest
- Featured event at top (larger card with prominent CTA)
- Event card list showing:
  - Event type icon + gradient
  - Title, type label (color-coded badge)
  - Date, time, location
  - XP reward chip + cash prize chip (if applicable)
  - Registration count + Register/Registered button

### 7.2 Event Types & Colors

| Type | Emoji | Color |
|------|-------|-------|
| Hackathon | 🚀 | Purple |
| Webinar | 🎤 | Blue |
| Meetup | 🌐 | Green |
| Competition | 🏆 | Amber |
| Workshop | 🛠️ | Teal |

### 7.3 Registration Flow
- Tap Register → button switches to "✓ Registered" state
- Registration count increments locally
- XP reward displayed prominently as incentive

---

## 8. Games

### 8.1 Game Hub (GamesScreen)

Three-tab layout:
1. **All Games** — browse and launch games
2. **Tournaments** — join live competitive events
3. **History** — past match results

**Player Stats Bar (on All Games tab):**
- Total XP earned from games
- Games played count
- Win rate percentage
- Current win streak

### 8.2 Available Games

| Game | Emoji | Max XP |
|------|-------|--------|
| Chess | ♟️ | 150 XP |
| Ludo | 🎲 | 100 XP |
| Block Blaster | 💥 | 80 XP |
| Candy Connect | 🍭 | 60 XP |

Each game card shows: gradient thumbnail, emoji, name, players online count, max XP, "HOT" badge if trending.

### 8.3 Play Modes

| Mode | Icon | Description | XP |
|------|------|-------------|-----|
| vs Bot | 🤖 | Practice vs AI, no entry fee | Full |
| Quick Match | ⚡ | vs random online player | Full |
| Tournament | 🏆 | Entry: 50 XP, compete for prizes | Bonus |

### 8.4 Game Play Flow (GamePlayModal)

**Lobby Phase:**
- Game hero card with gradient + emoji
- Info chips: Max XP, Avg. Game time, Status
- Mode selector (Bot / Quick / Tournament) with radio buttons
- Play Now button (gradient)

**Countdown Phase:**
- Full-screen overlay
- Game emoji + "You vs AI Bot / Opponent"
- 3 → 2 → 1 → GO! animated countdown (spring scale)

**Playing Phase:**
- Score box (current score + XP to earn)
- Game name + elapsed time
- Live game board (visual simulation):
  - **Chess**: 8×8 board with pieces, move highlights
  - **Ludo**: 4-quadrant colored board with token circles
  - **Block Blaster**: 5×8 colored cell grid with line-clear animation
  - **Candy Connect**: 5×5 emoji grid with swap simulation
- Move log (Chess/Ludo): scrolling list of moves with player vs AI indicator
- Auto-advances moves every 1.4 seconds
- Game ends after ~9.8 seconds

**Result Phase:**
- Win/Loss card (spring scale-in animation)
- Win (🏆): green gradient card | Loss (😔): red gradient card
- Stats: XP Earned, Score, Mode
- Buttons: Exit | Play Again (gradient)
- Win → triggers XP earn in WalletContext + adds match to GamesContext

### 8.5 Tournaments Tab
- Tournament cards showing: game, name, prize (₹), XP prize, progress bar (% filled), entry fee, ends-in timer
- Register button → Alert confirming entry fee deduction
- Registered state: checkmark badge

### 8.6 Match History Modal
- Filter chips: All | 🏆 Wins | 😔 Losses
- Match rows: game emoji, name, opponent, duration, played-at, result badge, XP earned, score
- Empty state per filter

### 8.7 Leaderboard Modal
- Top 3 podium (🥈 / 🥇 / 🥉) with emoji avatars + XP
- Full list for ranks 4+: rank number, avatar, username, XP

---

## 9. Wallet & Monetization

### 9.1 Balance Cards
Two stacked gradient cards:
- **Cash Card**: ₹ balance + "Total Earned" + "Total Withdrawn" stats
- **XP Card**: XP balance with conversion rate (100 XP = ₹1)

### 9.2 Earn More Section
Grid of 4 action shortcuts:
| Action | XP Range | Navigates to |
|--------|----------|--------------|
| Win Games | +50–150 XP | Games tab |
| Post Content | +10–75 XP | Create post |
| Attend Events | +25–200 XP | Events tab |
| Daily Streak | +10–50 XP | Home tab |

### 9.3 Transaction History
- Filter chips: All | Earned | Spent | XP | Cash
- Transaction rows: type icon, title, date, amount (color-coded: gold for XP, red for negative, green for positive)
- Transaction types: earn, spend, convert, withdraw

### 9.4 Withdraw Modal
- Quick-select amounts: ₹100, ₹250, ₹500 chips
- Custom amount text input
- Validation: minimum ₹100, must not exceed balance
- Linked UPI display + "Change" button
- Confirms with warning about processing time

### 9.5 Link UPI Modal
- UPI ID text input with format validation (`user@provider`)
- Quick-select buttons for major apps: Paytm, GPay, PhonePe, BHIM
- Verify button → 1.5s mock verification → ✓ Verified state
- Save & Link button

### 9.6 Convert XP → Cash Modal
- XP amount input
- Live calculation display: N XP = ₹M (at ₹0.01/XP)
- Validation: minimum 500 XP, must not exceed balance
- Predefined amounts: 500, 1000, 5000 XP chips
- Confirm button

### 9.7 Wallet Settings Modal
- **Security**: Enable PIN, Enable Biometrics
- **Linked Accounts**: UPI ID display + link/change, Bank account
- **Notifications**: XP credits, Withdrawal updates, Promo offers

---

## 10. Gamification System

### 10.1 XP (Experience Points)

**Earn XP by:**
| Activity | XP Range |
|----------|----------|
| Creating a post | +10–75 XP |
| Winning a game | +50–150 XP |
| Daily login reward | +50 XP |
| Attending an event | +25–200 XP |
| Daily streak bonus | +10–50 XP |

**XP is displayed in:**
- XP mini-card on home screen
- XP progress bar on profile
- Leaderboard rankings
- Wallet XP balance

### 10.2 Levels & Ranks

Users progress through levels (1–∞) with named ranks:

| Rank | Approximate Level |
|------|-------------------|
| Newcomer | 1–4 |
| Explorer | 5–9 |
| Pioneer | 10–14 |
| Champion | 15–19 |
| Legend | 20+ |

Level badge shown: profile avatar, level-up screen, leaderboard.

### 10.3 XP Progress Bar
- Shows current XP / XP needed for next level
- Gradient fill (purple → cyan)
- Glowing dot at fill position
- Level number circle badge (left)
- Rank label

### 10.4 Daily Streak

- Tracked per consecutive login day
- 7-day visual calendar grid (M–T–W–T–F–S–S)
- Today's day shown with 🔥, completed days with ✓

**Milestone Rewards:**
| Days | Reward |
|------|--------|
| 3 days | +50 XP Bonus |
| 7 days | Exclusive Badge 🌟 |
| 14 days | ₹5 Cash Reward 💎 |
| 30 days | Elite Status 👑 |

### 10.5 Badges

Achievement badges displayed on profile:

| Badge Color | Significance |
|-------------|--------------|
| Gold | Top achievements (Streak Legend, etc.) |
| Purple | Community or skill badges |
| Cyan | Event participation badges |
| Green | Social or XP milestone badges |
| Locked (greyed) | Not yet unlocked |

### 10.6 Leaderboard

- Global ranking by total XP
- Top 3 shown in podium view (🥇🥈🥉) with avatar emojis
- Full list shows rank number, avatar, username, XP
- Game-specific leaderboards in the Games tab

---

## 11. User Profiles

### 11.1 Own Profile (ProfileScreen)
- Top bar: handle + share icon + settings icon
- Hero section (purple gradient): avatar (gradient circle), name, handle, rank, bio
- Stats row: Posts, Followers, Following, Total XP
- Edit Profile button + QR code share
- XP Progress Bar component
- Achievements row (horizontal scroll of badge cards)
- Community stats: joined count, games played, college
- Tab switcher: Posts | Media | Saved | Games
- Post grid (3-column, emoji-based thumbnails with like count)

### 11.2 Other User Profile (UserProfileScreen)
Accessed by tapping any post author.
- Same layout as own profile
- Follow / Following toggle button (+ count update)
- Message button
- More (⋯) options button
- No edit access

---

## 12. Notifications

### 12.1 Notification Types

| Type | Color | Description |
|------|-------|-------------|
| like | Pink | Someone liked your post |
| comment | Blue | Comment on your post |
| follow | Purple | New follower |
| mention | Cyan | Someone @mentioned you |
| event | Amber | Event reminder or update |
| achievement | Gold | Badge earned or level up |

### 12.2 Grouping
Notifications grouped into:
- **Today** — within last 24h
- **Yesterday** — prior day
- **Earlier** — all older

### 12.3 Actions
- Mark all as read (removes unread indicators)
- Badge count on notification bell icon in Home header
- Read/unread visual distinction (opacity)

---

## 13. Settings & Personalization

### 13.1 Profile Section
- Display name and avatar
- Edit profile shortcut
- Account type (Student / Creator)

### 13.2 Privacy Settings
| Toggle | Default | Effect |
|--------|---------|--------|
| Public Account | ON | Posts visible to all |
| Activity Status | ON | Show online/last seen |
| Allow Tagging | ON | Others can tag in posts |
| Leaderboard Visibility | ON | Appear in public rankings |

### 13.3 Theme
- Dark / Light mode toggle
- Instantly applies across all screens via ThemeContext
- Persists for session duration

### 13.4 Security
- Change Password
- Two-Factor Authentication (2FA) toggle
- Active Sessions list

### 13.5 Account Actions
- Logout (clears auth state)
- Delete Account (destructive, with confirmation)

---

## 14. Navigation Architecture

```
RootNavigator
├── AuthNavigator (Stack)
│   ├── SplashScreen
│   ├── OnboardingScreen
│   ├── WelcomeScreen
│   ├── LoginScreen
│   ├── RegisterScreen
│   ├── OTPScreen
│   └── ForgotPasswordScreen
│
└── MainNavigator (Bottom Tabs)
    ├── HomeStack (Stack)
    │   ├── HomeMain
    │   ├── Notifications
    │   ├── Comments       { post }
    │   ├── UserProfile    { user }
    │   ├── StoryViewer    { stories[], initialIndex }
    │   ├── Bookmarks
    │   └── Settings
    │
    ├── CommunityStack (Stack)
    │   ├── CommunityList
    │   └── CommunityDetail { communityId }
    │
    ├── EventsScreen (Direct)
    ├── GamesScreen (Direct)
    ├── WalletScreen (Direct)
    └── ProfileScreen (Direct)
```

**Bottom Tab Bar (6 tabs):**
Home | Community | Events | Games | Wallet | Profile

Center FAB (⊕) between Games and Wallet launches CreatePostModal.

---

## 15. Data & State Management

### 15.1 Context Providers

| Context | State Managed | Actions |
|---------|--------------|---------|
| ThemeContext | isDark, colors | toggleTheme |
| AuthContext | isLoggedIn | signIn, signOut |
| PostsContext | posts[] | addPost, toggleLike, toggleSave, deletePost |
| CommunityContext | communities[] | toggleJoin, addCommunity |
| WalletContext | balances, transactions[], settings | withdraw, convertXP, earnXP, linkUPI, toggleSetting |
| GamesContext | matches[], stats | addMatch |

### 15.2 Wallet Currency System
- **XP**: Earned through activity; displayed everywhere gamification is present
- **INR**: Earned from XP conversion or event prizes; withdrawable via UPI
- **Exchange Rate**: 100 XP = ₹1 (minimum 500 XP to convert)
- **Minimum Withdrawal**: ₹100

### 15.3 Mock Data (Current)
All data is seeded in-memory with mock data. The architecture is ready for API integration by swapping context actions with API calls:
- Current user: Arjun Kumar, Level 12 Pioneer, 12,840 XP
- Initial cash: ₹1,250
- 3 initial posts, 4 communities, 6 game matches in history
