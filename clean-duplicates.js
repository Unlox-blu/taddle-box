const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/components/common/CreatePostModal.tsx',
  'src/components/home/SideDrawer.tsx',
  'src/screens/main/CommentsScreen.tsx',
  'src/screens/main/CommunityScreen.tsx',
  'src/screens/main/EventsScreen.tsx',
  'src/screens/main/GamesScreen.tsx',
  'src/screens/main/HomeScreen.tsx',
  'src/screens/main/NotificationsScreen.tsx',
  'src/screens/main/ProfileScreen.tsx',
  'src/screens/main/SettingsScreen.tsx',
];

filesToFix.forEach(relPath => {
  const filePath = path.join(__dirname, relPath);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // Fix duplicated lines
  const lines = content.split('\n');
  const uniqueLines = [];
  let previousLine = '';

  for (const line of lines) {
    if (line.trim() === 'const { user: CURRENT_USER = {} as any } = useAuth();' && previousLine.trim() === 'const { user: CURRENT_USER = {} as any } = useAuth();') {
      continue;
    }
    if (line.trim() === 'const EVENTS: any[] = [];' && previousLine.trim() === 'const EVENTS: any[] = [];') continue;
    if (line.trim() === 'const GAMES: any[] = [];' && previousLine.trim() === 'const GAMES: any[] = [];') continue;
    if (line.trim() === 'const LEADERBOARD: any[] = [];' && previousLine.trim() === 'const LEADERBOARD: any[] = [];') continue;
    if (line.trim() === 'const COMMENTS: any[] = [];' && previousLine.trim() === 'const COMMENTS: any[] = [];') continue;
    if (line.trim() === 'const NOTIFICATIONS: any[] = [];' && previousLine.trim() === 'const NOTIFICATIONS: any[] = [];') continue;
    if (line.trim() === 'import { useAuth } from \'../../context/AuthContext\';' && previousLine.trim() === 'import { useAuth } from \'../../context/AuthContext\';') continue;
    
    uniqueLines.push(line);
    previousLine = line;
  }

  fs.writeFileSync(filePath, uniqueLines.join('\n'), 'utf8');
  console.log('Cleaned', relPath);
});
