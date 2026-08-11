/**
 * AppRefreshControl
 *
 * Shows the app icon during pull-to-refresh instead of the platform spinner.
 * No spinning — just the icon fading in with a spring pop.
 *
 * ── How it works on Android ─────────────────────────────────────────────
 * androidx SwipeRefreshLayout moves ONLY its own spinner circle during the
 * pull (`moveSpinner` → `setTargetOffsetTopAndBottom(mCircleView, …)`); the
 * list content never moves, and the pull distance never reaches JS (the
 * native swipe layout cancels the JS touch stream the instant it intercepts
 * the gesture). So a custom icon can't be driven by the pull offset in pure
 * JS — instead:
 *
 *   • The icon sits exactly where the native spinner comes to rest, so its
 *     position matches the platform indicator (circle center = 64dp − 20dp
 *     = 44dp from the top of the wrapper).
 *   • While the finger drags down from the top of the list, onTouchMove
 *     bubbles up and fades the icon in proportionally — it's already on
 *     screen when the pull "takes hold".
 *   • The moment the swipe layout intercepts the gesture, JS gets a
 *     touchCancel (NativeGestureUtil.notifyNativeGestureStarted from
 *     ReactSwipeRefreshLayout). Combined with a downward drag at content
 *     offset ≤ 0, that proves a pull-to-refresh is in progress → the icon
 *     springs to full. A cancelled pull (released below the threshold)
 *     fades it back out on a short timer, since no further JS events arrive
 *     once the native control owns the touch stream.
 *
 * ── children / style ───────────────────────────────────────────────────
 * On Android, ScrollView/FlatList render the refreshControl by CLONING it
 * and injecting the actual scroll view as its child (cloneElement in
 * ScrollView.js). The built-in RefreshControl forwards that child through
 * to the native SwipeRefreshLayout — which is how the list ends up inside
 * the refresh wrapper at all. If we drop `children` here, the injected
 * scroll view is discarded and the ENTIRE list never renders on Android
 * (blank screen, iOS unaffected). So the scroll view MUST be rendered, and
 * first — canChildScrollUp() checks getChildAt(0) for pull-to-refresh.
 *
 * ScrollView also injects its layout style (flexGrow/flexShrink/overflow)
 * onto the refresh control so the wrapper fills the available space.
 * Forward it or the wrapper collapses.
 *
 * To tell a pull from a normal drag we read the live content offset, so we
 * do a single, children-preserving clone of the injected scroll view that
 * only COMPOSES an extra onScroll (the original handlers keep working).
 */

import React, { Children, cloneElement, useEffect, useRef } from 'react';
import {
  RefreshControl,
  View,
  StyleSheet,
  Animated,
  Image,
  Platform,
  PixelRatio,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useThemeColors } from '../../context/ThemeContext';

const APP_ICON = require('../../../assets/icon.png');

/** Native Material spinner rests with its circle center 44dp from the top
 *  of the SwipeRefreshLayout (DEFAULT_CIRCLE_TARGET 64dp − circleRadius 20dp). */
const REST_CENTER_DP = 44;

interface Props {
  refreshing: boolean;
  onRefresh: () => void;
  /** Size of the icon in px (default 36) */
  iconSize?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function AppRefreshControl({
  refreshing,
  onRefresh,
  iconSize = 36,
  children,
  style,
}: Props) {
  const colors = useThemeColors();
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  const isAndroid = Platform.OS === 'android';

  // ── Android pull tracking ─────────────────────────────────────────────
  const touchStartY = useRef<number | null>(null);
  const lastDy = useRef(0);
  const pullActive = useRef(false);
  const abortTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollOffset = useRef<number | null>(null);
  const refreshingRef = useRef(refreshing);
  refreshingRef.current = refreshing;

  const clearAbortTimer = () => {
    if (abortTimer.current) {
      clearTimeout(abortTimer.current);
      abortTimer.current = null;
    }
  };

  const hideIcon = (immediate = false) => {
    pullActive.current = false;
    clearAbortTimer();
    if (immediate) {
      opacityAnim.setValue(0);
      scaleAnim.setValue(0.7);
      translateYAnim.setValue(0);
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.7,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const showIcon = (spring: boolean) => {
    clearAbortTimer();
    pullActive.current = true;
    if (spring) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 140,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(translateYAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 120,
          friction: 8,
        }),
      ]).start();
    } else {
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    }
  };

  // Fade the icon in as the finger drags down from the top of the list —
  // before the native control intercepts, onTouchMove still bubbles to us.
  const handleTouchStart = (e: GestureResponderEvent) => {
    touchStartY.current = e.nativeEvent.pageY;
    lastDy.current = 0;
    // A fresh gesture clears any icon left over from an aborted pull.
    if (pullActive.current && !refreshingRef.current) {
      hideIcon(true);
    }
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    if (touchStartY.current == null) {
      return;
    }
    const dy = e.nativeEvent.pageY - touchStartY.current;
    lastDy.current = dy;
    // Only a downward drag while the list is at the top is a pull gesture,
    // and never while a refresh is already in progress (the native control
    // ignores pulls then, so dimming the icon would just look broken).
    if (
      refreshingRef.current ||
      dy <= 0 ||
      (scrollOffset.current ?? 0) > 1
    ) {
      return;
    }
    // Stop any in-flight (native-driver) animation before driving from JS.
    opacityAnim.stopAnimation();
    scaleAnim.stopAnimation();
    const progress = Math.min(dy / 64, 1);
    opacityAnim.setValue(progress);
    scaleAnim.setValue(0.7 + progress * 0.3);
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
    lastDy.current = 0;
    if (!pullActive.current && !refreshingRef.current) {
      hideIcon();
    }
  };

  const handleTouchCancel = () => {
    touchStartY.current = null;
    // The native SwipeRefreshLayout just intercepted the gesture. A downward
    // drag at the top of the list means a pull-to-refresh is in progress
    // (the list's own scroll claim is excluded by the offset check — at the
    // top it can't scroll, so only the swipe layout can claim the gesture).
    if (lastDy.current > 0 && (scrollOffset.current ?? 0) <= 1) {
      showIcon(true);
      // If the pull is released below the refresh threshold, no JS event
      // ever tells us — fade back out on our own (the native circle retreats
      // in ~200ms; a real refresh flips `refreshing` well within this window).
      clearAbortTimer();
      // Slow pulls can take a moment to cross the 64dp refresh threshold, so
      // allow generous time before assuming the pull was abandoned.
      abortTimer.current = setTimeout(() => {
        if (!refreshingRef.current) {
          hideIcon();
        }
      }, 2500);
    } else {
      hideIcon();
    }
  };

  useEffect(() => {
    if (refreshing) {
      showIcon(true);
    } else {
      hideIcon();
    }
  }, [refreshing]);

  useEffect(
    () => () => {
      clearAbortTimer();
    },
    [],
  );

  // Compose a live content-offset tracker into the injected scroll view.
  // Children are untouched; the screens' own onScroll handlers keep working.
  let injected = children;
  if (isAndroid && children != null) {
    try {
      const scrollEl = Children.only(children) as React.ReactElement<any>;
      const origOnScroll = scrollEl.props?.onScroll;
      const origThrottle = scrollEl.props?.scrollEventThrottle as number | undefined;
      injected = cloneElement(scrollEl, {
        // Keep the caller's throttle (sticky headers need 1ms); default 16.
        scrollEventThrottle: origThrottle || 16,
        onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          origOnScroll?.(e);
          scrollOffset.current = e?.nativeEvent?.contentOffset?.y ?? 0;
        },
      });
    } catch {
      injected = children; // not the injected scroll view — render as-is
    }
  }

  const bubbleSize = iconSize + 12;
  const iconTop = isAndroid
    ? REST_CENTER_DP * PixelRatio.get() - bubbleSize / 2
    : 8;

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      // Hide the native spinner on both platforms; our icon replaces it.
      tintColor="transparent"
      colors={['transparent']}
      progressBackgroundColor="transparent"
      style={[style, { backgroundColor: 'transparent' }]}
      {...(isAndroid
        ? {
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
            onTouchEnd: handleTouchEnd,
            onTouchCancel: handleTouchCancel,
          }
        : {})}
    >
      {injected}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.iconWrap,
          {
            top: iconTop,
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }, { translateY: translateYAnim }],
          },
        ]}
      >
        <View
          style={[
            styles.iconBubble,
            {
              width: bubbleSize,
              height: bubbleSize,
              borderRadius: bubbleSize / 2,
              backgroundColor: colors.bg.elevated,
              borderColor: colors.border,
            },
          ]}
        >
          <Image
            source={APP_ICON}
            style={{ width: iconSize, height: iconSize, borderRadius: iconSize / 4 }}
            resizeMode="contain"
          />
        </View>
      </Animated.View>
    </RefreshControl>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  iconBubble: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#7C3AED',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
