import { useState, useRef, useCallback, useEffect } from "react";
import { Dimensions } from "react-native";

type Rect = { top: number; bottom: number };

type Options = {
  getPostId?: (item: any) => string | null;
  listHeaderOffset?: number;
  headerHeight?: number;
  spotlightBoundary?: number;
};

export function useActivePostTracking(
  posts: { id: string }[],
  options?: Options,
) {
  const [activePostId, setActivePostId] = useState<string | null>(null);

  const viewportH = useRef(Dimensions.get("window").height).current;

  const candidateIdsRef = useRef<Set<string>>(new Set());
  const heightMapRef = useRef<Map<string, number>>(new Map());
  const scrollYRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);

  const recalculate = () => {
    const viewportTop = scrollYRef.current;

    let bestId: string | null = null;
    let bestScore = -Infinity;

    // 35% focus window perfectly centered in the screen
    const FOCUS_ZONE_RATIO = 0.35;
    const focusHeight = viewportH * FOCUS_ZONE_RATIO;
    const focusTop = viewportTop + (viewportH - focusHeight) / 2;
    const focusBottom = focusTop + focusHeight;

    const idsToProcess = new Set(candidateIdsRef.current);
    if (activeIdRef.current) {
      idsToProcess.add(activeIdRef.current);
    }

    // The top of the list content is physically shifted down by the app header height
    const topOffset = options?.headerHeight || 0;
    
    // Use the explicit spotlightBoundary if provided, otherwise fallback to the entire list header
    const spotlightHeight = options?.spotlightBoundary ?? options?.listHeaderOffset ?? 0;

    // Home Feed: if the spotlight carousel is in the focus window,
    // the active post engine should NOT start.
    if (spotlightHeight > 0) {
      const spotlightTop = topOffset;
      const spotlightBottom = spotlightTop + spotlightHeight;
      const intersection = Math.max(
        0,
        Math.min(spotlightBottom, focusBottom) - Math.max(spotlightTop, focusTop),
      );
      if (intersection > 0) {
        if (activeIdRef.current !== null) {
          activeIdRef.current = null;
          setActivePostId(null);
        }
        return;
      }
    }

    // Accumulate absolute post positions starting from the header offsets.
    // FlashList's contentContainerStyle.paddingTop physically shifts items down,
    // so we must include options.headerHeight in the starting Y offset.
    let currentY =
      (options?.listHeaderOffset || 0) + (options?.headerHeight || 0);
    const computedLayout = new Map<string, Rect>();
    for (const post of posts) {
      const h = heightMapRef.current.get(post.id) || 500;
      computedLayout.set(post.id, { top: currentY, bottom: currentY + h });
      currentY += h;
    }

    for (const id of idsToProcess) {
      const rect = computedLayout.get(id);
      if (!rect) continue;

      // Focus Zone Intersection (Primary Signal)
      // How many pixels of this post fall inside the center focus zone?
      const focusIntersection = Math.max(
        0,
        Math.min(rect.bottom, focusBottom) - Math.max(rect.top, focusTop),
      );

      const postHeight = rect.bottom - rect.top;

      // The user requested: "how much of the card the active zone is covering"
      // Score is now the percentage of the post that is inside the focus zone (0.0 to 1.0)
      const score = postHeight > 0 ? focusIntersection / postHeight : 0;

      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    if (!bestId || bestId === activeIdRef.current) {
      return;
    }

    activeIdRef.current = bestId;
    setActivePostId(bestId);
  };

  const recalculateRef = useRef(recalculate);
  recalculateRef.current = recalculate;

  const getPostIdRef = useRef(options?.getPostId);
  getPostIdRef.current = options?.getPostId;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 15,
    minimumViewTime: 0,
  }).current;

  const onViewableItemsChanged = useRef((info: any) => {
    const viewableItems: any[] = info?.viewableItems ?? [];
    const resolveId = getPostIdRef.current;

    const ids = viewableItems
      .filter((v) => v.isViewable)
      .map((v) => (resolveId ? resolveId(v.item) : (v.item?.id ?? null)))
      .filter((id): id is string => id !== null);

    candidateIdsRef.current = new Set(ids);
    recalculateRef.current();
  }).current;

  const trackLayout = useCallback((id: string, rect: Rect) => {
    const height = rect.bottom - rect.top;
    if (heightMapRef.current.get(id) === height) {
      return;
    }
    heightMapRef.current.set(id, height);
    recalculateRef.current();
  }, []);

  const handleScroll = useCallback((e: any) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
    recalculateRef.current();
  }, []);

  return {
    activePostId,
    viewabilityConfig,
    onViewableItemsChanged,
    trackLayout,
    handleScroll,
  };
}
