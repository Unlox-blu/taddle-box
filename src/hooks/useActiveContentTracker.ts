import { useState, useRef, useCallback, useEffect } from "react";
import { Dimensions } from "react-native";
import { resolveContentId } from "../utils/content.util";

type Rect = { top: number; bottom: number };

type Options = {
  /** Maps any list item to a content ID. When provided, the hook uses this
   *  to resolve IDs from items that may not have a top-level `id` field
   *  (e.g. mixed-type search/bookmark rows). Returns null for non-trackable
   *  items (headers, people, etc.) — those still get heights tracked but
   *  are never candidates for the active content. */
  getContentId?: (item: any) => string | null;
  listHeaderOffset?: number;
  headerHeight?: number;
  spotlightBoundary?: number;
};

export function useActiveContentTracker(
  items: any[],
  options?: Options,
) {
  const [activeContentId, setActiveContentId] = useState<string | null>(null);
  const [debugZone, setDebugZone] = useState<{ top: number; height: number } | null>(null);

  const viewportH = useRef(Dimensions.get("window").height).current;

  const candidateIdsRef = useRef<Set<string>>(new Set());
  const heightMapRef = useRef<Map<string, number>>(new Map());
  const scrollYRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);

  const recalculate = () => {
    const viewportTop = scrollYRef.current;
    const viewportBottom = viewportTop + viewportH;

    let bestId: string | null = null;
    let bestScore = -Infinity;
    let bestTop = Infinity;

    // 10% Focus Zone height
    const FOCUS_ZONE_RATIO = 0.1;
    const focusHeight = viewportH * FOCUS_ZONE_RATIO;

    // Calculate physical sliding top — starts at y=0 (screen top), slides to
    // screen centre over exactly targetPhysicalTop pixels of scrolling.
    // headerOffset still anchors the content layout below.
    const scrollY = Math.max(0, viewportTop);
    const headerOffset =
      (options?.listHeaderOffset || 0) + (options?.headerHeight || 0);
    const targetPhysicalTop = (viewportH - focusHeight) / 2;
    const startPhysicalTop = options?.headerHeight || 0; // below MainHeader only

    // Slide from start to target mathematically proportional to the distance
    const transitionDistance = Math.max(
      1,
      targetPhysicalTop - startPhysicalTop,
    );
    const progress = Math.min(1, scrollY / transitionDistance);
    const currentPhysicalTop =
      startPhysicalTop + (targetPhysicalTop - startPhysicalTop) * progress;

    if (__DEV__) {
      setDebugZone({ top: currentPhysicalTop, height: focusHeight });
    }

    const focusTop = viewportTop + currentPhysicalTop;
    const focusBottom = focusTop + focusHeight;

    const idsToProcess = new Set(candidateIdsRef.current);
    if (activeIdRef.current) {
      idsToProcess.add(activeIdRef.current);
    }

    // The top of the list content is physically shifted down by the app header height
    const topOffset = options?.headerHeight || 0;

    // Accumulate absolute post positions starting from the header offsets.
    // FlashList's contentContainerStyle.paddingTop physically shifts items down,
    // so we must include options.headerHeight in the starting Y offset.
    let currentY =
      (options?.listHeaderOffset || 0) + (options?.headerHeight || 0);
    const computedLayout = new Map<string, Rect>();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Use the same ID resolver as onViewableItemsChanged so the keys in
      // computedLayout match the keys in candidateIdsRef and heightMapRef.
      const contentId = getContentIdRef.current
        ? getContentIdRef.current(item)
        : resolveContentId(item);
      const trackId = contentId || `non-trackable-${i}`;
      
      const h = heightMapRef.current.get(trackId);
      if (!h) continue;
      
      if (contentId) {
        computedLayout.set(contentId, { top: currentY, bottom: currentY + h });
      }
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

      // The user requested: an item ONLY becomes active if it occupies more
      // than 50% of the focus area.
      if (focusIntersection > focusHeight * 0.5) {
        // Since it's mathematically impossible for more than one item to occupy
        // >50% of a fixed area at the exact same time, this item is the undisputed winner.
        bestId = id;
        break; // We found the winner, no need to check other items
      }
    }

    if (bestId === activeIdRef.current) {
      return;
    }

    activeIdRef.current = bestId;
    setActiveContentId(bestId);
  };

  const recalculateRef = useRef(recalculate);
  recalculateRef.current = recalculate;

  const getContentIdRef = useRef(options?.getContentId);
  getContentIdRef.current = options?.getContentId;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 15,
    minimumViewTime: 0,
  }).current;

  const onViewableItemsChanged = useRef((info: any) => {
    const viewableItems: any[] = info?.viewableItems ?? [];
    const resolveId = getContentIdRef.current;

    const ids = viewableItems
      .filter((v) => v.isViewable)
      .map((v) =>
        resolveId ? resolveId(v.item) : resolveContentId(v.item) || null,
      )
      .filter((id): id is string => id !== null);

    candidateIdsRef.current = new Set(ids);
    recalculateRef.current();
  }).current;

  // Debounce trackLayout-triggered recalculations. During initial render,
  // onLayout fires for every visible item in rapid succession. Each fires
  // recalculate(), changing the sequential layout and flipping activePostId
  // before all items are measured — causing the video to mount then unmount
  // repeatedly. Batching via requestAnimationFrame ensures one recalculate
  // per frame after all measurements settle.
  const layoutDirtyRef = useRef(false);
  const layoutRafRef = useRef<number | null>(null);

  const scheduleRecalc = useCallback(() => {
    if (layoutDirtyRef.current) return; // already scheduled this frame
    layoutDirtyRef.current = true;
    layoutRafRef.current = requestAnimationFrame(() => {
      layoutDirtyRef.current = false;
      layoutRafRef.current = null;
      recalculateRef.current();
    });
  }, []);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (layoutRafRef.current != null)
        cancelAnimationFrame(layoutRafRef.current);
    };
  }, []);

  const trackLayout = useCallback(
    (id: string, rect: Rect) => {
      const height = rect.bottom - rect.top;
      if (heightMapRef.current.get(id) === height) {
        return;
      }
      heightMapRef.current.set(id, height);
      scheduleRecalc();
    },
    [scheduleRecalc],
  );

  const handleScroll = useCallback((e: any) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
    recalculateRef.current();
  }, []);

  return {
    activeContentId,
    viewabilityConfig,
    onViewableItemsChanged,
    trackLayout,
    handleScroll,
    debugZone,
  };
}
