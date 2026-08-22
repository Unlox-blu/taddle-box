import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { error as logError } from '../../utils/logger';

/**
 * Per-tab error boundary — catches render errors inside a single tab
 * so a crash in e.g. Games doesn't white-screen the entire app.
 * The user sees an inline fallback with a retry button instead.
 */
export default class TabErrorBoundary extends React.Component<
  { children: React.ReactNode; tabName?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(`[TabErrorBoundary:${this.props.tabName ?? '?'}] caught:`, error, info?.componentStack);
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>😵</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message} numberOfLines={4}>
            {this.state.error.message || String(this.state.error)}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={this.retry} activeOpacity={0.8}>
            <Text style={styles.btnText}>Try Again</Text>
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
  emoji: { fontSize: 36, marginBottom: 10 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  message: { color: '#a1a1aa', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  btn: {
    backgroundColor: '#7c3aed',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
