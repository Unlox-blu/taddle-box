import { Redirect } from 'expo-router';
import { useAuth } from '../features/auth/state/AuthProvider';

export default function Index() {
  const { isLoggedIn, isLoading } = useAuth();
  if (isLoading) return null; // splash overlay covers this
  return <Redirect href={isLoggedIn ? '/(main)' : '/(auth)'} />;
}