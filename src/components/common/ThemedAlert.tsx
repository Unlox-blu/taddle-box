import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert as RNAlert,
  Animated,
  useWindowDimensions,
  BackHandler,
} from 'react-native';
import { useThemeColors } from '../../context/ThemeContext';
import { fontSizes, spacing, radii, type ColorPalette } from '../../theme';

// ─── Public API (mirrors react-native's Alert so swaps are mechanical) ────────

export type ThemedAlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface ThemedAlertButton {
  text: string;
  onPress?: (value?: string) => void;
  style?: ThemedAlertButtonStyle;
}

export interface ThemedAlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
  /** prompt-only: text input type. */
  promptType?: 'plain-text' | 'secure-text' | 'numeric';
  defaultValue?: string;
  keyboardType?: 'default' | 'number-pad' | 'numeric' | 'email-address';
}

interface AlertSpec {
  id: number;
  title?: string;
  message?: string;
  buttons: ThemedAlertButton[];
  options?: ThemedAlertOptions;
  prompt: boolean;
}

// Module-level registry: any file can call themedAlert() without a context;
// the host mounted at the app root registers its render function here.
let hostShow: ((spec: AlertSpec) => void) | null = null;
let nextId = 1;
// Track how many Modals are currently open in the app so we can queue
// alerts on iOS when a Modal is already visible (stacking = freeze).
let activeModalCount = 0;
// Queued alerts waiting for all modals to close
let pendingQueue: AlertSpec[] = [];
// Registry of modal closers — each open modal registers a close callback
let modalClosers: (() => void)[] = [];

/** Register a closer function for an open modal. Returns an unregister fn. */
export const registerModalCloser = (closer: () => void): (() => void) => {
  modalClosers.push(closer);
  return () => {
    modalClosers = modalClosers.filter(c => c !== closer);
  };
};

const closeAllModals = () => {
  const closers = [...modalClosers];
  modalClosers = [];
  closers.forEach(c => { try { c(); } catch {} });
};

const flushQueue = () => {
  if (activeModalCount > 0 || !hostShow) return;
  const next = pendingQueue.shift();
  if (next) {
    setTimeout(() => {
      if (hostShow) hostShow(next);
      setTimeout(flushQueue, 300);
    }, 350);
  }
};

/** Call when a Modal becomes visible. */
export const notifyModalOpen = () => {
  activeModalCount++;
};

/** Call when a Modal is dismissed. */
export const notifyModalClose = () => {
  activeModalCount = Math.max(0, activeModalCount - 1);
  if (activeModalCount === 0) {
    flushQueue();
  }
};

/**
 * Hook for components that render a Modal and may trigger themedAlert inside.
 * Pass `onClose` so themedAlert can close this modal before showing the alert.
 */
export function useThemedAlertModal(visible: boolean, onClose?: () => void) {
  const wasVisibleRef = React.useRef(false);
  React.useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      wasVisibleRef.current = true;
      notifyModalOpen();
      // Register closer if provided
      if (onClose) {
        const unregister = registerModalCloser(onClose);
        return () => {
          unregister();
          if (wasVisibleRef.current) {
            wasVisibleRef.current = false;
            notifyModalClose();
          }
        };
      }
    } else if (!visible && wasVisibleRef.current) {
      wasVisibleRef.current = false;
      notifyModalClose();
    }
    return () => {
      if (wasVisibleRef.current) {
        wasVisibleRef.current = false;
        notifyModalClose();
      }
    };
  }, [visible]);
}

/** Drop-in replacement for Alert.alert — themed in-app dialog. */
export function themedAlert(
  title?: string,
  message?: string,
  buttons?: ThemedAlertButton[],
  options?: ThemedAlertOptions,
) {
  const spec: AlertSpec = {
    id: nextId++,
    title,
    message,
    buttons: buttons || [],
    options,
    prompt: false,
  };

  if (!hostShow) {
    RNAlert.alert(title || '', message, buttons as any, options as any);
    return;
  }

  // On iOS, if a Modal is open: close all modals first, then show alert
  // after the close animation finishes.
  if (Platform.OS === 'ios' && activeModalCount > 0) {
    pendingQueue.push(spec);
    closeAllModals();
    return;
  }

  hostShow(spec);
}

/**
 * Drop-in replacement for Alert.prompt — same signatures:
 * themedPrompt(title, message?, callbackOrButtons?, type?, defaultValue?, keyboardType?)
 */
export function themedPrompt(
  title: string,
  message?: string,
  callbackOrButtons?: any,
  type?: 'plain-text' | 'secure-text' | 'numeric',
  defaultValue?: string,
  keyboardType?: 'default' | 'number-pad' | 'numeric' | 'email-address',
) {
  if ((Platform.OS === 'ios' && activeModalCount > 0) || !hostShow) {
    RNAlert.prompt(title, message, callbackOrButtons, type as any, defaultValue, keyboardType as any);
    return;
  }
  let buttons: ThemedAlertButton[];
  if (typeof callbackOrButtons === 'function') {
    // Plain callback → a single OK button that returns the typed value.
    buttons = [{ text: 'OK', onPress: (v?: string) => callbackOrButtons(v) }];
  } else if (Array.isArray(callbackOrButtons)) {
    // Buttons array — every onPress receives the typed value, like RN.
    buttons = (callbackOrButtons as any[]).map((b) =>
      typeof b === 'string'
        ? { text: b, onPress: () => undefined }
        : { text: b.text, style: b.style, onPress: (v?: string) => b.onPress?.(v) },
    );
  } else {
    buttons = [{ text: 'OK' }];
  }
  hostShow({
    id: nextId++,
    title,
    message,
    buttons,
    options: { promptType: type, defaultValue, keyboardType },
    prompt: true,
  });
}

// ─── Host ─────────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    // Root overlay — absolutely covers the whole screen, no Modal
    root: {
      position: 'absolute',
      top: 0,
      left: 0,
      zIndex: 99999,
      elevation: 99999,
    },
    // Dimmed backdrop fills the root
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    // Centers the card vertically and horizontally
    cardWrapper: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      // Prevent cardWrapper itself from eating touches when invisible
    },
    card: {
      width: '84%',
      maxWidth: 380,
      backgroundColor: c.bg.surface,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: c.borderHover,
      padding: spacing.lg,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    title: {
      fontSize: fontSizes.lg,
      fontWeight: '800',
      color: c.text.primary,
      textAlign: 'center',
    },
    message: {
      fontSize: fontSizes.sm,
      color: c.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 8,
    },
    input: {
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.md,
      backgroundColor: c.bg.card,
      color: c.text.primary,
      fontSize: fontSizes.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      textAlign: 'center',
    },
    divider: {
      height: 1,
      backgroundColor: c.border,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    btn: {
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: radii.md,
    },
    btnText: { fontSize: fontSizes.md, fontWeight: '800' },
    cancelText: { color: c.text.secondary },
    defaultText: { color: c.primaryLight },
    destructiveText: { color: c.danger },
  });
}

/** Mount once at the app root (inside ThemeProvider) to power themedAlert(). */
export function ThemedAlertHost() {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const { width, height } = useWindowDimensions();
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [spec, setSpec] = useState<AlertSpec | null>(null);
  const [input, setInput] = useState('');
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      inputRef.current?.focus();
    } else {
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  // Android back button support
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (spec?.options?.cancelable !== false) {
        spec?.options?.onDismiss?.();
        dismiss();
      }
      return true;
    });
    return () => sub.remove();
  }, [visible, spec]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setSpec(null), 200);
  }, []);

  const open = useCallback((s: AlertSpec) => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    setSpec(s);
    setInput(s.options?.defaultValue ?? '');
    setVisible(true);
  }, []);

  const showRef = useRef(open);
  showRef.current = open;
  useEffect(() => {
    const previousHost = hostShow;
    hostShow = (s: AlertSpec) => showRef.current(s);
    // Flush any alerts queued before this host mounted
    flushQueue();
    return () => {
      // Restore previous host when this instance unmounts (e.g. game modal closes)
      hostShow = previousHost;
    };
  }, []);

  const fire = (button: ThemedAlertButton) => {
    const value = spec?.prompt ? input : undefined;
    const cb = button.onPress;
    dismiss();
    setTimeout(() => cb?.(value), 0);
  };

  const cancelable = spec?.options?.cancelable !== false;
  const hasButtons = !!spec && spec.buttons.length > 0;

  if (!spec && !visible) return null;

  return (
    <View
      style={[styles.root, { width, height }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (cancelable) {
              spec?.options?.onDismiss?.();
              dismiss();
            }
          }}
        />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.cardWrapper}
        pointerEvents="box-none"
      >
        <Animated.View style={{ opacity: backdropOpacity, width: '100%', alignItems: 'center' }}>
          <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
            {spec?.title ? <Text style={styles.title}>{spec.title}</Text> : null}
            {spec?.message ? <Text style={styles.message}>{spec.message}</Text> : null}

            {spec?.prompt ? (
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={input}
                onChangeText={setInput}
                defaultValue={spec.options?.defaultValue}
                secureTextEntry={spec.options?.promptType === 'secure-text'}
                keyboardType={
                  spec.options?.keyboardType ||
                  (spec.options?.promptType === 'numeric' ? 'number-pad' : 'default')
                }
                autoFocus
                placeholder=""
                placeholderTextColor={colors.text.muted}
              />
            ) : null}

            {hasButtons ? (
              <>
                <View style={styles.divider} />
                {spec!.buttons.map((b, i) => {
                  const textColor =
                    b.style === 'destructive'
                      ? styles.destructiveText
                      : b.style === 'cancel'
                        ? styles.cancelText
                        : styles.defaultText;
                  return (
                    <TouchableOpacity
                      key={`${b.text}-${i}`}
                      style={styles.btn}
                      onPress={() => fire(b)}
                    >
                      <Text style={[styles.btnText, textColor]}>{b.text}</Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              <TouchableOpacity style={styles.btn} onPress={dismiss}>
                <Text style={[styles.btnText, styles.defaultText]}>OK</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
