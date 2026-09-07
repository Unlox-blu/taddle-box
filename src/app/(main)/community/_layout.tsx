import { Stack } from "expo-router";
import TabErrorBoundary from "../../../shell/components/TabErrorBoundary";

export default function CommunityLayout() {
  return (
    <TabErrorBoundary tabName="Community">
      <Stack screenOptions={{ headerShown: false }} />
    </TabErrorBoundary>
  );
}