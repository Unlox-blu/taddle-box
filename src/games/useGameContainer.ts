/**
 * useGameContainer — responsive game scaling via uniform transform.
 *
 * When the keyboard opens or chat panel appears, the parent's paddingBottom
 * increases → the available height shrinks. Instead of recomputing the board
 * size and leaving everything else full-size, this hook computes a single
 * scale factor that shrinks the ENTIRE game (board + player cards + buttons
 * + dice + everything) as one unit.
 *
 * Usage:
 *   const { onLayout, scale } = useGameContainer();
 *   <View onLayout={onLayout} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
 *     <View style={{ transform: [{ scale }], width: NATURAL_W, height: NATURAL_H }}>
 *       ...entire game content at natural size...
 *     </View>
 *   </View>
 *
 * The game always renders at its full natural dimensions. When space is
 *充足的, scale = 1 (no change). When space shrinks, scale drops below 1
 * so everything fits proportionally.
 */

import { useState, useCallback } from "react";
import { LayoutChangeEvent } from "react-native";

type Opts = {
  /** Natural (unscaled) width of the game content. */
  naturalWidth: number;
  /** Natural (unscaled) height of the game content. */
  naturalHeight: number;
  /** Horizontal padding to subtract from available space. Default 0. */
  paddingX?: number;
  /** Minimum scale factor. Default 0.5 (game can shrink to 50%). */
  minScale?: number;
};

export function useGameContainer(opts: Opts) {
  const { naturalWidth, naturalHeight, paddingX = 0, minScale = 0.5 } = opts;

  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize((prev) => {
      if (Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1)
        return prev;
      return { w: width, h: height };
    });
  }, []);

  const availW = Math.max(0, containerSize.w - paddingX * 2);
  const availH = Math.max(0, containerSize.h);

  // Scale = the largest factor that fits both width and height
  const scaleX = naturalWidth > 0 ? availW / naturalWidth : 1;
  const scaleY = naturalHeight > 0 ? availH / naturalHeight : 1;
  const scale = Math.max(minScale, Math.min(1, scaleX, scaleY));

  return { onLayout, scale, containerW: containerSize.w, containerH: containerSize.h };
}
