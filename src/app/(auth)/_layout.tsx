import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../features/auth/state/AuthProvider';

export default function AuthLayout() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) return null;
  if (isLoggedIn) return <Redirect href="/(main)" />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" options={{ animation: 'fade' }} />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}