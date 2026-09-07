import { Redirect } from 'expo-router';
import { useAuth } from '../../features/auth/state/AuthProvider';

export default function AuthIndex() {
  const { hasSeenOnboarding } = useAuth();
  return (
    <Redirect
      href={hasSeenOnboarding ? '/(auth)/welcome' : '/(auth)/onboarding'}
    />
  );
}