# TADDLEBOX — UI/UX Document

> Version 1.0 · React Native (Expo) · Platform: iOS & Android

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Design System — Colors](#2-design-system--colors)
3. [Design System — Typography](#3-design-system--typography)
4. [Design System — Spacing & Radii](#4-design-system--spacing--radii)
5. [Component Library](#5-component-library)
6. [Screen-by-Screen UX](#6-screen-by-screen-ux)
7. [Navigation & Flow](#7-navigation--flow)
8. [Animation & Motion](#8-animation--motion)
9. [Interaction Patterns](#9-interaction-patterns)
10. [Theme System (Dark / Light)](#10-theme-system-dark--light)
11. [Accessibility Considerations](#11-accessibility-considerations)

---

## 1. Design Philosophy

TADDLEBOX targets college students aged 18–25. The design reflects the energy, ambition, and social nature of campus life.

### Core Design Principles

**1. Gamified & Rewarding**
Every meaningful action is visually acknowledged. XP flies to counters, cards bounce, streaks glow. The UI reinforces the sense of progress and reward.

**2. Dark-First, Vibrant**
The default dark theme uses a deep space aesthetic (`#070714` base) with electric purples, cyans, and golds as accent colors. This creates high contrast and visual excitement appropriate for gaming and social contexts.

**3. Layered Depth**
Three surface levels (base → card → elevated) create visual hierarchy. Cards float above the background, modals float above cards. Subtle glass effects add sophistication.

**4. Touch-Friendly & Dense**
Tap targets are minimum 40×40px. The layout is information-dense but never cluttered — spacing scales are used consistently to breathe.

**5. Motion as Feedback**
Animations are purposeful: they confirm actions (claim → particle fly), guide attention (countdown scale), or ease transitions (modal slide). Nothing animates without reason.

---

## 2. Design System — Colors

### 2.1 Dark Theme (Default)

```
Background Layers:
  bg.base      #070714    — Root screen background
  bg.surface   #0D0D1F    — Modal / sheet backgrounds
  bg.card      #0F0F24    — Card backgrounds
  bg.elevated  #151530    — Elevated / chip backgrounds

Brand Colors:
  primary      #7C3AED    — CTA buttons, active states, XP accents
  primaryLight #A78BFA    — Text highlights, secondary accents
  primaryDark  #4C1D95    — Gradient bottom / hover

  cyan         #06B6D4    — Secondary brand color, progress fills
  cyanLight    #67E8F9    — Light cyan highlights
  cyanDark     #0891B2    — Gradient pairing with primary

XP / Reward Colors:
  xpGold       #FBBF24    — XP amounts, streak counts, rewards
  xpOrange     #F59E0B    — XP gradient pair

Semantic Colors:
  success      #10B981    — Win states, positive amounts, verified
  danger       #EF4444    — Loss states, negative amounts, errors
  warning      #F59E0B    — Caution states
  pink         #EC4899    — Like actions, love/heart interactions

Text Colors:
  text.primary   #F1F0FF  — Main readable text
  text.secondary #A09FBF  — Supporting text, timestamps
  text.muted     #5A5880  — Placeholders, disabled, labels

Border Colors:
  border       rgba(255,255,255,0.06)  — Subtle card outlines
  borderHover  rgba(255,255,255,0.12)  — Interactive border on focus

Glass Effects:
  glass        rgba(255,255,255,0.04)  — Frosted glass backgrounds
  glassBorder  rgba(255,255,255,0.08)  — Glass border
```

### 2.2 Light Theme

```
Background Layers:
  bg.base      #F8F7FF    — Root screen background (near white, purple tint)
  bg.surface   #FFFFFF    — Modal / sheet backgrounds
  bg.card      #F1F0FF    — Card backgrounds
  bg.elevated  #E8E7F8    — Elevated / chip backgrounds

Brand Colors (same hues, adjusted for light):
  primary      #7C3AED    — Unchanged (sufficient contrast on light)
  primaryLight #6D28D9    — Darker for light backgrounds
  cyan         #0891B2    — Darker for light backgrounds

Text Colors (inverted):
  text.primary   #1A1740  — Dark text on light backgrounds
  text.secondary #4B4870  — Medium dark
  text.muted     #8B88B0  — Lighter muted

Border Colors:
  border       rgba(0,0,0,0.08)   — Subtle dark outlines
  borderHover  rgba(0,0,0,0.15)   — Active border
```

### 2.3 Gradient Patterns

Gradients are used extensively throughout the app to add energy and visual hierarchy:

| Usage | Gradient |
|-------|----------|
| Primary CTA button | `#7C3AED` → `#0891B2` (left to right) |
| XP gold elements | `#FBBF24` → `#F59E0B` |
| Hero backgrounds | `rgba(124,58,237,0.28)` → `transparent` (top to bottom) |
| Community banners | Category-specific dark gradients (e.g. `#2a0a5e` → `#0a1f5e` for Tech) |
| Profile avatar | `primary` → `cyanDark` |
| Level badge | `xpGold` → `xpOrange` |
| Win result card | `rgba(16,185,129,0.15)` → `rgba(6,182,212,0.08)` |
| Loss result card | `rgba(239,68,68,0.15)` → `rgba(180,53,53,0.05)` |

---

## 3. Design System — Typography

Font family: System default (San Francisco on iOS, Roboto on Android)

```
fontSizes:
  xs        10px   — Labels, badges, meta
  sm        13px   — Supporting text, chips, timestamps
  md        15px   — Body text, card content
  lg        17px   — Subheadings, stat values
  xl        20px   — Section headers
  xxl       24px   — Screen titles
  display   42px   — Hero numbers, splash text
```

**Weights used:**
- `400` — Body text
- `600` — Supporting headings, labels
- `700` — Section titles, emphasis
- `800` — Stats, values, names
- `900` — Logo ("TADDLEBOX"), display text

**Text transformations:**
- `uppercase` with `letterSpacing: 0.5` for section labels
- Numeric displays use `toLocaleString()` for comma-formatted large numbers

---

## 4. Design System — Spacing & Radii

### Spacing Scale

```
spacing:
  xs      4px
  sm      8px
  md      12px
  lg      16px
  xl      20px
  xxl     24px
  xxxl    32px
```

Consistent usage:
- Screen horizontal padding: `spacing.lg` (16px) or `spacing.xl` (20px)
- Card internal padding: `spacing.md` (12px)
- Stack gap between elements: `spacing.sm` (8px)
- Section margin bottom: `spacing.md` to `spacing.lg`

### Border Radii

```
radii:
  sm      8px    — Chips, small badges
  md      12px   — Cards, inputs, buttons
  lg      16px   — Modal sheets, info cards
  xl      24px   — Bottom sheets (top corners)
  full    9999px — Pills, avatar circles, dots
```

---

## 5. Component Library

### 5.1 Button

**Variants & Gradients:**

| Variant | Gradient / Color | Usage |
|---------|-----------------|-------|
| primary | `primary → cyanDark` | Main CTAs |
| cyan | `cyan → cyanDark` | Secondary actions |
| xp | `xpGold → xpOrange` | XP-related actions |
| ghost | `transparent + border` | Tertiary actions |
| danger | `#DC2626 → #B91C1C` | Destructive actions |
| success | `#059669 → #047857` | Confirmation |

**Sizes:**
- `sm`: padding 8×16, font 12px
- `md`: padding 12×20, font 14px (default)
- `lg`: padding 14×28, font 16px

**States:** loading (spinner), disabled (opacity 0.5), fullWidth

### 5.2 Input

- Background: `bg.elevated`
- Border: 1px `border` (resting), `primaryLight` (focused)
- Left icon: Ionicons icon in `text.muted`
- Error: red border + red error text below
- Password: right eye icon toggles visibility
- Label: above input, `text.secondary`, `fontSizes.sm`

### 5.3 PostCard

Visual structure (top to bottom):
```
┌─────────────────────────────────────────┐
│ [Avatar] Name · @handle · timestamp     │
│          [Community pill] [XP pill]     │
├─────────────────────────────────────────┤
│ Post content text (1-3 lines)           │
├─────────────────────────────────────────┤
│ [Media banner if present]               │
│ (emoji image or actual photo, 1:1/16:9) │
├─────────────────────────────────────────┤
│ ❤️ 42   💬 8   🔗 Share   🔖 Save      │
└─────────────────────────────────────────┘
```

- Background: `bg.card`
- Border: 1px `border` (bottom only, between cards)
- Community pill: colored background chip (`rgba(color, 0.15)`)
- XP pill: gold background `rgba(251,191,36,0.15)`
- Action icons: `text.muted` (resting), `pink` (liked), `primary` (saved)

### 5.4 Mini Card (Home Header)

```
┌────────────────────┐
│ 🔥  7 Days         │
│     Streak      〉 │
└────────────────────┘
```
- Flex 1 (equal width, side by side)
- Background: `rgba(color, 0.08)`, border: `rgba(color, 0.22)`
- Streak card: amber tint | XP card: purple tint
- Spring animation on XP card when reward is claimed

### 5.5 CustomTabBar

```
┌──────────────────────────────────────────────────┐
│ 🏠    👥    🎪  [⊕FAB]  🎮    💰    👤           │
│Home  Comm Events       Games Wallet Profile      │
└──────────────────────────────────────────────────┘
```
- Background: `bg.surface` with top border
- Active tab: filled icon + `primaryLight` color + underline dot
- Inactive tab: outline icon + `text.muted`
- FAB: 52×52 gradient circle, floating above tab bar, opens CreatePostModal
- Safe area padding respected

### 5.6 XP Progress Bar

```
[LVL 12]════════════════════●────── [NEXT]
Pioneer                  9,240 / 12,000 XP
```
- Level circle: gradient (gold → orange), white level number
- Progress bar: gradient fill (purple → cyan) with glow dot at head
- Background track: `rgba(255,255,255,0.07)`
- Rank text: `text.secondary`, centered

### 5.7 Side Drawer

- Slide from left, 80% screen width
- Backdrop: `rgba(0,0,0,0.55)` semi-transparent
- Header: user gradient avatar + name + handle
- Menu items: icon + label + optional badge
- Smooth 280ms transition (delayed to prevent animation flicker)

### 5.8 StoryRow

- Story avatar: 60px circle
- Ring colors:
  - Own story: dashed grey outline
  - Unseen: LinearGradient ring (purple → pink)
  - Seen: solid grey ring
- Username: 10px text below avatar, centered, 1 line

### 5.9 SpotlightCarousel

- Card width: ~85% screen width
- Snap to center
- Gradient card background per item
- Dot indicators below: `text.muted` (inactive), `primaryLight` (active)
- Horizontal padding so adjacent cards peek

### 5.10 DailyRewardCard

- Full-width card in feed, between spotlight and posts
- Two states: unclaimed (amber tint) → claimed (green tint) → gone
- Progress track: 70% → 100% fill on claim
- Claim button: gold pill, `#1A0A00` text (dark on gold)

---

## 6. Screen-by-Screen UX

### 6.1 Splash Screen

| Element | Behavior |
|---------|----------|
| Logo | Fades in and scales up with bounce |
| Tagline | Fades in after logo |
| Glow ring | Slow pulsing opacity |
| Transition | Auto after 2.5s → Onboarding (fade) |

### 6.2 Onboarding Carousel

| Element | Behavior |
|---------|----------|
| Slides | Snap scrolling, paginated |
| Emoji | Large centered illustration per slide |
| Progress dots | Animated width change on active dot |
| Next button | Advances or goes to Welcome on last slide |
| Skip | Top-right shortcut to Welcome |

### 6.3 Home Screen

**Information Hierarchy:**
1. Header (status + navigation)
2. Mini cards (quick stats — streak + XP)
3. Stories (ephemeral social content)
4. Spotlight (featured/promoted content)
5. Trending chips (content filter)
6. Daily reward (time-sensitive gamification)
7. Post feed (core social content)

**Scroll behavior:** Full page scrolls. Header and mini-cards are pinned above the ScrollView. Stories and everything below scroll.

### 6.4 Game Play Modal

**Phase UX:**
```
Lobby ──────────────────────► Countdown ──► Playing ──► Result
(choose mode + start game)   (3-2-1-GO!)   (live board)  (win/loss)
```

- Lobby: bottom sheet style inside a fullscreen modal
- Countdown: centered, full black background, pulsing number scale
- Playing: header with score, scrollable game board area
- Result: card springs in from scale 0→1 with opacity

### 6.5 Wallet Screen

**Visual hierarchy:**
1. Balance cards (most prominent — full-width, gradient)
2. Quick actions (earn more grid)
3. Transaction filter chips
4. Transaction list

Color coding in transactions:
- XP transactions: gold amount text
- Positive cash: green
- Negative cash (spend/withdraw): red

### 6.6 Community Detail

**Sticky header pattern:**
- Banner image is part of scroll content
- Info card overlaps banner by 20px (negative marginTop)
- Filter tabs become sticky (stickyHeaderIndices) when scrolled past

### 6.7 Settings Screen

Clean list-based layout with section headers:
- Each setting row: icon + label + (Toggle switch | Chevron | Value label)
- Destructive actions (logout, delete account) use `danger` color and appear at bottom
- Theme toggle has instant visual effect

---

## 7. Navigation & Flow

### 7.1 User Flow Diagram

```
App Start
    │
    ▼
Splash (2.5s)
    │
    ▼
Onboarding Carousel ──Skip──► Welcome
    │                              │
    ▼                              │
  Welcome ◄──────────────────────►│
    │
    ├──► Login ──► OTP ──► Main App
    │
    └──► Register (3 steps) ──► OTP ──► Main App

Main App (Bottom Tabs)
    │
    ├── Home ──► Notifications
    │        ──► Comments (from post card)
    │        ──► UserProfile (from author tap)
    │        ──► StoryViewer (from story avatar)
    │        ──► Bookmarks (from drawer)
    │        ──► Settings (from drawer)
    │
    ├── Community ──► CommunityDetail
    │
    ├── Events
    ├── Games (fullscreen GamePlayModal within)
    ├── Wallet (modals within: Withdraw, LinkUPI, Convert, History, Settings)
    └── Profile
```

### 7.2 Tab Switching
- `lazy: false` on MainNavigator — all tabs are pre-mounted
- Prevents wallet screen flicker on first visit
- Each tab remembers its own navigation state

### 7.3 Transition Animations

| Transition | Animation |
|------------|-----------|
| Auth stack pushes | slide_from_right |
| Onboarding/Welcome | fade |
| Main ↔ Auth | fade (via RootNavigator) |
| StoryViewer | fade + gesture disabled |
| Modals | slide (from bottom) |
| Side Drawer | custom translateX + opacity backdrop |
| GamePlayModal | fullScreen slide |

---

## 8. Animation & Motion

### 8.1 Animation Inventory

| Animation | Duration | Type | Purpose |
|-----------|----------|------|---------|
| Splash logo appear | 600ms | Spring | Brand entry |
| Onboarding dot active | 300ms | Timing | Position indicator |
| Story progress bar | 5000ms per story | Timing (linear) | Story duration |
| Story pause | instant | setValue | Feedback |
| XP claim icon bounce | 400ms | Spring | Reward feedback |
| XP claim float text | 900ms up + 300ms fade | Timing | XP amount rise |
| XP card exit (claim) | 420ms | Timing | Card removal |
| XP particle fly | 700ms | Timing (parallel x+y) | Fly to destination |
| XP card bounce | 2× Spring | Spring | Arrival feedback |
| Countdown number | 900ms | Spring (1→1.4→1) | Countdown emphasis |
| Game result card | Spring | Spring (scale 0→1) | Win/loss reveal |
| Drawer slide in | 280ms (delay) | Custom | Navigation transition |
| Drawer backdrop | 250ms | Opacity | Focus overlay |
| Modal (bottom sheet) | Built-in | slide | Standard modal pattern |

### 8.2 Animation Principles

**Native Driver (`useNativeDriver: true`)**
All animations use the native driver where possible (transform, opacity). This offloads animation to the native thread for 60fps performance even during JS work.

**Spring vs Timing**
- `Animated.spring`: Physical feel, overshoots then settles. Used for: bounces, scale reveals, reaction feedback.
- `Animated.timing`: Precise duration. Used for: particles, fade-outs, linear progress.
- `Animated.sequence`: Chained animations. Used for: countdown 3→2→1, result reveal sequence.
- `Animated.parallel`: Simultaneous animations. Used for: particle X+Y travel, card fade+slide.

**Animation Choreography — XP Claim Sequence**
```
t=0ms    User taps Claim
t=0ms    Icon bounce begins (spring)
t=0ms    "+50 XP" float text rises (900ms)
t=0ms    Particle fires from claim button → XP card (700ms)
t=700ms  Particle arrives → XP card spring 1.4× → returns to 1.0
t=700ms  Particle fades (200ms)
t=1800ms Card fades + slides down (420ms)
t=2220ms Card unmounts (setGone(true))
```

### 8.3 Non-Animation Motion

- **Pull-to-refresh**: Native RefreshControl with themed tint color
- **Scroll snap**: SpotlightCarousel uses `snapToInterval` for satisfying swipe
- **Keyboard avoidance**: CommentsScreen uses KeyboardAvoidingView for text input

---

## 9. Interaction Patterns

### 9.1 Touch Feedback

| Component | `activeOpacity` | Effect |
|-----------|----------------|--------|
| Post actions (like, save) | 0.7 | Subtle darken |
| Cards | 0.8 | Light darken |
| Tab bar items | 0.85 | Minimal |
| Primary CTA buttons | 0.85 | Darken |
| Story avatars | default | No feedback (story opens) |

### 9.2 Optimistic Updates

Actions update the UI immediately without waiting for a server response:
- **Like/Unlike**: Count changes instantly; icon fills/unfills
- **Save/Unsave**: Bookmark fills/unfills; post appears/disappears in Bookmarks
- **Join/Leave Community**: Button state and member count update immediately
- **Follow/Unfollow**: Follower count updates + button text changes instantly

### 9.3 Form Validation

- Inline errors appear below each field
- Error borders highlight on invalid fields
- Submit buttons disabled until required fields are valid
- Real-time feedback (e.g. UPI ID regex as user types)

### 9.4 Empty States

Each screen has a styled empty state:
- Large emoji illustration
- Title ("No posts yet", "No bookmarks yet", etc.)
- Description copy
- CTA button where applicable

### 9.5 Loading States

- Button loading: spinner replaces label text
- Pull-to-refresh: native spinner at top of ScrollView
- OTP verify: 1.5s mock async to simulate network

### 9.6 Modal Patterns

**Bottom Sheet (StreakModal, WalletModals)**
- Full-screen modal with transparent background
- Backdrop (`rgba(0,0,0,0.55)`) behind sheet — tap to dismiss
- Sheet has rounded top corners (`radii.xl`)
- Handle indicator bar (38×4px) at top center
- Content scrollable inside sheet

**Fullscreen Modal (StoryViewer, GamePlayModal)**
- `presentationStyle="fullScreen"` (StoryViewer: fade, Game: slide)
- No safe-area inset at bottom (edge-to-edge game board)
- Close button always accessible (top-left X or ← back)

**PageSheet Modal (HistoryModal, LeaderboardModal in Games)**
- `presentationStyle="pageSheet"` — covers ~90% from bottom
- Gesture-dismissible on iOS

### 9.7 Gesture Patterns

| Gesture | Screen | Action |
|---------|--------|--------|
| Pull down | Feed, lists | Refresh |
| Tap left half | StoryViewer | Previous story |
| Tap right half | StoryViewer | Next story |
| Press & hold | StoryViewer | Pause |
| Tap backdrop | Modals, Drawer | Close |
| Horizontal swipe | SpotlightCarousel | Advance card |
| Horizontal scroll | TrendChips, StoryRow, BadgeScroll | Browse |

---

## 10. Theme System (Dark / Light)

### 10.1 Architecture

The theme is managed by `ThemeContext` using React's Context API:

```tsx
ThemeContext = {
  isDark: boolean,
  colors: ColorPalette,   // DARK_COLORS | LIGHT_COLORS
  toggleTheme: () => void
}
```

Every component calls `useThemeColors()` to get the current palette. Styles are computed with `makeStyles(colors)` inside a `useMemo` hook so they recompute whenever the theme changes.

### 10.2 Color Palette Type

```ts
type ColorPalette = {
  bg: { base; surface; card; elevated }
  primary; primaryLight; primaryDark
  cyan; cyanLight; cyanDark
  xpGold; xpOrange
  success; danger; warning; pink
  text: { primary; secondary; muted }
  border; borderHover
  glass; glassBorder
}
```

### 10.3 makeStyles Pattern

All screens and components use this pattern:

```tsx
function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg.base },
    card: { backgroundColor: c.bg.card, borderColor: c.border },
    title: { color: c.text.primary },
    // ... all color-dependent styles use c.xxx
  });
}

function MyScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // ...
}
```

Styles that don't depend on colors (dimensions, flexbox, static sizes) are still defined in the same StyleSheet for a single source of truth.

### 10.4 Theme-Aware vs. Intentionally Fixed

Some elements intentionally remain dark regardless of theme:

| Element | Color | Reason |
|---------|-------|--------|
| Game play board (`playModal`) | `#05050F` | Immersive game UX |
| Community/event banner gradients | Dark hex values | Visual design intent |
| Story gradient backgrounds | Dark gradients | Full-screen immersive |
| StatusBar in game | `style="light"` | Dark background always |

All other elements adapt to the current theme via `colors.xxx`.

### 10.5 StatusBar Handling

```tsx
<StatusBar style={isDark ? 'light' : 'dark'} />
```

Applied on every screen that doesn't have a fixed dark background. Ensures system status bar icons are readable against both light and dark backgrounds.

---

## 11. Accessibility Considerations

### 11.1 Touch Targets
- Minimum tap target size: 40×40px enforced on all icon buttons (`iconBtn: { width: 40, height: 40 }`)
- CTA buttons: full-width or minimum 120px wide
- Bottom tab items: auto-sized by RN to be sufficiently tall

### 11.2 Color Contrast
- Dark theme: white-ish text (`#F1F0FF`) on `#070714` base — high contrast
- Light theme: dark text (`#1A1740`) on `#F8F7FF` — high contrast
- Brand purple (`#7C3AED`) used primarily for interactive elements, not for readability-critical text

### 11.3 Text Sizing
- Minimum font size: 10px (`fontSizes.xs`) used only for badges/meta
- Primary readable content: 13–15px
- No dynamic font scaling currently implemented

### 11.4 Keyboard Handling
- `KeyboardAvoidingView` on CommentsScreen for text input
- `Platform.OS === 'ios' ? 'padding' : 'height'` behavior
- Inputs trigger soft keyboard; forms scroll to keep focused input visible

### 11.5 Loading & Error States
- All async operations show loading feedback (spinner or RefreshControl)
- Error messages are inline and descriptive (not just red borders)
- OTP resend timer prevents confusion about expired codes

### 11.6 Visual-Only Indicators
- Liked state: color change (grey → pink) + count increment — not icon-only
- Saved state: outline → filled bookmark
- Story seen: grey ring vs gradient ring — relies on color; could add opacity distinction
- Streak days: text label + icon (✓ or 🔥) — not color-only

---

## Appendix A — Screen Inventory

| Screen | File | Tab / Stack |
|--------|------|-------------|
| Splash | `auth/SplashScreen.tsx` | Auth |
| Onboarding | `auth/OnboardingScreen.tsx` | Auth |
| Welcome | `auth/WelcomeScreen.tsx` | Auth |
| Login | `auth/LoginScreen.tsx` | Auth |
| Register | `auth/RegisterScreen.tsx` | Auth |
| OTP | `auth/OTPScreen.tsx` | Auth |
| Forgot Password | `auth/ForgotPasswordScreen.tsx` | Auth |
| Home | `main/HomeScreen.tsx` | Home Stack |
| Notifications | `main/NotificationsScreen.tsx` | Home Stack |
| Comments | `main/CommentsScreen.tsx` | Home Stack |
| User Profile | `main/UserProfileScreen.tsx` | Home Stack |
| Story Viewer | `main/StoryViewerScreen.tsx` | Home Stack |
| Bookmarks | `main/BookmarksScreen.tsx` | Home Stack |
| Settings | `main/SettingsScreen.tsx` | Home Stack |
| Community List | `main/CommunityScreen.tsx` | Community Stack |
| Community Detail | `main/CommunityDetailScreen.tsx` | Community Stack |
| Events | `main/EventsScreen.tsx` | Direct Tab |
| Games | `main/GamesScreen.tsx` | Direct Tab |
| Wallet | `main/WalletScreen.tsx` | Direct Tab |
| Profile | `main/ProfileScreen.tsx` | Direct Tab |

## Appendix B — Component Inventory

| Component | File | Description |
|-----------|------|-------------|
| Button | `common/Button.tsx` | Multi-variant CTA button |
| Input | `common/Input.tsx` | Text input with label + icon + error |
| CreatePostModal | `common/CreatePostModal.tsx` | Post composer modal |
| PostCard | `home/PostCard.tsx` | Social post display card |
| StoryRow | `home/StoryRow.tsx` | Horizontal story avatars |
| XPProgressBar | `home/XPProgressBar.tsx` | Level + XP progress |
| SpotlightCarousel | `home/SpotlightCarousel.tsx` | Featured content slider |
| SideDrawer | `home/SideDrawer.tsx` | Slide-in nav drawer |
| CustomTabBar | `navigation/CustomTabBar.tsx` | Bottom tab + FAB |
| StreakCard | `gamification/StreakCard.tsx` | Daily streak display |

## Appendix C — Context Providers

| Context | Hook | Key State |
|---------|------|-----------|
| ThemeContext | `useTheme()` / `useThemeColors()` | isDark, colors |
| AuthContext | `useAuth()` | isLoggedIn |
| PostsContext | `usePosts()` | posts[], actions |
| CommunityContext | `useCommunities()` | communities[], actions |
| WalletContext | `useWallet()` | balances, transactions[], settings |
| GamesContext | `useGames()` | matches[], stats |
