# TADDLEBOX — Mobile Application

TADDLEBOX is a modern React Native application built with **Expo SDK 57**, **Expo Router**, and a strict, enterprise-grade modular architecture.

---

## 🏗️ Architecture Mental Model

The codebase is organized into strict, decoupled layers enforcing a one-way dependency rule:

$$\text{app (routing)} \longrightarrow \text{shell} \longrightarrow \text{features} \longrightarrow \begin{cases} \text{design-system} \\ \text{shared} \\ \text{infrastructure} \end{cases}$$

```text
src/
├── app/             # Expo Router route hierarchy ONLY (thin route adapters)
├── shell/           # Global app chrome (headers, drawer, tab bar, error boundaries, root providers)
├── features/        # Business domain slices (isolated logic, state, screens, UI, API)
├── design-system/   # Shared UI tokens (colors, typography, spacing) and design primitives
├── shared/          # Generic cross-domain utilities, DTO types, and shared bus/state
└── infrastructure/  # Platform APIs, storage, websockets, networking, device sensors, and config
```

### Dependency Guardrail
- **`app/`** only mounts shell components and feature screens.
- **`features/`** can consume `design-system`, `shared`, and `infrastructure`, but **never** imports from other features directly or from `app/`.
- **`shared/`**, **`design-system/`**, and **`infrastructure/`** are leaf layers and **never** import from `features/` or `shell/`.
- Validated via `npm run check:architecture`.

---

## 📁 Repository Structure

```text
taddlebox-app/
├── app-updater/         # In-app APK self-updater (isolated for sideload/direct builds)
├── assets/              # Static assets (categorized: icons/, images/, splash/)
├── docs/                # Architecture, design, and product specifications
├── scripts/             # Build orchestration, Babel gates, and architecture verification
└── src/
    ├── app/             # File-based routing (Expo Router)
    │   ├── _layout.tsx  # Root navigation layout
    │   ├── (auth)/      # Authentication route group (login, signup, otp, onboarding)
    │   └── (main)/      # Main authenticated app tabs & child stacks
    │       ├── home/
    │       ├── community/
    │       ├── events/
    │       ├── games/
    │       └── profile/
    ├── design-system/   # UI kit and visual tokens
    │   ├── components/  # Button, Input, ThemedAlert, PinPad, FeedSkeleton
    │   ├── theme/       # ThemeProvider and color mode hooks
    │   └── tokens/      # colors, typography, spacing, radius, shadows
    ├── features/        # Autonomous business domains
    │   ├── auth/        # Authentication, session validation, local auth
    │   ├── chat/        # Direct & group messaging, realtime chat client
    │   ├── community/   # Community feeds, moderation, member management
    │   ├── events/      # Live & upcoming event discovery and RSVP
    │   ├── feed/        # Central home feed, story bar, content cards
    │   ├── games/       # Host container, runtime registry, and game engines
    │   │   ├── host/    # GameBridge, GameContainer.native, GameContainer.web
    │   │   └── runtime/ # Chess, Ludo, Memory Grid, Scribble, Snake & Ladder, etc.
    │   ├── notifications/# Push & in-app notification center
    │   ├── posts/       # Comments, bookmarks, hashtags, media creation
    │   ├── profile/     # User profile, tabs, edit profile
    │   ├── progression/ # Leaderboards, XP levels, streaks, gamification system
    │   ├── reels/       # Short-form vertical video player & reel preloading
    │   ├── search/      # Universal search across content, users, and tags
    │   ├── settings/    # Account security, terms, and privacy settings
    │   ├── users/       # Active presence status, location, user profiles
    │   └── wallet/      # In-app wallet balances, coin transactions
    ├── infrastructure/  # Platform & networking integrations
    │   ├── api/         # Axios API client and backend URL resolver
    │   ├── config/      # App configuration and runtime version metadata
    │   ├── location/    # Location service (native + web twins)
    │   ├── logging/     # Centralized logger
    │   ├── media/       # Lottie animation handler
    │   ├── notifications/# Push notification services (native + web twins)
    │   ├── storage/     # SecureStore encrypted keychain (native + web twins)
    │   └── websocket/   # Realtime sockets (account-socket, chat-socket, device-socket)
    ├── shared/          # Reusable domain-agnostic utilities & contracts
    │   ├── components/  # SectionChrome, etc.
    │   ├── state/       # React Query client, notification bus, screen params
    │   ├── types/       # Global DTO contracts and socket event maps
    │   └── utils/       # URL allowlists, native bypass, content formatters
    └── shell/           # Application envelope
        ├── components/  # MainHeader, SideDrawer, CustomTabBar, ErrorBoundaries
        ├── screens/     # Fallback system screens (ForceUpdate, LockScreen)
        └── providers.tsx# Root provider tree composer
```

---

## 📐 Naming Conventions

To maintain strict codebase consistency, all files adhere to the following naming matrix:

| Artifact | Convention | Example |
| :--- | :--- | :--- |
| **React Component** | `PascalCase.tsx` | `GameCard.tsx`, `StreakCard.tsx`, `WithTabBoundary.tsx` |
| **Custom React Hook** | `camelCase` starting with `use` | `useGameSocket.ts`, `useReelFeed.ts`, `useTheme.ts` |
| **Ordinary TS Module** | `kebab-case.ts` | `api-client.ts`, `local-auth.ts`, `session-validator.ts` |
| **API Client Modules** | `*.api.ts` | `auth.api.ts`, `events.api.ts`, `community.api.ts` |
| **TanStack Query Modules** | `*.queries.ts` | `feed.queries.ts`, `events.queries.ts` |
| **TanStack Mutation Modules** | `*.mutations.ts` | `events.mutations.ts`, `community.mutations.ts` |
| **TypeScript Types** | `*.types.ts` | `game-runtime.types.ts`, `progression.types.ts` |
| **Pure Logic Modules** | `*.logic.ts` | `streak.logic.ts` |
| **Style Modules** | `*.styles.ts` | `GamesScreen.styles.ts`, `SearchScreen.styles.ts` |
| **Platform Twins** | `*.native.ts(x)` / `*.web.ts(x)` | `GameContainer.native.tsx`, `secure-store.web.ts` |
| **Expo Router Special Files**| Router convention | `_layout.tsx`, `index.tsx`, `[id].tsx`, `[slug].tsx` |

### Feature Folder Pluralization Standard
- **Plural** for multi-item collections/entities: `events`, `games`, `notifications`, `posts`, `users`.
- **Singular** for conceptual domains or systems: `auth`, `chat`, `community`, `feed`, `profile`, `progression`, `reels`, `search`, `settings`, `wallet`.

---

## 🚀 Quick Start

### 1. Installation
Always use `npx expo install` so dependencies align with Expo SDK compatible versions:

```bash
# Clean install (if needed)
rm -rf node_modules package-lock.json

# Install dependencies
npx expo install
```

### 2. Running Locally
Start the Expo Metro bundler:

```bash
# Standard local development (phone on same Wi-Fi / LAN)
npx expo start -c

# Tunnel mode (when testing across different networks / mobile data)
npx expo start -c --tunnel
```

- **Android Emulator**: Press `a` in the terminal.
- **iOS Simulator**: Press `i` in the terminal (macOS only).
- **Physical Device**: Open the [Expo Go](https://expo.dev/client) app and scan the terminal QR code.

---

## 🛠️ Verification & Quality Checks

Run these commands to validate type safety and architectural invariants:

```bash
# TypeScript compilation check (0 errors expected)
npm run typecheck

# Verify dependency direction and layer guardrails
npm run check:architecture

# Verify updater isolation (ensures no self-updater code in store builds)
npm run verify:updater-gate
```

---

## 🎨 Design System & Theme

The app features a tailored design system configured in `src/design-system/`:

| Token | Default Value | Usage |
| :--- | :--- | :--- |
| `primary` | `#7C3AED` | Primary actions, branding, active highlights |
| `cyan` | `#06B6D4` | Accent gradients, gaming glows |
| `xpGold` | `#FBBF24` | XP progress, badges, streak indicators |
| `bg.base` | `#070714` | Main screen background |
| `bg.card` | `#13132E` | Card containers, modals, elevated surfaces |
| `text.primary` | `#F1F5F9` | High-contrast readable typography |

Access tokens and theme utilities via:
```tsx
import { useTheme } from "../design-system";
// or
import { colors, spacing, radii } from "../design-system";
```

---

## 📦 Build & Release Pipelines

- **Direct APK (Sideload / In-App Updater)**:
  ```bash
  npm run build:android:direct:local
  ```
  Generates APKs enabled with the in-app updater capability (`app-updater/`).
- **Google Play Store / Production**:
  ```bash
  npm run build:android:store:cloud
  ```
  Babel strips updater code from store builds to remain 100% Google Play Store policy compliant.
