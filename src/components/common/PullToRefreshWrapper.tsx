import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Image } from "react-native";
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useThemeColors } from "../../context/ThemeContext";
import LottieView from "lottie-react-native";

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
}

export default function PullToRefreshWrapper({
  refreshing,
  onRefresh,
  children,
  header,
  iconSize = 36,
}: Props) {
  const colors = useThemeColors();
  const pullDownY = useSharedValue(0);
  const isPulling = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const isRefreshing = useSharedValue(refreshing);
  const lottieRef = useRef<LottieView>(null);
  const [isAtTop, setIsAtTop] = useState(true);
  const [lottieSource, setLottieSource] = useState<any>(getCachedLottieSync(S3_APP_ICON_LOTTIE_URL));

  useEffect(() => {
    getCachedLottie(S3_APP_ICON_LOTTIE_URL).then((animData) => {
      if (animData) setLottieSource(animData);
    });
    lottieRef.current?.play();
  }, []);

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

  const onRefreshJS = () => {
    onRefresh();
  };

  const panGesture = Gesture.Pan()
    .onChange((e) => {
      // Only allow pulling down if we are at or near the top of the scroll view
      if (scrollY.value <= 10 && e.translationY > 0 && !isRefreshing.value) {
        if (!isPulling.value) isPulling.value = true;
      }
      if (isPulling.value && !isRefreshing.value) {
        // Smooth exponential rubber band effect
        const offset = Math.max(0, e.translationY);
        const tension = 120;
        pullDownY.value = MAX_PULL * (1 - Math.exp(-offset / tension));
      }
    })
    .onEnd(() => {
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
    })
    .enabled(isAtTop)
    // Only activate on downward swipe (pulling down).
    // Fail if they swipe upward (scrolling down the feed).
    .activeOffsetY(5)
    .failOffsetY(-20)
    .simultaneousWithExternalGesture(Gesture.Native());

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: pullDownY.value }],
    };
  });

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
      transform: [{ translateY: ty }, { scale }],
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
        scrollY.value = y;
        
        // Disable gesture if not at top to prevent swallowing scroll events
        if (y <= 5 && !isAtTop) setIsAtTop(true);
        else if (y > 5 && isAtTop) setIsAtTop(false);
      },
      scrollEventThrottle: 16,
      // Remove native bounce so it doesn't fight our custom gesture on iOS
      bounces: false,
      // Completely remove default native RefreshControl
      refreshControl: undefined,
    });
  }

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
        <Animated.View style={[styles.iconWrap, iconStyle]}>
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
                    renderMode="SOFTWARE"
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
                    renderMode="SOFTWARE"
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
          {injected}
        </Animated.View>
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
