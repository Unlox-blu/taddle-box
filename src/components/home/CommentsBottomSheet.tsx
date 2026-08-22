import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fontSizes, spacing } from '../../theme';
import { useThemeColors } from '../../context/ThemeContext';
import CommentsThread from './CommentsThread';
import type { Post } from '../../types';

interface CommentsBottomSheetProps {
  /** null = sheet is closed */
  post: Post | null;
  onClose: () => void;
  onCountChange?: (postId: string, delta: number) => void;
}

const SNAP_POINTS = ['80%'];

export default function CommentsBottomSheet({
  post,
  onClose,
  onCountChange,
}: CommentsBottomSheetProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const composerRef = useRef<any>(null);

  const handleCountChange = useCallback(
    (delta: number) => {
      if (post) onCountChange?.(post.id, delta);
    },
    [post, onCountChange],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.55}
        pressBehavior="close"
      />
    ),
    [],
  );

  // Closed state — render nothing (BottomSheet renders itself)
  if (!post) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.border, width: 36 }}
      backgroundStyle={{ backgroundColor: colors.bg.card }}
      keyboardBehavior={Platform.OS === 'ios' ? 'extend' : 'interactive'}
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      topInset={insets.top}
    >
      {/* Sheet header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Comments
        </Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.text.muted} />
        </TouchableOpacity>
      </View>

      {/* Thread */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <CommentsThread
            post={post}
            composerRef={composerRef}
            onCountChange={handleCountChange}
          />
        </BottomSheetScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: spacing.lg,
  },
});
