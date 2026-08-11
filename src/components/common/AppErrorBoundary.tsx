import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, DevSettings } from 'react-native';

/**
 * Global error boundary — React 19 unmounts the entire app root on an uncaught
 * render error, which renders as a silent blank screen (all tabs white, only
 * chrome left). This catches the error and shows it, with a reload button, so
 * a crash is visible and recoverable instead of a dead white screen.
 */
export default class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('AppErrorBoundary caught:', error, info?.componentStack);
  }

  reload = () => {
    // DevSettings.reload works in Expo Go and dev builds; in release it may be
    // a no-op, so also drop the boundary state as a fallback so the UI retries.
    DevSettings.reload();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message} numberOfLines={8}>
            {this.state.error.message || String(this.state.error)}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={this.reload} activeOpacity={0.8}>
            <Text style={styles.btnText}>Reload App</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121216',
    padding: 32,
  },
  emoji: { fontSize: 44, marginBottom: 12 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  message: { color: '#a1a1aa', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  btn: {
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
