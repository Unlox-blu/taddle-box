const fs = require('fs');
const files = [
  'src/components/common/AnimatedSplashScreen.tsx',
  'src/components/common/PullToRefreshWrapper.tsx',
  'src/screens/auth/LoginScreen.tsx',
  'src/screens/auth/OnboardingScreen.tsx',
  'src/screens/auth/RegisterScreen.tsx',
  'src/screens/auth/WelcomeScreen.tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/\s*renderMode="SOFTWARE"/g, '');
  fs.writeFileSync(f, content);
});

console.log('Reverted to hardware rendering');
