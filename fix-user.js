const fs = require('fs');
const path = require('path');

const files = [
  'src/components/common/CreatePostModal.tsx',
  'src/components/home/SideDrawer.tsx',
  'src/screens/main/CommentsScreen.tsx',
  'src/screens/main/HomeScreen.tsx',
  'src/screens/main/ProfileScreen.tsx',
  'src/screens/main/SettingsScreen.tsx'
];

files.forEach(relPath => {
  const filePath = path.join(__dirname, relPath);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');
  // Remove the dummy guest user fallback and replace with simple destructuring
  content = content.replace(
    /const \{ user: CURRENT_USER = \{ xp: 0, posts: 0, following: 0, followers: 0, badges: \[\], level: 1, rank: 'Novice', xpToNext: 100, name: 'Guest', handle: '@guest', avatar: '👤', bio: '', college: '' \} as any \} = useAuth\(\);/g,
    "const { user: CURRENT_USER } = useAuth();"
  );
  // Also handle cases where it was just user: CURRENT_USER = {} as any
  content = content.replace(
    /const \{ user: CURRENT_USER = \{\} as any \} = useAuth\(\);/g,
    "const { user: CURRENT_USER } = useAuth();"
  );
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Cleaned', relPath);
});
