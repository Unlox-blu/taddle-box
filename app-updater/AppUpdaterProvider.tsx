// ─── app-updater/AppUpdaterProvider.tsx ─────────────────────────────────────
// Mounts once at the app root. Checks for an update on launch (and when the app
// returns to the foreground, with a cooldown) and drives the prompt → download
// → install flow. Does nothing at all in store builds (see app.config.js).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '../src/context/ThemeContext';
import { fontSizes, spacing, radii } from '../src/theme';
import {
  downloadApk,
  fetchUpdateManifest,
  hasUpdate,
  installApk,
  isUpdaterEnabled,
} from './updater';
import type { AppUpdate } from './types';

type UpdaterState =
  | { status: 'idle' }
  | { status: 'available'; update: AppUpdate }
  | { status: 'downloading'; update: AppUpdate; progress: number }
  | { status: 'installing' }
  | { status: 'error'; update: AppUpdate | null; message: string };

const CHECK_COOLDOWN_MS = 30 * 60 * 1000; // re-check at most every 30 min

export function AppUpdaterProvider({ children }: { children?: React.ReactNode }) {
  const colors = useThemeColors();
  const [state, setState] = useState<UpdaterState>({ status: 'idle' });
  // Gate: blocks rendering children until the initial update check completes
  // so the app doesn't flash past the update screen.
  const [initialCheckDone, setInitialCheckDone] = useState(!isUpdaterEnabled());
  const lastCheckRef = useRef(0);
  const checkingRef = useRef(false);

  const runCheck = useCallback(async (isInitial = false) => {
    if (!isUpdaterEnabled() || checkingRef.current) {
      if (isInitial) setInitialCheckDone(true);
      return;
    }
    checkingRef.current = true;
    try {
      const update = await fetchUpdateManifest();
      if (update && hasUpdate(update)) {
        setState({ status: 'available', update });
      }
    } finally {
      checkingRef.current = false;
      if (isInitial) setInitialCheckDone(true);
    }
  }, []);

  useEffect(() => {
    runCheck(true);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - lastCheckRef.current > CHECK_COOLDOWN_MS) {
        lastCheckRef.current = Date.now();
        runCheck();
      }
    });
    return () => sub.remove();
  }, [runCheck]);

  const startDownload = useCallback(async (update: AppUpdate) => {
    if (!update) return;
    setState({ status: 'downloading', update, progress: 0 });
    try {
      const file = await downloadApk(update, (fraction) =>
        setState({ status: 'downloading', update, progress: fraction })
      );
      setState({ status: 'installing' });
      // System package installer opens on top; the promise resolves when the
      // user comes back to the app.
      await installApk(file);
      setState({ status: 'idle' });
    } catch {
      setState({
        status: 'error',
        update,
        message: 'Could not download the update. Check your connection and try again.',
      });
    }
  }, []);

  // Direct/dev APK builds: ALL updates are mandatory (no skip).
  // Store builds respect the manifest's mandatory flag.
  const isMandatory = useCallback(
    (update: AppUpdate) => update.mandatory || isUpdaterEnabled(),
    [],
  );

  const dismiss = useCallback(() => {
    setState((prev) => {
      if (prev.status === 'available' && isMandatory(prev.update)) return prev; // cannot skip
      return { status: 'idle' };
    });
  }, [isMandatory]);

  // Block rendering until the initial check is done.
  if (!initialCheckDone) return (
    <View style={{ flex: 1, backgroundColor: colors.bg.base, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={colors.primaryLight} />
    </View>
  );

  if (state.status === 'idle') return <>{children}</>;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.bg.card, borderColor: colors.border },
          ]}
        >
          {state.status === 'available' && (
            <>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: 'rgba(124,58,237,0.14)' },
                ]}
              >
                <Ionicons name="cloud-download-outline" size={34} color={colors.primaryLight} />
              </View>
              <Text style={[styles.title, { color: colors.text.primary }]}>
                {state.update.mandatory ? 'Update required' : 'Update available'}
                {state.update.versionName ? ` · v${state.update.versionName}` : ''}
              </Text>
              {state.update.changelog ? (
                <Text style={[styles.changelog, { color: colors.text.secondary }]}>
                  {state.update.changelog}
                </Text>
              ) : (
                <Text style={[styles.sub, { color: colors.text.secondary }]}>
                  A newer version of Taddlebox is ready. Update now to get the latest
                  features and fixes.
                </Text>
              )}
              <LinearGradient
                colors={[colors.primary, colors.cyanDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.updateBtn}
              >
                <TouchableOpacity
                  style={styles.updateBtnInner}
                  onPress={() => startDownload(state.update)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.updateBtnText}>Update Now</Text>
                </TouchableOpacity>
              </LinearGradient>
              {!isMandatory(state.update) && (
                <TouchableOpacity style={styles.laterBtn} onPress={dismiss} activeOpacity={0.7}>
                  <Text style={[styles.laterText, { color: colors.text.muted }]}>Later</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {state.status === 'downloading' && (
            <>
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(6,182,212,0.14)' }]}>
                <Ionicons name="download" size={34} color={colors.cyanLight} />
              </View>
              <Text style={[styles.title, { color: colors.text.primary }]}>Downloading update…</Text>
              <Text style={[styles.sub, { color: colors.text.secondary }]}>
                {Math.round(state.progress * 100)}%
              </Text>
              <View style={[styles.progressTrack, { backgroundColor: colors.bg.surface }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${Math.max(2, Math.round(state.progress * 100))}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.hint, { color: colors.text.muted }]}>
                Keep the app open until the download finishes.
              </Text>
            </>
          )}

          {state.status === 'installing' && (
            <>
              <ActivityIndicator size="large" color={colors.primaryLight} />
              <Text style={[styles.title, { color: colors.text.primary }]}>Installing…</Text>
              <Text style={[styles.sub, { color: colors.text.secondary }]}>
                Follow the on-screen steps to install the new version.
              </Text>
            </>
          )}

          {state.status === 'error' && (
            <>
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                <Ionicons name="alert-circle-outline" size={34} color={colors.danger} />
              </View>
              <Text style={[styles.title, { color: colors.text.primary }]}>Update failed</Text>
              <Text style={[styles.sub, { color: colors.text.secondary }]}>
                {state.message}
              </Text>
              <LinearGradient
                colors={[colors.primary, colors.cyanDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.updateBtn}
              >
                <TouchableOpacity
                  style={styles.updateBtnInner}
                  onPress={state.update ? () => startDownload(state.update!) : undefined}
                  activeOpacity={0.85}
                >
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.updateBtnText}>Try again</Text>
                </TouchableOpacity>
              </LinearGradient>
            </>
          )}

          {state.status === 'error' && (
            <TouchableOpacity style={styles.laterBtn} onPress={dismiss} activeOpacity={0.7}>
              <Text style={[styles.laterText, { color: colors.text.muted }]}>Dismiss</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.lg,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    fontSize: fontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  changelog: {
    fontSize: fontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  updateBtn: {
    alignSelf: 'stretch',
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  updateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  updateBtnText: { color: '#fff', fontSize: fontSizes.md, fontWeight: '800' },
  laterBtn: { paddingVertical: 12, paddingHorizontal: 24 },
  laterText: { fontSize: fontSizes.sm, fontWeight: '600' },
  progressTrack: {
    alignSelf: 'stretch',
    height: 10,
    borderRadius: radii.full,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: { height: '100%', borderRadius: radii.full },
  hint: { fontSize: fontSizes.xs, textAlign: 'center' },
});
