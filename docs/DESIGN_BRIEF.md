# TADDLEBOX — Design Brief for UI/UX Team

> Document Type: Product Design Handoff
> Audience: UI/UX Designers
> Platform: Mobile App (iOS & Android)
> Stage: Current prototype exists in React Native — this doc guides the visual design overhaul

---

## Quick Read: What Is TADDLEBOX?

TADDLEBOX is a **gamified social app for Indian college students**. Think of it as a mix of Instagram's social feed, Discord's communities, a mini-game arcade, and a real-money reward wallet — all built for the campus crowd.

Students use it to:
- Post content and interact socially with their college network
- Join communities based on interest (Tech, Gaming, Startup, etc.)
- Discover and register for events like hackathons, webinars, meetups
- Play casual mini-games (Chess, Ludo, Block Blaster, Candy Connect) to earn XP
- Cash out their earned XP as real ₹ through their UPI/bank

The core hook is simple: **every action earns XP, XP converts to cash**.

---

## Table of Contents

1. [The User](#1-the-user)
2. [Design Mood & Direction](#2-design-mood--direction)
3. [App Structure at a Glance](#3-app-structure-at-a-glance)
4. [Screen-by-Screen Design Requirements](#4-screen-by-screen-design-requirements)
   - Auth & Onboarding
   - Home Feed
   - Social Features
   - Communities
   - Events
   - Games
   - Wallet
   - Profile
   - Settings & Notifications
5. [Key User Journeys](#5-key-user-journeys)
6. [Reusable Components to Design](#6-reusable-components-to-design)
7. [States Every Screen Must Handle](#7-states-every-screen-must-handle)
8. [Gamification Design Language](#8-gamification-design-language)
9. [What the Design Team Decides](#9-what-the-design-team-decides)

---

## 1. The User

### Primary Persona — "The Ambitious Student"

| Attribute | Detail |
|-----------|--------|
| Age | 18–24 |
| Context | Engineering / MBA college, tier 2-3 city |
| Device | Android (primary), mid-range phone |
| Motivation | Wants recognition, cash, social status, and a fun way to spend free time |
| Pain point | Existing social apps don't reward them. Gaming apps don't have social context. |
| Behavior | Checks phone 80+ times/day. Short attention span. Driven by streaks and rewards. |

### Secondary Persona — "The Community Leader"

| Attribute | Detail |
|-----------|--------|
| Age | 20–25 |
| Context | College club head, hackathon organizer, gaming enthusiast |
| Motivation | Wants to build an audience, grow a community, host events |
| Behavior | Creates more than they consume. Cares about their rank and badge collection. |

### What They Should Feel Using the App

- **Rewarded** — every tap should feel like it might earn them something
- **Seen** — their posts, scores, and badges are visible to peers
- **Competitive** — knowing where they rank keeps them coming back
- **Entertained** — the experience should be energetic, not boring or corporate

---

## 2. Design Mood & Direction

### Tone

**Energetic. Youthful. Premium-feeling without being corporate.**

This is not a fintech app or a productivity tool. It should feel closer to a gaming app crossed with a modern social app. Bold, vibrant, and rewarding — but also clean enough that parents or professors wouldn't find it jarring.

### Visual Direction

The current prototype uses a **dark space/gaming theme** as a default with electric purple, cyan, and gold accents. Here's what that communicates:

- **Deep dark backgrounds** (#070714 level) → Focus on content; premium gaming feel
- **Electric purple (#7C3AED)** → Primary brand, energy, identity
- **Cyan (#06B6D4)** → Secondary accent, tech/digital vibe
- **Gold (#FBBF24)** → XP, rewards, achievement — the "feel-good" color
- **Green (#10B981)** → Success, win states, money earned
- **Red (#EF4444)** → Loss, errors, danger

### Inspiration References (Design Team to Explore)

| App | What to take from it |
|-----|----------------------|
| Duolingo | Streak animations, reward celebrations, gamified progress |
| Zepto / Swiggy | Card-heavy Indian mobile UI density |
| Coin Master | Reward euphoria, XP celebrations |
| Discord | Community structure, dark UI with colored accents |
| Instagram | Story rings, post card layout, bottom navigation |
| CRED | Premium dark aesthetic, clean financial UI |

### What to Avoid

- Flat, monotone designs — everything needs depth (gradients, shadows, glow)
- Heavy use of white space — users want density and richness
- Overly corporate or formal UI — this is for 20-year-olds
- Generic icons — use custom or distinctive iconography
- Inconsistent color use — the XP gold, win green, and danger red should be used exclusively for their semantic meaning

---

## 3. App Structure at a Glance

The app has two main states: **logged out** (auth flow) and **logged in** (main app).

### Logged Out — Auth Flow
```
Splash → Onboarding (3 slides) → Welcome → Login / Register → OTP → Main App
                                                                   ↑
                                                        Forgot Password branch
```

### Logged In — Bottom Navigation (6 tabs)
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   Home  │  Community  │  Events  │  Games  │ Wallet │ Profile  │
│                              ⊕ FAB                  │
└─────────────────────────────────────────────────────┘
```

Each tab is a distinct experience. The **center FAB (⊕)** is a floating "Create Post" button that lives between the tabs. It is always visible.

---

## 4. Screen-by-Screen Design Requirements

---

### AUTH & ONBOARDING

---

#### 4.1 Splash Screen

**Purpose:** Brand impression + loading moment

**What needs to be on screen:**
- TADDLEBOX logo (large, centered)
- Tagline underneath
- Background: full dark gradient or animated particle effect

**Design goal:** Make this memorable. The user sees this every time they open the app. It should feel premium and energetic — not like a loading screen.

**Interaction:** Auto-advances after ~2.5 seconds. No user action needed.

**States:**
- Single state (no variants needed)

---

#### 4.2 Onboarding Carousel

**Purpose:** Sell the value proposition in 3 slides before the user commits to registering.

**Each slide needs:**
- Large hero illustration or emoji (full top half of screen)
- Bold title (1 line)
- Short subtitle (2 lines max)
- Background gradient (different per slide)
- Progress dots at bottom
- "Next" button (last slide: "Get Started")
- "Skip" link (top right, always visible)

**The 3 slides cover:**
1. **Social Feed** — post, connect, discover your campus
2. **Earn XP** — every action earns points convertible to cash
3. **Play & Win** — games, tournaments, leaderboards

**Design goal:** Each slide should feel like a mini-poster for that feature. Bold typography, vivid gradients.

---

#### 4.3 Welcome Screen

**Purpose:** Decision point — Login or Register

**What needs to be on screen:**
- App logo (smaller, top area)
- Feature highlights (4 short bullet/icon rows): XP Rewards, Games, Communities, Events
- Two CTA buttons: **Login** (primary gradient) and **Register** (outline/ghost)

**Design goal:** Clear hierarchy. The features listed below should reassure first-time users why they should sign up.

---

#### 4.4 Registration — 3-Step Form

**Purpose:** Collect user info progressively. Don't overwhelm with one long form.

**Step 1 — Account Details**
- Fields: Full Name, Email, Password, Confirm Password
- Step indicator: 1 of 3 (pill or progress dots)
- "Next" button (disabled until fields valid)
- Inline error messages per field
- Back link

**Step 2 — Profile Info**
- Fields: Username (@handle), College Name, Bio (optional)
- Same step indicator: 2 of 3
- Handle preview (show "@username" in real time)

**Step 3 — Interests**
- Instruction: "Select your interests (pick at least 3)"
- Chip grid: Tech, Gaming, Design, Startup, Music, Sports, Art, Finance, etc.
- Chips toggle on/off on tap
- Selected chips: filled, colored; unselected: outlined, grey
- Step indicator: 3 of 3
- "Create Account" button → triggers OTP

**Design goal:** Conversational and progressive. Each step should feel lightweight. Don't show form fields that aren't needed on that step.

---

#### 4.5 OTP Screen

**Purpose:** Verify phone number / email

**What needs to be on screen:**
- Title: "Enter OTP"
- Subtitle: "We sent a 6-digit code to [email/phone]"
- 6 individual digit boxes (not a single text field)
- Auto-focus and auto-advance as digits are entered
- Resend link with countdown: "Resend in 28s" → becomes "Resend Code" after countdown
- Edit email/phone link

**Design goal:** The 6 boxes should be large enough to be satisfying to type into. Active box should clearly show focus state. Don't make this feel like a security checkpoint — make it feel like a quick step.

---

#### 4.6 Login Screen

**Purpose:** Return user sign-in

**What needs to be on screen:**
- Fields: Email, Password (with show/hide toggle)
- "Forgot Password?" link (below password field)
- Login button (primary, full width)
- Divider: "or continue with" (for future social login)
- "Don't have an account? Register" link

---

#### 4.7 Forgot Password

**Purpose:** Password recovery

**Two states:**
1. **Input state** — Email field + Submit button
2. **Success state** — Confirmation illustration + instructions + "Back to Login" link

---

### HOME FEED

---

#### 4.8 Home Screen

**Purpose:** The app's hub. First thing users see every day.

**Layout (top to bottom, vertical scroll):**

```
┌────────────────────────────────┐
│ ≡  TADDLEBOX  🔔 (badge)      │  ← Header (pinned, does not scroll)
├────────────────────────────────┤
│ [🔥 7 Days Streak]  [⚡ 12.8k] │  ← Two mini-cards side by side (pinned)
├────────────────────────────────┤
│ ─── SCROLLABLE BELOW ──────── │
│ [Your] [Story] [Story] [Story] │  ← Story row
│ ┌─────────────────────┐        │
│ │  Spotlight Card 1   │        │  ← Spotlight carousel (snap)
│ └─────────────────────┘        │
│  ○ ● ○ ○                       │  ← Carousel dots
│ [All][#Hackathon][#GameTime]…  │  ← Trending chips (H-scroll)
│ ┌─────────────────────────┐    │
│ │ 🎁 Daily Login Reward   │    │  ← Reward card (disappears on claim)
│ │    ████████░░ Claim!    │    │
│ └─────────────────────────┘    │
│        FEED 🔥                 │  ← Section label
│ [Post Card]                    │
│ [Post Card]                    │
│ [Post Card]                    │
└────────────────────────────────┘
```

**Critical design decisions needed:**

1. **Header** — The header with the logo, hamburger menu, and notification bell is always visible while scrolling. Should it have a blur/frosted glass effect as content scrolls beneath it?

2. **Mini status cards** — The Streak card and XP card sit between the header and the scroll content. These should feel like "dashboard widgets" — compact, glanceable. The XP card needs to animate (bounce) when a reward is claimed.

3. **Daily Reward Card** — This is a key engagement mechanic. It should feel rewarding and inviting. When the user taps "Claim!", multiple things happen:
   - The card's icon bounces
   - "+50 XP" text floats up and fades
   - A golden "⚡ +50 XP" particle/pill flies diagonally up toward the XP mini-card
   - The XP card springs/bounces when the particle lands
   - The card then fades and slides away
   
   The design needs to accommodate this animation elegantly — the card should have visual "launch zone" energy.

4. **Spotlight Carousel** — Full-width (or near-full) cards that snap into position. These are for featured hackathons, platform announcements, etc. Think editorial cards, not ads.

5. **Side Drawer** — Opens from the left. Needs a user avatar/profile section at top, then navigation links. Backdrop darkens the main content behind it.

**States to design:**
- Default (with posts, with reward card)
- Feed filtered to a hashtag (fewer or zero posts)
- Post feed empty state
- After reward claimed (card gone, XP bounced)

---

#### 4.9 Side Drawer

**Purpose:** Secondary navigation hub

**Layout:**
```
┌──────────────────────────────┐
│                              │
│  [Avatar]                    │
│  Arjun Kumar                 │
│  @arjun_builds               │
│                              │
│  🔔 Notifications      (3)   │
│  🔖 Bookmarks                │
│  🏆 Leaderboard              │
│  ⚙️  Settings                │
│  💰 Wallet                   │
│  🎪 Events                   │
│                              │
│  ─────────────────           │
│  🚪 Logout                   │
└──────────────────────────────┘
```

- Width: ~80% of screen
- Backdrop: semi-transparent dark overlay on the right side
- Tap backdrop or swipe left to close

---

#### 4.10 Streak Modal

**Purpose:** Show detailed streak progress when user taps the Streak card

**Appears as:** Bottom sheet (slides up from bottom)

**Content:**
- Handle at top
- 7-day grid (M T W T F S S) — each day is a square showing: completion check, fire emoji for today, day letter
- "Next reward in X days" info box with the upcoming milestone
- Milestone list: 3d, 7d, 14d, 30d — each showing emoji, label, status (achieved or locked)

**Design goal:** Should feel celebratory and motivating, not administrative.

---

### SOCIAL FEATURES

---

#### 4.11 Post Card

**The most repeated UI element in the app.** Gets heavy design attention.

**Anatomy:**
```
┌────────────────────────────────────────┐
│ [Avatar] Name           @handle · 2h  │
│          [Community pill] [+25 XP pill]│
├────────────────────────────────────────┤
│ Post text content goes here.           │
│ This can be 1–4 lines typically.       │
├────────────────────────────────────────┤
│ [Media / Image Banner — optional]      │
│ (square 1:1 or landscape 16:9)         │
├────────────────────────────────────────┤
│ ❤ 42    💬 8    🔗 Share    🔖 Save   │
└────────────────────────────────────────┘
```

**States of the like button:**
- Default: grey heart outline + count
- Liked: pink/red filled heart + count incremented

**States of the save button:**
- Default: grey bookmark outline
- Saved: purple filled bookmark

**Important:** Post cards appear in: Home Feed, Bookmarks Screen, Community Detail, and User Profile. The card design must work in all these contexts.

---

#### 4.12 Create Post Modal

**Triggered by:** Center FAB (⊕) in tab bar or "Write something…" bar inside a community

**This is a bottom sheet that covers most of the screen**

**Layout:**
```
┌─────────────────────────────────────┐
│ ✕     Create Post                   │
├─────────────────────────────────────┤
│ [Avatar]  [Text area placeholder]   │
│                                     │
├─────────────────────────────────────┤
│ [#Hashtag1] [#Hashtag2] [+ add tag] │
├─────────────────────────────────────┤
│ Community: [TechBuilders ▾]         │
├─────────────────────────────────────┤
│ 🖼  Media  │  1:1  │  16:9          │
├─────────────────────────────────────┤
│            [Post (234/500)]         │
└─────────────────────────────────────┘
```

---

#### 4.13 Comments Screen

**Navigated to when:** User taps "💬 Comment" on any post

**Layout:**
- Top: Post preview card (compact version of PostCard)
- Middle: Scrollable comment list (each comment: avatar, name, text, timestamp, like count)
- Bottom: Pinned text input bar "Add a reply…" + submit button
- Keyboard pushes the input bar up

---

#### 4.14 Bookmarks Screen

**Navigated to from:** Side Drawer → Bookmarks

**Layout:**
- Header with back button, "Bookmarks" title, saved count badge
- Subtext: "X saved posts"
- FlatList of full PostCards
- Empty state: large bookmark emoji + "No bookmarks yet" + description

---

### COMMUNITIES

---

#### 4.15 Community Browse Screen

**Purpose:** Discover and join communities

**Layout:**
- Category filter tabs at top (All, Joined, Tech, Gaming, Lifestyle, Startup, Creative, Study)
- Community cards in a scrollable list

**Community Card:**
```
┌──────────────────────────────────────────┐
│ [Gradient banner with emoji]  🔒 Private │
├──────────────────────────────────────────┤
│ Community Name            [Join] button  │
│ Short description text                   │
│ 👥 12.4k members                         │
└──────────────────────────────────────────┘
```

Each community category has its own gradient color scheme (design team to specify exact values):

| Category | Color Direction |
|----------|----------------|
| Tech | Purple/Blue |
| Gaming | Orange/Red |
| Lifestyle | Green/Teal |
| Startup | Amber/Yellow |
| Creative | Pink/Violet |
| Study | Navy/Cyan |

**Join button states:**
- Default: "Join" (filled primary gradient)
- Joined: "✓ Joined" (outlined, subtle)

---

#### 4.16 Community Detail Screen

**Purpose:** View a specific community's feed and info

**Layout:**
```
[Banner gradient + emoji hero image]  ← scrolls
[Avatar circle overlapping banner edge]
[Name, Description]
[Members | Posts | Category stats]
[Write something here...] ← only if joined
─────────────────────────────────────
[All | 🔥 Trending | ✨ New] ← sticky on scroll
─────────────────────────────────────
[Post cards...]
```

The banner-to-content overlap (card slides up over the banner) creates a nice layering effect — needs careful handling to look polished.

---

### EVENTS

---

#### 4.17 Events Screen

**Purpose:** Discover events and register

**Layout:**
- Filter chips: All | 🔴 Live | 💻 Online | 📍 Offline | 🏆 Contest
- Featured Event card (larger, prominent) at top
- List of event cards below

**Event Card:**
```
┌──────────────────────────────────────┐
│ [Type emoji]  Title of Event         │
│ [Type badge]  Date · Time · Location │
│               ⚡ 100 XP  💰 ₹5,000   │
│ 342 registered    [Register] button  │
└──────────────────────────────────────┘
```

**Featured event card** is visually bigger — full gradient background, larger typography, more prominent CTA.

**Register button states:**
- Default: "Register" (primary color)
- Registered: "✓ Registered" (green, disabled)

**Event type color coding** (badge pills):
| Type | Pill Color |
|------|-----------|
| Hackathon | Purple |
| Webinar | Blue |
| Meetup | Green |
| Competition | Amber |
| Workshop | Teal |

---

### GAMES

---

#### 4.18 Games Screen (Hub)

**Purpose:** Browse games, join tournaments, view history

**Layout: 3-tab structure within the screen**

```
[All Games] [Tournaments] [History]
──────────────────────────────────
(content per tab below)
```

**Tab 1 — All Games:**
```
[Stats Bar: XP earned | Games played | Win rate | Streak]
                                        ← horizontal stats strip

Quick Play (horizontal scroll of mode cards)
── vs Bot ── Quick Match ── Tournament ──

Top Players This Week
[mini leaderboard strip]

[Game Card]   [Game Card]
[Game Card]   [Game Card]   ← 2-column grid
```

**Game Card:**
```
┌──────────────────────┐
│  [Gradient + emoji]  │  ← thumbnail
│  ♟️ Chess  🔴 HOT    │
├──────────────────────┤
│ 2.4k online  · Max 150 XP │
│ [Play →]             │
└──────────────────────┘
```

**Tab 2 — Tournaments:**
- Tournament cards with: game name, prize pool (₹), XP prize, progress bar (registrations filled), entry fee, ends-in timer
- Register button → confirmation alert

**Tab 3 — History:**
- List of past match rows
- Each row: game emoji, name, opponent, mode, date, result badge, XP earned, score

---

#### 4.19 Game Play Modal (Fullscreen)

This is a **fullscreen experience** — separate from the rest of the app's design language. It should feel immersive, like stepping into a game.

**Phase 1 — Lobby**
```
[Game emoji + gradient hero banner]
[Info chips: Max XP | ~5 min | Status]
[Mode selector (radio button list)]
  🤖 vs Bot        Practice mode
  ⚡ Quick Match    vs random player
  🏆 Tournament     Entry: 50 XP
[Play Now button — gradient, full width]
```

**Phase 2 — Countdown**
```
[Full dark screen]
[Game emoji]
You vs AI Bot
[  3  ]  ← scales with spring animation
Get ready…
```

**Phase 3 — Playing**
```
[Score]         [Game Name · 0:34]      [XP: +150]
───────────────────────────────────────────────
[Live Game Board — Chess / Ludo / Block / Candy]

[Move Log — scrollable, shows moves in real time]
```

Game boards to design (visual representations, not interactive):
- **Chess** — 8×8 board with pieces, highlighted move squares
- **Ludo** — 4-quadrant colored board with player tokens
- **Block Blaster** — colored grid, rows clearing with animation
- **Candy Connect** — emoji grid, cells swapping

**Phase 4 — Result**
```
[Win: green gradient card with 🏆]
[Loss: red gradient card with 😔]

You Won!
+120 XP  |  8,240 pts  |  vs Bot
[      Exit      ]  [   Play Again   ]
```

Result card springs in from scale 0 to 1.

---

### WALLET

---

#### 4.20 Wallet Screen

**Purpose:** View earnings, convert XP, withdraw cash

**Layout:**
```
[Header: Wallet · ⚙]
─────────────────────────────────
[Cash Balance Card — gradient]
  ₹1,250.00
  Earned: ₹3,100  Withdrawn: ₹1,850

[XP Balance Card — gradient]
  12,840 XP
  100 XP = ₹1
─────────────────────────────────
Earn More ➜
[🎮 Win Games] [📝 Post] [🎪 Events] [🔥 Streak]
─────────────────────────────────
[All][Earned][Spent][XP][Cash]   ← filter chips
─────────────────────────────────
[Transaction Row]
[Transaction Row]
[Transaction Row]
```

**Balance cards** need to feel premium — gradients, subtle patterns or glows.

**Transaction row:**
```
[Type icon pill]  Transaction title     +₹250
                  Today 3:42 PM         Earned
```

Color coding:
- XP earned: gold amount text
- Cash earned: green amount text  
- Spent / withdrawn: red amount text

**Action buttons on the screen:**
- "Withdraw" → opens Withdraw modal
- "Convert XP" → opens Convert modal
- "Link UPI" → opens UPI linking modal

---

#### 4.21 Wallet Modals (Bottom Sheets)

Three modals opened from the wallet screen:

**Withdraw Modal:**
- Quick-select chips: ₹100 | ₹250 | ₹500
- Custom amount input
- Linked UPI ID display + Change option
- Withdraw button

**Link UPI Modal:**
- UPI ID text input
- App shortcut buttons: [Paytm] [GPay] [PhonePe] [BHIM]
- Verify → shows verified state
- Save & Link button

**Convert XP → Cash Modal:**
- "Enter XP amount to convert" input
- Quick amounts: 500 XP | 1000 XP | 5000 XP
- Live preview: "500 XP = ₹5.00"
- Convert button

---

### PROFILE

---

#### 4.22 Own Profile Screen

**Purpose:** The user's personal page

**Layout:**
```
[handle]                     [share] [settings]
─────────────────────────────────────────────
[Purple gradient hero section]
  [Avatar circle] Name   ← large
                  @handle · 🏅 Pioneer rank
                  Bio text

  [Posts: 47]  [Followers: 1.2k]  [Following: 89]  [XP: 12.8k]

  [Edit Profile]                          [📱 QR]
─────────────────────────────────────────────
[XP Progress Bar — Level 12 ████████░░ Level 13]

Achievements 🏆
[Badge] [Badge] [Badge] [Badge] ← horizontal scroll

[Posts] [Media] [Saved] [Games]   ← tab switcher
[3-column post grid below]
```

---

#### 4.23 Other User Profile Screen

Same layout as Own Profile but:
- "Edit Profile" replaced by [Follow / Following] + [Message] + [⋯]
- Follow button: filled when not following, outline when following
- Follower count updates when Follow is tapped

---

### NOTIFICATIONS

---

#### 4.24 Notifications Screen

**Layout:**
- Header: "Notifications" + "Mark all read" link
- Grouped sections: Today / Yesterday / Earlier
- Each notification row:

```
[Color circle icon]  Actor performed action on your post    2m
                     Post preview or context
```

Notification dot colors per type:
- ❤️ Like — Pink
- 💬 Comment — Blue
- 👤 Follow — Purple
- @ Mention — Cyan
- 🎪 Event — Amber
- 🏆 Achievement — Gold

**Unread rows:** slightly brighter background or left-edge accent bar
**Read rows:** normal

---

### SETTINGS

---

#### 4.25 Settings Screen

**Purpose:** Account management and preferences

**Layout (list-based, grouped sections):**

```
[User avatar + name + "Student"]
Edit Profile →

──── Privacy ────────────────────
Public Account              [toggle]
Activity Status             [toggle]
Allow Tagging               [toggle]
Leaderboard Visibility      [toggle]

──── Appearance ─────────────────
Theme     Dark ◉  Light ○       [toggle/segmented]

──── Security ───────────────────
Change Password             →
Two-Factor Authentication   [toggle]
Active Sessions             →

──── Account ────────────────────
[Logout]                 ← danger color
[Delete Account]         ← danger color
```

**Theme toggle** — when switched, every screen immediately changes. This is a signature interaction — consider a brief cross-fade or ripple effect across the UI.

---

## 5. Key User Journeys

These are the most important flows to design end-to-end:

### Journey 1 — First-Time User
```
Download → Splash → Onboarding (3 slides) → Welcome → Register → OTP → Home Feed
```
Goal: Get the user from first launch to the Home Feed in under 3 minutes. Registration should feel fast.

### Journey 2 — Daily Return Visit
```
App open → Splash → Home Feed
→ Claim Daily Reward (XP particle animation)
→ Check streak (tap streak card)
→ Scroll feed, like/comment on posts
→ Play a quick game
→ Check wallet balance
```
Goal: A satisfying 10-minute loop that rewards them for returning.

### Journey 3 — Creating & Sharing Content
```
Home → Tap FAB [⊕] → CreatePostModal → Add text + hashtag → Post
→ See post appear in feed → Get likes → Earn XP
```

### Journey 4 — Playing a Game
```
Games tab → Browse games → Tap "Chess" → Game card → Choose mode (vs Bot)
→ Play Now → 3..2..1..GO! → Game plays → Win result → XP awarded
→ See XP in wallet
```

### Journey 5 — Cashing Out
```
Wallet tab → See XP balance → Tap "Convert XP"
→ Enter 1000 XP → Confirm → Cash balance updates
→ Tap "Withdraw" → Enter ₹10 → Link UPI → Withdraw
→ Success confirmation
```

---

## 6. Reusable Components to Design

Design these once — they appear across multiple screens:

| Component | Where Used | Key Variants |
|-----------|-----------|-------------|
| **Post Card** | Home, Bookmarks, Community, Profile | Default, Liked, Saved, With media, Without media |
| **Button** | Everywhere | Primary (gradient), Secondary (outline), Ghost, Danger, Disabled, Loading |
| **Text Input** | Auth forms, Search, Post composer | Resting, Focused, Error, With icon, Password |
| **Bottom Sheet Modal** | Streak, Wallet modals, Game history | Various content, consistent chrome (handle, title, close) |
| **XP Progress Bar** | Profile, User Profile | Full width version |
| **Badge Card** | Profile, User Profile | Gold, Purple, Cyan, Green, Locked |
| **Story Avatar** | Home feed story row | Own story, Unseen, Seen |
| **Notification Row** | Notifications screen | 6 type variants, Read/Unread |
| **Transaction Row** | Wallet | Earn, Spend, Convert, Withdraw |
| **Game Card** | Games hub | Hot badge variant, Normal |
| **Community Card** | Community screen | Joined, Not joined, Private badge |
| **Event Card** | Events screen | Normal, Featured (larger), Live badge |
| **Tab Bar** | All main screens | 6 tabs, active/inactive states, FAB |

---

## 7. States Every Screen Must Handle

For each screen, design these states:

### Content States
| State | Description |
|-------|-------------|
| **Default / Loaded** | Normal data visible |
| **Empty** | No data yet (new user, no bookmarks, no posts, etc.) |
| **Loading** | Skeleton screens or spinners while fetching |
| **Error** | Network fail or something went wrong |
| **Filtered/Empty filter** | Active filter returns 0 results |

### Interactive States for Components
| Element | States |
|---------|--------|
| Buttons | Default, Pressed (active), Disabled, Loading |
| Text inputs | Resting, Focused, Filled, Error |
| Toggle switches | On, Off, Disabled |
| Chips / filters | Unselected, Selected |
| Action buttons (like, save) | Default, Active |
| Follow button | Not following, Following, Loading |
| Register button | Default, Registered, Loading |

---

## 8. Gamification Design Language

Gamification is at the heart of TADDLEBOX. The design should reinforce this at every touchpoint.

### XP & Rewards
- XP amounts should always appear in **gold (#FBBF24)** with a ⚡ prefix
- Cash amounts should appear in **green (#10B981)** with ₹ prefix
- Win states → green glow, celebration iconography
- Loss states → soft red, not demoralizing

### Progress Indicators
- Progress bars should never look empty or sad — even 0% should feel like a starting line, not a void
- Use gradient fills (purple → cyan) on all progress bars
- Completion should feel rewarding — a brief pulse/glow animation when a bar fills

### Badges
- Locked badges: 40% opacity with a lock icon overlay
- Unlocked badges: full color with subtle glow
- Gold badges > Purple > Cyan > Green (visual weight hierarchy)

### Leaderboard
- Top 3 positions: 🥇🥈🥉 podium treatment — they're special
- The user's own row should be highlighted even if not in top 3
- Rank numbers in gold for positions 1–3, silver for 4–10, grey beyond

### Streaks
- 🔥 fire emoji is the streak symbol — use it consistently
- Streak count should feel like a "score" — bold, prominent
- Streak break (not yet designed — future feature) should have careful UX to not be demoralizing

### Animations to Commission
These should be designed as animation specs for the development team:

| Animation | Trigger | Description |
|-----------|---------|-------------|
| XP Particle Fly | Claim reward | Pill flies from reward card → XP mini-card |
| XP Card Bounce | Particle arrival | Card springs 1.4× then back |
| Icon Bounce | Claim button tap | Gift icon scales up then returns |
| Float Text | XP earn | "+50 XP" rises and fades |
| Countdown Pulse | 3–2–1 | Number scales with spring |
| Result Card Spring | Win/Loss | Card scales from 0→1 with spring |
| Story Progress | Story auto-advance | 5s linear progress bar per story |
| Drawer Slide | Menu open | Panel slides from left |

---

## 9. What the Design Team Decides

The current prototype establishes structure and logic, but these visual/UX decisions are entirely open for the design team:

### Open Design Decisions

**Layout & Structure:**
- [ ] Should the header have a blur/frosted glass effect as content scrolls behind it?
- [ ] Should the bottom tab bar also have a blur effect?
- [ ] Should the Home feed use infinite scroll or paginated loading?
- [ ] Card grid vs. card list in Community browse screen?
- [ ] Should Story avatars be circular or square (Instagram vs. Snapchat style)?

**Visual Language:**
- [ ] Custom icon set or refined Ionicons usage?
- [ ] Should gradients be directional (left→right, top→bottom, diagonal)?
- [ ] Avatar system — should users pick emoji avatars, upload photos, or both?
- [ ] Should there be a consistent illustration style across empty states?
- [ ] Microinteraction style for likes — explosion of hearts? Color fill? Ripple?

**Typography:**
- [ ] Custom typeface or system fonts?
- [ ] Should headlines use a display/display font for personality?
- [ ] Font pairing for headings vs. body?

**Dark / Light Theme:**
- [ ] Should Light mode use a pure white or a very slightly tinted white?
- [ ] Should brand gradients change in light mode or stay the same?
- [ ] Is there a "system" theme option that follows device settings?

**Onboarding:**
- [ ] Should slide illustrations be custom artwork or emoji-based?
- [ ] Should there be a brief "what you just did earns you XP" tutorial overlay on first use?

**Gamification Moments:**
- [ ] Should level-up trigger a full-screen celebration overlay?
- [ ] Should earning a badge show a notification toast or a celebratory modal?
- [ ] Should there be haptic feedback patterns (vibration) on key reward moments?

**Navigation:**
- [ ] Should the FAB (⊕) button be in the center of the tab bar or floating above it?
- [ ] Should the active tab be indicated by an icon + label, or icon + dot?

---

## Deliverables Expected from Design Team

Please provide designs in the following order (priority high → low):

**Phase 1 — Core Screens (must-have)**
1. Home Feed (with all sub-components: header, mini-cards, story row, spotlight, reward card, post feed)
2. Post Card component (all states and variants)
3. Bottom Tab Bar with FAB
4. Games Screen (lobby, playing, result phases)
5. Wallet Screen

**Phase 2 — Social & Discovery**
6. Community Browse + Community Detail
7. Events Screen
8. Profile Screen (own and other user)
9. Notifications Screen

**Phase 3 — Auth & Secondary**
10. Splash + Onboarding + Welcome
11. Registration (3 steps) + OTP
12. Login + Forgot Password
13. Settings Screen

**Phase 4 — Component Library**
14. Full component library (buttons, inputs, cards, modals, chips, badges)
15. Icon usage guide
16. Color palette + usage rules
17. Animation specs for development

---

## Questions to Resolve Before Design Starts

1. What is the official app icon design? (Required for splash + brand consistency)
2. Do we have a custom logo type for "TADDLEBOX" or is it all-caps system font?
3. Are illustrations being custom-made or will we use Lottie animations / emoji?
4. What is the light theme priority? (Is dark mode the only deliverable for v1?)
5. Are there brand guidelines (colors, logo, typeface) already established?
6. Is there a Figma/design system template to start from?

---

*This document is the single source of truth for the product's screens and features. If any feature is unclear or seems to be missing context, please flag it before design work begins.*
