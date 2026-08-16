import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Image, DeviceEventEmitter } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  useAnimatedProps,
} from "react-native-reanimated";
import { Gesture, GestureDetector, NativeViewGestureHandler } from "react-native-gesture-handler";
import { useIsFocused } from "@react-navigation/native";
import { useThemeColors } from "../../context/ThemeContext";
import SectionChrome from "./SectionChrome";
import {
  useGlobalScroll,
  applyGlobalScrollOffset,
  applySectionScrollOffset,
  SCROLL_SHOW_SPRING,
} from "../../context/ScrollContext";
import LottieView from "lottie-react-native";
import * as Haptics from "expo-haptics";

import { getCachedLottie, getCachedLottieSync, S3_APP_ICON_LOTTIE_URL } from "../../services/lottie.service";

const AnimatedLottieView = Animated.createAnimatedComponent(LottieView);
const REFRESH_THRESHOLD = 70;
const MAX_PULL = 150;

interface Props {
  refreshing: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
  header?: React.ReactNode;
  iconSize?: number;
  /** Pinned section chrome (a screen's title + filter pills) that hides and
      shows IN LOCKSTEP with the main header when scrolling. Rendered below
      the header; the pull bubble drops below this block. */
  sectionHeader?: React.ReactNode;
  /** Height estimate for sectionHeader — used for the content offset + hide
      distance before the block is measured (onLayout refines it). */
  sectionHeaderH?: number;
  /** Offset of the pinned block from the wrapper's top. Defaults to the
      global MainHeader height — override for pushed screens that render
      their OWN chrome inside `sectionHeader` (no MainHeader), where the
      block starts at the wrapper's top: pass 0. */
  headerOffsetH?: number;
}

export default function PullToRefreshWrapper({
  refreshing,
  onRefresh,
  children,
  header,
  iconSize = 36,
  sectionHeader,
  sectionHeaderH = 0,
  headerOffsetH,
}: Props) {
  const colors = useThemeColors();
  const { headerTranslateY, footerTranslateY, headerHeight, footerHeight } = useGlobalScroll();
  // Pushed screens with their own chrome (passed via sectionHeader) sit the
  // pinned block at the wrapper's top; MainHeader screens offset it by the
  // global header height.
  const headerOffset = headerOffsetH ?? headerHeight;
  const pullDownY = useSharedValue(0);
  const isPulling = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const isRefreshing = useSharedValue(refreshing);
  // Tracks whether the current pull gesture has already crossed the refresh
  // threshold — the haptic fires ONCE per crossing, not every frame.
  const thresholdHit = useSharedValue(false);
  const fireThresholdHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lottieRef = useRef<LottieView>(null);
  // RNGH's NativeViewGestureHandler is a forwardRef component — using it as a
  // type resolves to ComponentType, so type the ref loosely (matches the
  // existing any-typed list refs elsewhere in the app).
  const nativeGestureRef = useRef<any>(null);
  const [lottieSource, setLottieSource] = useState<any>(getCachedLottieSync(S3_APP_ICON_LOTTIE_URL));
  // The pinned section block's real height (starts at the screen's estimate,
  // refined by onLayout below) and its own hide/show translate.
  const [sectionH, setSectionH] = useState(sectionHeaderH);
  const sectionTranslateY = useSharedValue(0);

  useEffect(() => {
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
      if (animData) setLottieSource(animData);
    });
    lottieRef.current?.play();
  }, []);

  // Programmatic refresh (tab-bar double-tap): screens emit this and the
  // bubble drops in exactly like a real pull — content slides down, bubble
  // appears below the chrome — then holds while `refreshing` runs. The
  // refreshing-effect below springs it back up when the refresh completes.
  const isFocusedRef = useRef(false);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("triggerPullRefresh", () => {
      // Only the FOCUSED screen's wrapper animates. Every tab stays mounted
      // (lazy, no unmountOnBlur) and all of them listen for this event —
      // without this guard the other tabs' bubbles would drop too and get
      // STUCK, because their `refreshing` never flips.
      if (!isFocusedRef.current) return;
      // Guard: if the user is mid-pull or a refresh is already running, the
      // gesture / refreshing state already own the bubble — skip so a
      // double-tap during a pull never double-animates it.
      if (isPulling.value || isRefreshing.value) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      pullDownY.value = withSpring(REFRESH_THRESHOLD, {
        damping: 18,
        stiffness: 160,
      });
      // Ease any hidden chrome back into view like a real pull would.
      headerTranslateY.value = withSpring(0, SCROLL_SHOW_SPRING);
      sectionTranslateY.value = withSpring(0, SCROLL_SHOW_SPRING);
      // Safety net: if the screen's refresh never flips `refreshing` (e.g. a
      // handler that calls its fetcher directly), snap the bubble back up so
      // it can never stay pulled down. The id is kept in a ref and cleared on
      // unmount so the callback can never touch a stale shared value after
      // this screen is gone.
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = setTimeout(() => {
        safetyTimeoutRef.current = null;
        if (!isRefreshing.value) {
          pullDownY.value = withTiming(0, { duration: 200 });
        }
      }, 2000);
    });
    return () => {
      sub.remove();
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    };
  }, [headerTranslateY, sectionTranslateY]);

  useEffect(() => {
    isRefreshing.value = refreshing;
    if (!refreshing) {
      // Only animate back up when refreshing finishes.
      // We don't animate down when refreshing starts because the gesture already handles that visually,
      // and we don't want it popping open automatically on initial screen mounts (e.g., background refetches).
      pullDownY.value = withSpring(0, {
        damping: 15,
        stiffness: 100,
      });
    }
  }, [refreshing, isRefreshing, pullDownY]);

  const pullStartTranslation = useSharedValue(0);

  const onRefreshJS = () => {
    onRefresh();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // If we are scrolled down the feed, we don't pull the bubble.
      // We continuously update the "start" translation so that if the user
      // scrolls to the top without lifting their finger, the pull starts from 0 exactly there.
      if (scrollY.value > 5) {
        pullStartTranslation.value = e.translationY;
        if (isPulling.value) {
          isPulling.value = false;
          pullDownY.value = withTiming(0, { duration: 200 });
        }
        return;
      }

      if (!isRefreshing.value && e.translationY > pullStartTranslation.value) {
        isPulling.value = true;
        const offset = e.translationY - pullStartTranslation.value;
        const tension = 120;
        pullDownY.value = MAX_PULL * (1 - Math.exp(-offset / tension));

        // Subtle haptic the moment the pull locks past the refresh
        // threshold (once per gesture). Pulling back below it re-arms, so a
        // second crossing in the same gesture also ticks.
        if (pullDownY.value > REFRESH_THRESHOLD && !thresholdHit.value) {
          thresholdHit.value = true;
          runOnJS(fireThresholdHaptic)();
        } else if (pullDownY.value <= REFRESH_THRESHOLD && thresholdHit.value) {
          thresholdHit.value = false;
        }

        // Instagram-style: pulling down at the top eases the header back in
        // BEFORE release. Any hidden chrome slides into view in sync with the
        // pull. NO rubber-band follow: the header stays put once visible — it
        // must never stretch down with the content (the pull bubble is what
        // moves). Driven by the show spring so it glides rather than snaps.
        const pull = pullDownY.value;
        const hidden = Math.max(0, -headerTranslateY.value);
        const reveal = Math.min(hidden, pull);
        headerTranslateY.value = withSpring(
          -(hidden - reveal),
          SCROLL_SHOW_SPRING,
        );

        // The pinned section chrome eases back in with the same pull — so
        // the title + filter pills slide in together with the header. No
        // follow, so it never stretches away from the header either.
        const sectionHidden = Math.max(0, -sectionTranslateY.value);
        const sectionReveal = Math.min(sectionHidden, pull);
        sectionTranslateY.value = withSpring(
          -(sectionHidden - sectionReveal),
          SCROLL_SHOW_SPRING,
        );
      }
    })
    .onEnd(() => {
      // Fresh gesture — next crossing should tick again.
      thresholdHit.value = false;
      if (isPulling.value && !isRefreshing.value) {
        isPulling.value = false;
        if (pullDownY.value > REFRESH_THRESHOLD) {
          isRefreshing.value = true;
          runOnJS(onRefreshJS)();
          pullDownY.value = withSpring(REFRESH_THRESHOLD, {
            damping: 15,
            stiffness: 100,
          });
        } else {
          pullDownY.value = withTiming(0, { duration: 200 });
        }
      }
      pullStartTranslation.value = 0;
      // Releasing at the top returns the header (and the pinned section
      // chrome) to their resting spots — fully visible — with the same spring
      // they eased in with, whether the refresh fired or not. Never touch
      // them when the pull happened mid-list.
      if (scrollY.value <= 5) {
        headerTranslateY.value = withSpring(0, SCROLL_SHOW_SPRING);
        sectionTranslateY.value = withSpring(0, SCROLL_SHOW_SPRING);
      }
    })
    // Establish priority: Wait for a deliberate 10px downward pull before activating.
    // Once activated, it will cancel child touchables (so they don't lock the swipe).
    // If the user swipes horizontally 20px (e.g. over a carousel), instantly fail this vertical gesture so the carousel can scroll.
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    // Let the native scroll view handle its own scrolling without any interference.
    // We explicitly tie this to the inner NativeViewGestureHandler.
    .simultaneousWithExternalGesture(nativeGestureRef);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: pullDownY.value }],
    };
  });

  // The section block lives per-screen (unlike the GLOBAL header), so it
  // isn't reset by MainHeader's focus effect — snap it back to visible when
  // this screen regains focus, so it never stays hidden under a fresh header.
  const isFocused = useIsFocused();
  isFocusedRef.current = isFocused;
  useEffect(() => {
    if (isFocused && sectionHeader) {
      sectionTranslateY.value = withSpring(0, SCROLL_SHOW_SPRING);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const iconStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      pullDownY.value,
      [0, REFRESH_THRESHOLD * 0.8],
      [0.5, 1],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      pullDownY.value,
      [0, REFRESH_THRESHOLD * 0.5],
      [0, 1],
      Extrapolation.CLAMP,
    );

    // The logo should be perfectly centered within the space created by pullDownY.
    // Space available is pullDownY.value, bubble height is bubbleSize.
    // To center it: (space - height) / 2
    const bubbleSize = iconSize + 12;
    const ty = (pullDownY.value - bubbleSize) / 2;

    return {
      opacity,
      // Track the pinned section block (section screens only) so the bubble
      // stays glued just below the headings bar during the pull — exactly
      // like home feed shows it below the header bar. Without this, the
      // opaque section block slides down over the static bubble and covers it.
      transform: [
        { translateY: ty + sectionTranslateY.value },
        { scale },
      ],
    };
  });

  const animatedLottieProps = useAnimatedProps(() => {
    // Map pull distance directly to Lottie animation progress
    const progress = interpolate(
      pullDownY.value,
      [0, REFRESH_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    );
    return {
      progress,
    };
  });

  const bubbleSize = iconSize + 12;

  // We have to inject onScroll into the child to track scrollY
  let injected = children;
  if (React.isValidElement(children)) {
    injected = React.cloneElement(children as React.ReactElement<any>, {
      onScroll: (e: any) => {
        (children as React.ReactElement<any>).props.onScroll?.(e);
        const y = e.nativeEvent.contentOffset.y;
        // Instagram-style hide/show — shared with Wallet/Settings via
        // applyGlobalScrollOffset. `scrollY` doubles as this list's previous
        // offset AND the pan gesture's "are we at the top?" flag.
        applyGlobalScrollOffset(y, scrollY.value, {
          headerTranslateY,
          footerTranslateY,
          headerHeight,
          footerHeight,
        });
        // The pinned section chrome (title + pills) hides and shows in
        // lockstep with the main header, using its own full hide distance.
        if (sectionHeader) {
          applySectionScrollOffset(
            y,
            scrollY.value,
            sectionTranslateY,
            headerOffset + sectionH,
          );
        }
        scrollY.value = y;
      },
      scrollEventThrottle: 16,
      // Remove native bounce so it doesn't fight our custom gesture on iOS
      bounces: false,
      // Completely remove default native RefreshControl
      refreshControl: undefined,
      // Section screens: offset the content below the pinned block (the
      // screen's own paddingTop, if any, is overridden by the later entry).
      contentContainerStyle: sectionHeader
        ? [
            (children as React.ReactElement<any>).props.contentContainerStyle,
            { paddingTop: headerOffset + sectionH },
          ]
        : (children as React.ReactElement<any>).props.contentContainerStyle,
    });
  }

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        <Animated.View style={[styles.iconWrap, { top: headerOffset + sectionH }, iconStyle]}>
          <View
            style={[
              styles.iconBubble,
              {
                width: bubbleSize,
                height: bubbleSize,
                borderRadius: bubbleSize / 2,
                overflow: "hidden",
                backgroundColor: colors.bg.elevated,
                borderColor: colors.border,
              },
            ]}
          >
            {refreshing ? (
              lottieSource ? (
                <View style={{ width: bubbleSize, height: bubbleSize, borderRadius: bubbleSize / 2, overflow: 'hidden', backgroundColor: 'transparent' }}>
                  <LottieView
                    source={lottieSource}
                    autoPlay={true}
                    loop={true}
                    cacheComposition={false}
                    resizeMode="cover"
                    style={{ width: '100%', height: '100%' }}
                  />
                </View>
              ) : (
                <Image 
                  source={require('../../../assets/icon.png')} 
                  style={{ width: bubbleSize, height: bubbleSize, borderRadius: bubbleSize / 2 }} 
                  resizeMode="cover" 
                />
              )
            ) : (
              lottieSource ? (
                <View style={{ width: bubbleSize, height: bubbleSize, borderRadius: bubbleSize / 2, overflow: 'hidden', backgroundColor: 'transparent' }}>
                  <AnimatedLottieView
                    source={lottieSource}
                    animatedProps={animatedLottieProps}
                    cacheComposition={false}
                    resizeMode="cover"
                    style={{ width: '100%', height: '100%' }}
                  />
                </View>
              ) : (
                <Image 
                  source={require('../../../assets/icon.png')} 
                  style={{ width: bubbleSize, height: bubbleSize, borderRadius: bubbleSize / 2 }} 
                  resizeMode="cover" 
                />
              )
            )}
          </View>
        </Animated.View>
        <Animated.View style={[styles.content, animatedStyle]}>
          {header}
          <NativeViewGestureHandler ref={nativeGestureRef} disallowInterruption={true}>
            {injected}
          </NativeViewGestureHandler>
        </Animated.View>

        {/* Pinned section chrome — title + filter pills below the main
            header, sliding away with it (zIndex 50: above the content and
            pull bubble, below MainHeader's 100). Opaque so results scroll
            under it cleanly. Shared SectionChrome component — the same block
            Wallet/Settings render for their headings. */}
        {sectionHeader ? (
          <SectionChrome
            sectionY={sectionTranslateY}
            setSectionH={setSectionH}
            topOffset={headerOffset}
          >
            {sectionHeader}
          </SectionChrome>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  content: {
    flex: 1,
  },
  iconWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 100,
    overflow: "hidden",
    zIndex: 0, // Behind the content so the content reveals it
  },
  iconBubble: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#7C3AED",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
