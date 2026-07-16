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

const mockVars = ['CURRENT_USER', 'NOTIFICATIONS', 'GAMES', 'LEADERBOARD', 'EVENTS', 'COMMENTS'];

filesToFix.forEach(relPath => {
  const filePath = path.join(__dirname, relPath);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // If it has CURRENT_USER, we try to use useAuth
  const hasCurrentUser = content.includes('CURRENT_USER');
  
  if (hasCurrentUser) {
    // Replace the import
    content = content.replace(/import\s*{.*CURRENT_USER.*}\s*from\s*['"]\.\.\/\.\.\/types\/mockData['"];?/, "import { useAuth } from '../../context/AuthContext';\n// removed mockData import");
    
    // Inject the hook at the start of the component
    // Assuming standard "export default function ComponentName(...args) {"
    content = content.replace(/(export default function \w+\([^)]*\)\s*{)/, `$1\n  const { user: CURRENT_USER = {} as any } = useAuth();`);
    // For non-default exports like SideDrawer: "export function SideDrawer(...args) {"
    content = content.replace(/(export function \w+\([^)]*\)\s*{)/, `$1\n  const { user: CURRENT_USER = {} as any } = useAuth();`);
  } else {
    // Just remove the import
    content = content.replace(/import\s*{.*}\s*from\s*['"]\.\.\/\.\.\/types\/mockData['"];?/, "// removed mockData import");
  }

  // Define the empty arrays for the other mocks at the top level
  mockVars.forEach(v => {
    if (v !== 'CURRENT_USER' && content.includes(v)) {
      content = `const ${v}: any[] = [];\n` + content;
    }
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Fixed', relPath);
});
