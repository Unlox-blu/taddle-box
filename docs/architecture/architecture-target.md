# Taddlebox — Target Architecture (locked-in)

Mobile-first today; web via React Native Web / Expo Router; a dedicated Next.js web
app later — without rewriting the business layer.

## Ownership model

| Bucket | Question it answers | Owns |
|---|---|---|
| `features/` | What does the product do? | auth, feed, reels, posts, profile, search, chat, notifications, communities, events, wallet, gamification, games |
| `shared/` | Generic things used by multiple domains | components, hooks, utils, types, state |
| `design-system/` | What does Taddlebox look/feel like? | tokens, branded primitives, ThemeProvider |
| `shell/` | How is the application itself structured/presented? | app chrome + app-level screens |
| `infrastructure/` | How does the app talk to the outside world? | api, websocket, notifications, storage, logging, location, media, config |

## Dependency direction (one-way, enforced)

```
app / shell
    │
    ▼
features
  ↙   ↓   ↘
shared  design-system  infrastructure
```

- `features` → `shared` / `design-system` / `infrastructure`. Never upward.
- `features` may compose `shell` chrome (MainHeader, banners, StateBlock) into their
  screens, but never `navigation` or other app layers.
- `infrastructure` consumes `shared` (DTO types, utils) but never features or UI.
- `shared` and `design-system` never import features, shell, or navigation.
- Feature and shared logic never branch on `Platform.OS`. Platform differences are
  isolated in `.native.tsx` / `.web.tsx` twins (or inside `infrastructure`).
- Typical call chain: `Screen → feature hook → feature query/mutation → feature API
  → infrastructure API client → backend`.

Enforced by `npm run check:architecture` (scripts/verification/check-architecture.js).

## Near-term tree (single Expo app)

```text
src/
├── app/                      # Expo Router (Phase 5+; routes only, no business logic)
├── features/                 # auth, feed, reels, posts, profile, search, chat,
│                             #   notifications, communities, events, wallet,
│                             #   gamification, games
│   └── <feature>/
│       ├── api/  state/  logic/  hooks/  queries/  mutations/  components/
│       ├── screens/  types/  index.ts
├── shared/
│   ├── components/           # cross-feature building blocks (SectionChrome…)
│   ├── hooks/                # generic cross-domain hooks (empty until one exists)
│   ├── utils/                # content, mask, urlAllowlist, nativeBypass
│   ├── types/                # domain types (.types.ts modules + barrel)
│   ├── state/                # Loader/Scroll/Audio providers, reactQuery, queryKeys,
│   │                         #   notificationBus
│   └── constants/
├── design-system/
│   ├── components/           # pure branded primitives (Button, Input, ThemedAlert,
│   │                         #   PinPad, ControlledMentionsInput…)
│   ├── state/ThemeProvider.tsx
│   └── tokens/  colors.ts  spacing.ts  typography.ts  radius.ts  shadows.ts
├── infrastructure/
│   ├── api/  websocket/  config/  media/  logging/  location/  storage/
│   ├── notifications/        # push.native.ts / push.web.ts (+ push.ts base)
│   ├── storage/              # secureStore.native.ts / secureStore.web.ts (+ base)
│   ├── location/             # location.native.ts / location.web.ts (+ base)
│   └── (never features or UI)
└── shell/                    # application-level UI/chrome outside any business domain
    ├── components/           # MainHeader, NotificationBanner, AppErrorBoundary,
    │                         #   CustomTabBar, SideDrawer, StateBlock,
    │                         #   BrandedLoader, PullToRefreshWrapper, splash…
    ├── screens/              # ForceUpdate, Lock, Settings, Terms, Privacy,
    │                         #   ChangeEmail/Password/Phone
    └── providers.tsx
```

## Platform-split rules (`.native` / `.web`)

- `shell/` is **not** inherently platform-specific — it is *outside any business
  domain*. Most of it is plain cross-platform (`MainHeader.tsx`, `NotificationBanner.tsx`,
  `AppErrorBoundary.tsx`, `CustomTabBar.tsx`). Twins exist only where a concern genuinely
  differs per platform (today: infrastructure storage/push/location twins).
- For infrastructure twins (no tsconfig path aliases in this repo), TypeScript cannot
  resolve a suffixless import to `.native`/`.web` files, so each twin pair ships a
  thin **base module** (`secureStore.ts`, `push.ts`, `location.ts`) that re-exports the
  native twin for type-checking. Metro ignores the base on iOS/Android/web (it resolves
  `.native`/`.web` first); the base is never bundled.
  ```text
  infrastructure/storage/
  ├── secureStore.native.ts   # real Keychain/Keystore
  ├── secureStore.web.ts      # localStorage twin
  └── secureStore.ts          # base: re-exports native for tsc only
  ```
- Feature code imports the suffixless module (`import * as SecureStore from
  '../infrastructure/storage/secureStore'`); Metro + tsc each resolve what they need.
- Twins describe *implementation*, not meaning: `GameHost.tsx` (the universal
  runtime-driven game router) and `WebGameHost.tsx` (its WebView renderer for HTML5
  games) are parent/child, so they are **not** `.native`/`.web` twins.

## Next.js posture

- React Native Web is **not** a separate architecture: the same feature modules run
  on iOS/Android/web via Metro's `.native`/`.web` resolution.
- Next.js **is** a separate rendering environment with its own `app/` + shell layer.
  It will consume `features`, `shared`, `design-system` (logic, types, API clients,
  domain models, tokens) but its UI diverges where the web experience demands it,
  and it never consumes `.native.tsx` files.
- Share business domains and foundational UI where it makes sense; don't force
  identical presentation across mobile, RN Web, and Next.js.

## Migration phases

| Phase | What | Status |
|---|---|---|
| 0 | Baseline: typecheck snapshot (known errors), import-rewrite codemod | ✅ done |
| 1 | `design-system`: theme → tokens, ThemeContext → design-system/state | ✅ done |
| 2 | `infrastructure` + feature APIs: services split | ✅ done |
| 3 | `features`: contexts, hooks, queries, mutations, components, screens by domain | ✅ done |
| 4 | `shared` (types/utils/state) + layer guardrails (check-architecture) | ✅ done |
| 5 | Expo Router + web (`src/app/` routes, react-native-web) | ✅ done* |
| 6 | Monorepo extraction (`apps/` + `packages/`) — only when Next.js is a real app | deferred |

*Phase 5 landed: the whole route tree lives in `src/app/` (44 files), the app boots
on react-native-web, and `expo-router/entry` is the sole entry. Phase-5 hardening
passes are done: the legacy `navigationRef` is gone (notification deep links and the
banner now push expo-router hrefs), storage/push/location live in
`infrastructure/` with `.native`/`.web` twins + base modules, `logger` moved to
`infrastructure/logging`, app-level screens (Settings/Terms/Privacy/Change*) moved to
`shell/screens`, API/query/mutation/type modules follow the `.api`/`.queries`/
`.mutations`/`.types` suffix convention, and `check:layers` + tsc are clean.

Known web gaps that showed up in the browser smoke test and are NOT yet resolved:

- `expo-secure-store` has no web impl → feature code imports the
  `infrastructure/storage/secureStore` abstraction (localStorage web twin; the
  metro alias remains as a safety net for direct package imports).
- `lottie-react-native`'s web entry needs its peer `@lottiefiles/dotlottie-react`
  (added to dependencies) and `expo-file-system` cache calls warn on web.
- `/search` discovery/offline area crashes on a raw text node under a `View`
  (react-native-web); the rest of the tree renders.
- Data-driven screens (reels `/post/:id`, `/story/:id`, feed tabs) render empty/
  offline states without a reachable backend, and the dev backend is CORS-blocked
  for browser origins (`https://paltry-vibes-primer.ngrok-free.dev`).
- Pull-to-refresh and mention-token coloring are native-only (see
  `PullToRefreshWrapper.tsx` web branch + `ControlledMentionsInput.tsx`).

Deferred deliberately: monorepo/turbo/pnpm, tsconfig path aliases (SDK 57 metro does
not resolve them natively), forcing 100% UI sharing across platforms.