const fs = require('fs');
const path = require('path');

const FILES = [
  'src/screens/main/SearchScreen.tsx',
  'src/screens/main/NotificationsScreen.tsx',
  'src/screens/main/LeaderboardsScreen.tsx',
  'src/screens/main/GamesScreen.tsx',
  'src/screens/main/FollowRequestsScreen.tsx',
  'src/screens/main/EventsScreen.tsx',
  'src/screens/main/CommunityScreen.tsx',
  'src/screens/main/CommunityModerationLogScreen.tsx',
  'src/components/profile/SharedProfile.tsx',
  'src/components/common/SharedFeed.tsx',
  'src/screens/main/HomeScreen.tsx'
];

for (const relPath of FILES) {
  const file = path.join('d:/Workspace/Unlox/code/taddle/taddlebox-app', relPath);
  if (!fs.existsSync(file)) {
    console.log(`Skipping missing file: ${file}`);
    continue;
  }
  let content = fs.readFileSync(file, 'utf8');
  
  // 1. Replace import AppRefreshControl with PullToRefreshWrapper
  content = content.replace(
    /import\s+AppRefreshControl\s+from\s+['"]([^'"]+)AppRefreshControl['"];?/g,
    (match, p1) => `import PullToRefreshWrapper from "${p1}PullToRefreshWrapper";`
  );
  
  // 2. Remove the unused RefreshControl import from react-native if it exists and we removed its only use
  // We'll just leave it for now to avoid breaking other things.

  // 3. We need to wrap the FlatList/ScrollView with PullToRefreshWrapper
  // This is tricky with regex because FlatList/ScrollView tags can be multiline and nested.
  // Actually, wait, doing structural JSX refactoring with Regex is notoriously brittle.
  // It's safer to use a proper AST tool (like jscodeshift) or do it manually.
}
