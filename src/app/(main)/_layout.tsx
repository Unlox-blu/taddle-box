import { Tabs, Redirect } from "expo-router";
import { useAuth } from "../../features/auth/state/AuthProvider";
import CustomTabBar from "../../shell/components/CustomTabBar";

export default function MainLayout() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isLoggedIn) return <Redirect href="/(auth)" />;

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="home/index" options={{ href: null }} />
      <Tabs.Screen name="community" options={{ title: "Community" }} />
      <Tabs.Screen name="events/index" options={{ title: "Events" }} />
      <Tabs.Screen name="events/[id]" options={{ href: null }} />
      <Tabs.Screen name="games/index" options={{ title: "Games" }} />
      <Tabs.Screen name="profile/index" options={{ title: "Profile" }} />
    </Tabs>
  );
}
