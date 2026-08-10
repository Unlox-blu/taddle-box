import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert as RNAert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/** Drop-in replacement for Alert.alert — themed in-app dialog. */
export function themedAlert(
  title?: string,
  message?: string,
  buttons?: ThemedAlertButton[],
  options?: ThemedAlertOptions,
) {
  if (!hostShow) {
    // Host not mounted yet (early boot) — fall back to the native dialog.
    RNAert.alert(title || '', message, buttons as any, options as any);
    return;
  }
  hostShow({ id: nextId++, title, message, buttons: buttons || [], options, prompt: false });
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
  if (!hostShow) {
    RNAert.prompt(title, message, callbackOrButtons, type as any, defaultValue, keyboardType as any);
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
    wrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
      // The card is a child of this full-screen layer (not of the flex
      // wrapper), so it must center itself here — otherwise it sits at the
      // top of the screen instead of the middle.
      justifyContent: 'center',
      alignItems: 'center',
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
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  const [spec, setSpec] = useState<AlertSpec | null>(null);
  const [input, setInput] = useState('');
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Guards the spec-clear after dismiss: a chained themedAlert() that opens
  // within the 200ms window must cancel the pending clear, not get wiped.
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

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

  // Register the imperative entry point for the whole app.
  const showRef = useRef(open);
  showRef.current = open;
  useEffect(() => {
    hostShow = (s: AlertSpec) => showRef.current(s);
    return () => {
      hostShow = null;
    };
  }, []);

  const fire = (button: ThemedAlertButton) => {
    const value = spec?.prompt ? input : undefined;
    const cb = button.onPress;
    dismiss();
    // Defer so the modal close state settles before a chained themedAlert().
    setTimeout(() => cb?.(value), 0);
  };

  const cancelable = spec?.options?.cancelable !== false;
  const hasButtons = !!spec && spec.buttons.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (cancelable) {
          spec?.options?.onDismiss?.();
          dismiss();
        }
      }}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.backdrop, { paddingBottom: insets.bottom }]}
          onPress={() => {
            if (cancelable) {
              spec?.options?.onDismiss?.();
              dismiss();
            }
          }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
            {spec?.title ? (
              <Text style={styles.title}>{spec.title}</Text>
            ) : null}
            {spec?.message ? (
              <Text style={styles.message}>{spec.message}</Text>
            ) : null}

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
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}
