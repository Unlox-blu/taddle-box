import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useSharedValue, SharedValue, withSpring, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScrollContextType = {
  headerTranslateY: SharedValue<number>;
  footerTranslateY: SharedValue<number>;
  headerHeight: number;
  footerHeight: number;
};

const ScrollContext = createContext<ScrollContextType | null>(null);

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const headerTranslateY = useSharedValue(0);
  const footerTranslateY = useSharedValue(0);

  // headerHeight must equal MainHeader's rendered height (paddingTop
  // insets.top + 4, 40px icon row, paddingBottom 10).
  const headerHeight = 54 + insets.top;
  const footerHeight = 85 + insets.bottom;

  return (
    <ScrollContext.Provider value={useMemo(() => ({ headerTranslateY, footerTranslateY, headerHeight, footerHeight }), [headerTranslateY, footerTranslateY, headerHeight, footerHeight])}>
      {children}
    </ScrollContext.Provider>
  );
}

// Spring tuning — snappy hide, gentle ease back in (Instagram-style).
// overshootClamping is important: without it the chrome springs PAST the
// hidden position and bounces back, letting a sliver of the header/footer
// peek out at the end of pages.
export const SCROLL_HIDE_SPRING = {
  damping: 22,
  stiffness: 280,
  mass: 0.9,
  overshootClamping: true,
};
export const SCROLL_SHOW_SPRING = {
  damping: 17,
  stiffness: 170,
  mass: 0.9,
  overshootClamping: true,
};

// How the chrome eases back in when the user scrolls UP. 120ms was a hard
// snap (felt glitchy mid-scroll); this is a longer ease-out so the reveal
// reads as a deliberate motion instead of a jump. Starts fast (so it still
// feels responsive while the finger is moving) and settles smoothly.
export const SCROLL_SHOW_TIMING = {
  duration: 260,
  easing: Easing.out(Easing.cubic),
};

/**
 * Single source of truth for the Instagram-style header/footer hide-show.
 * The chrome rides up WITH the user's scroll — no sudden spring-away: as the
 * content scrolls down, the header translates up and the footer translates
 * down by the same delta, clamped at the full hide distances. Scrolling back
 * up (content moving down) eases them back into view with a smooth
 * ease-out (SCROLL_SHOW_TIMING). Reaching y === 0 always restores both.
 *
 * `prevY` is the caller's last-seen offset (each scrollable tracks its own so
 * multiple lists on one screen don't fight).
 */
export function applyGlobalScrollOffset(
  y: number,
  prevY: number,
  ctx: ScrollContextType,
) {
  if (y > 0) {
    const dy = y - prevY;
    if (dy > 0) {
      // Scrolling down — the chrome tracks the finger proportionally.
      const nextHeader = ctx.headerTranslateY.value - dy;
      ctx.headerTranslateY.value = Math.max(-ctx.headerHeight, nextHeader);
      const nextFooter = ctx.footerTranslateY.value + dy;
      ctx.footerTranslateY.value = Math.min(ctx.footerHeight, nextFooter);
    } else if (dy < 0) {
      // Scrolling up — the chrome eases back in smoothly (no hard snap).
      ctx.headerTranslateY.value = withTiming(0, SCROLL_SHOW_TIMING);
      ctx.footerTranslateY.value = withTiming(0, SCROLL_SHOW_TIMING);
    }
  } else if (y <= 0) {
    ctx.headerTranslateY.value = withSpring(0, SCROLL_SHOW_SPRING);
    ctx.footerTranslateY.value = withSpring(0, SCROLL_SHOW_SPRING);
  }
}

/**
 * Drives a pinned section block (a screen's title + filter pills) that hides
 * and shows in lockstep with the main header. `sectionH` is the block's FULL
 * hide distance (headerHeight + its own height) so it leaves the screen
 * completely — same finger-tracking behavior as the header: rides up with the
 * scroll, eases back in on scroll-up. Used by PullToRefreshWrapper via its
 * `sectionHeader` prop and by SearchScreen for the search bar + pills.
 */
export function applySectionScrollOffset(
  y: number,
  prevY: number,
  sectionY: SharedValue<number>,
  sectionH: number,
) {
  if (y > 0) {
    const dy = y - prevY;
    if (dy > 0) {
      const next = sectionY.value - dy;
      sectionY.value = Math.max(-sectionH, next);
    } else if (dy < 0) {
      // Scrolling up — the section chrome eases back in smoothly (no hard snap).
      sectionY.value = withTiming(0, SCROLL_SHOW_TIMING);
    }
  } else if (y <= 0) {
    sectionY.value = withSpring(0, SCROLL_SHOW_SPRING);
  }
}

/**
 * Returns an `onScroll` handler that feeds a scrollable's offset into the
 * global header/footer hide-show. Use on scrollables that are NOT wrapped in
 * PullToRefreshWrapper (e.g. Wallet, Settings) so they behave identically.
 */
export function useGlobalScrollHandler() {
  const ctx = useGlobalScroll();
  const prevY = useSharedValue(0);
  return useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      applyGlobalScrollOffset(y, prevY.value, ctx);
      prevY.value = y;
    },
    [ctx, prevY],
  );
}

export function useGlobalScroll() {
  const ctx = useContext(ScrollContext);
  if (!ctx) {
    throw new Error('useGlobalScroll must be used within a ScrollProvider');
  }
  return ctx;
}
