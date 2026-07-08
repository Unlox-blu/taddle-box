# TADDLEBOX — React Native App

## Quick Start (Fix npm error first)

The `npm install` error happens because `react-native-screens` tries to build from source.  
**Always use `npx expo install` instead of `npm install`.**

```bash
# 1 — Remove any broken install
rm -rf node_modules package-lock.json

# 2 — Let Expo resolve all compatible versions
npx expo install

# 3 — Start the dev server
npx expo start
```

Then:
- **On phone** → Scan the QR code with the [Expo Go](https://expo.dev/client) app  
- **Android emulator** → Press `a` in the terminal  
- **iOS simulator** → Press `i` in the terminal (Mac only)

---

## Project Structure

```
TADDLEBOX/
├── App.tsx                          # Root entry point
├── src/
│   ├── theme/index.ts               # Colors, spacing, typography tokens
│   ├── types/
│   │   ├── index.ts                 # TypeScript types & nav param lists
│   │   └── mockData.ts              # Sample data for all screens
│   ├── navigation/
│   │   ├── AppNavigator.tsx         # Root navigator (Auth ↔ Main)
│   │   ├── AuthNavigator.tsx        # Auth stack
│   │   └── MainNavigator.tsx        # Bottom tab navigator
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx           # Gradient/ghost/XP button variants
│   │   │   └── Input.tsx            # Styled text input with error state
│   │   ├── home/
│   │   │   ├── PostCard.tsx         # Social feed post with like animation
│   │   │   ├── StoryRow.tsx         # Horizontal stories strip
│   │   │   └── XPProgressBar.tsx    # Animated XP level progress bar
│   │   ├── gamification/
│   │   │   └── StreakCard.tsx       # 7-day streak tracker
│   │   └── navigation/
│   │       └── CustomTabBar.tsx     # Bottom nav with center FAB
│   └── screens/
│       ├── auth/
│       │   ├── SplashScreen.tsx     # Animated logo splash
│       │   ├── OnboardingScreen.tsx # Swipeable 4-slide onboarding
│       │   ├── WelcomeScreen.tsx    # Login / Register choice
│       │   ├── LoginScreen.tsx      # Email + social login
│       │   ├── RegisterScreen.tsx   # 3-step registration
│       │   ├── OTPScreen.tsx        # 6-digit auto-advance OTP
│       │   └── ForgotPasswordScreen.tsx
│       └── main/
│           ├── HomeScreen.tsx       # Social feed + XP + streak
│           ├── CommunityScreen.tsx  # Community discovery + leaderboard
│           ├── EventsScreen.tsx     # Events with live status
│           ├── GamesScreen.tsx      # Game grid + tournament + leaderboard
│           ├── WalletScreen.tsx     # Cash + XP balance + transactions
│           └── ProfileScreen.tsx    # Profile + badges + posts grid
```

## Color System

| Token         | Value     | Usage               |
|---------------|-----------|---------------------|
| `primary`     | `#7C3AED` | Buttons, accents    |
| `cyan`        | `#06B6D4` | Gradients, glow     |
| `xpGold`      | `#FBBF24` | XP, rewards, streak |
| `bg.base`     | `#070714` | App background      |
| `bg.card`     | `#13132E` | Cards, inputs       |
| `text.primary`| `#F1F5F9` | Main text           |

## Auth Flow

```
Splash → Onboarding → Welcome → Register → OTP → [Main App]
                              ↘ Login ↗
```
