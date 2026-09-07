import React from "react";
import TabErrorBoundary from "./TabErrorBoundary";

/**
 * Wraps a tab screen with TabErrorBoundary so a crash in one tab can't
 * white-screen the rest of the app. Created at MODULE level so the component
 * identity is stable across renders (a wrapper created inside a render would
 * remount the tab on every update).
 */
export default function withTabBoundary(
  Screen: React.ComponentType<any>,
  tabName: string,
) {
  const Wrapped = (props: any) => (
    <TabErrorBoundary tabName={tabName}>
      <Screen {...props} />
    </TabErrorBoundary>
  );
  Wrapped.displayName = `TabBoundary(${tabName})`;
  return Wrapped;
}
