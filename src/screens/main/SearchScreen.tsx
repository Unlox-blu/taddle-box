import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Share,
  RefreshControl,
  Modal,
  ScrollView,
  Keyboard,
} from "react-native";
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useIsFocused } from "@react-navigation/native";
import { useTheme, useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { searchService, type SearchType } from "../../services/search.service";
import { userService } from "../../services/user.service";
import { communityService } from "../../services/community.service";
import { hashtagService } from "../../services/hashtag.service";
import { mapNotificationRow } from "../../services/notification.service";
import { walletService } from "../../services/wallet.service";
import { xpService } from "../../services/xp.service";
import type { HomeStackParamList, Post, Transaction } from "../../types";
import PullToRefreshWrapper from "../../components/common/PullToRefreshWrapper";
import StateBlock from "../../components/common/StateBlock";
import Animated, { useSharedValue, useAnimatedStyle } from "react-native-reanimated";
import {
  useGlobalScroll,
  applySectionScrollOffset,
} from "../../context/ScrollContext";
import { useToggleLike, useToggleSave } from "../../mutations/posts";
import { themedAlert } from "../../components/common/ThemedAlert";
import { makeStyles } from "../../components/search/searchStyles";
import {
  ROW_RENDERERS,
  GenericRow,
  type RowCtx,
} from "../../components/search/SearchRows";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useActivePostTracking } from "../../hooks/useActivePostTracking";

type Props = NativeStackScreenProps<HomeStackParamList, "Search">;

// Reddit-style filter-token pattern: a boxed token becomes a removable chip.
// `@user` scopes results to people involved, `c/community` scopes them to that
// community's posts, `#tag` scopes them to posts carrying that hashtag — they
// combine (e.g. "@pravin_viswa c/tvk #peaceful").
const TOKEN_FILTER_RE = /^(@[^\s@]+|c\/[^\s/]+|#[^\s#]+|\.\/[a-z]+)$/i;

const SETTINGS_ITEMS = [
  { id: "edit_profile", title: "Edit Profile", icon: "person-outline", route: "EditProfile", keywords: ["name", "avatar", "bio", "profile"] },
  { id: "app_lock", title: "Global Lock & PIN", icon: "lock-closed-outline", route: "Settings", keywords: ["security", "passcode", "fingerprint", "face id", "lock"] },
  { id: "change_password", title: "Change Password", icon: "key-outline", route: "ChangePassword", keywords: ["security", "password"] },
  { id: "phone", title: "Phone Number", icon: "call-outline", route: "ChangePhone", keywords: ["mobile", "phone"] },
  { id: "email", title: "Email Address", icon: "mail-outline", route: "ChangeEmail", keywords: ["contact", "email"] },
  { id: "notifications", title: "Notification Preferences", icon: "notifications-outline", route: "Settings", keywords: ["alerts", "push", "emails", "notifications"] },
  { id: "privacy", title: "Account Privacy", icon: "eye-off-outline", route: "Settings", keywords: ["public", "private", "activity", "status", "privacy"] },
  { id: "preferences", title: "App Preferences", icon: "options-outline", route: "Settings", keywords: ["theme", "dark mode", "language", "content", "safe search", "haptics", "sound", "preferences"] },
  { id: "terms", title: "Terms of Service", icon: "document-text-outline", route: "Terms", keywords: ["legal", "rules", "terms"] },
  { id: "privacy_policy", title: "Privacy Policy", icon: "shield-checkmark-outline", route: "Privacy", keywords: ["legal", "data", "privacy"] },
  { id: "delete_account", title: "Delete Account", icon: "trash-outline", route: "Settings", keywords: ["remove", "close", "deactivate", "delete"] },
  { id: "logout", title: "Log Out", icon: "log-out-outline", route: "Settings", keywords: ["sign out", "exit", "logout"] },
];

// Result kinds the unified search can return, plus the legacy SearchType tabs
// still used by bookmarks/settings/notifications scopes.
type ResultType = string;
type Row =
  | { isHeader: true; title: string; type: ResultType }
  | { isHeader: false; item: any; type: ResultType };

export default function SearchScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { footerHeight } = useGlobalScroll();

  // If passed from hashtag click or header context
  const initialQuery: string = (route.params as any)?.query || "";
  const initialTab = (route.params as any)?.tab || "all";
  // Reddit-style community scoping — opened from a community detail page,
  // results are limited to that community's posts. Local state so the chip's
  // X can clear the scope.
  const initialScope = (route.params as any)?.scopeCommunity || "";
  // Reddit-style author scoping — opened from a profile page, results are
  // limited to that user's posts (@username pre-applied as a chip). May be
  // comma-separated (e.g. "me,originalAuthor" from the repost sheet's
  // "View my reposts") — each becomes its own @user chip.
  const initialAuthor = (route.params as any)?.authorFilter || "";

  const [query, setQuery] = useState(initialQuery);
  // The unified search has ONE view ("all"); only the notifications scope
  // keeps its n-* tabs. Legacy tab params (hashtags, f-all, posts, …) all
  // normalize to "all".
  const [activeTab, setActiveTab] = useState<string>(
    String(initialTab).startsWith("n-") ? initialTab : "all",
  );
  const [loading, setLoading] = useState(false);
  // Reddit-style community scoping — MULTIPLE c/<slug> chips can be active
  // (c/a c/b in the search box); each becomes its own removable chip and the
  // API gets them comma-joined. Any one matching scopes the results.
  const [communityFilters, setCommunityFilters] = useState<string[]>(
    initialScope ? [initialScope] : [],
  );
  const communityRef = useRef(communityFilters);
  communityRef.current = communityFilters;
  // Multiple people can be tagged (@a @b) — each becomes its own chip and the
  // API gets them comma-joined; any one of them being involved matches.
  const [authorFilters, setAuthorFilters] = useState<string[]>(
    initialAuthor
      ? String(initialAuthor)
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [],
  );
  const authorRef = useRef(authorFilters);
  authorRef.current = authorFilters;
  // Hashtags can be tagged too (#tag) — each becomes its own chip.
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const tagRef = useRef(tagFilters);
  tagRef.current = tagFilters;
  // Source scope — opened from Bookmarks (search saved content) or Settings
  // (search own posts). Rendered as its own chip with an X.
  const [source, setSource] = useState<string>(
    (route.params as any)?.source || "",
  );
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const [sortBy, setSortBy] = useState<string>("relevance");
  const sortByRef = useRef(sortBy);
  sortByRef.current = sortBy;

  // TIME window from the filter modal — sent as the `time` param.
  const [timeWindow, setTimeWindow] = useState<string>("all_time");
  const timeWindowRef = useRef(timeWindow);
  timeWindowRef.current = timeWindow;

  // Active unified-search pill — "all" is the mixed view (the backend always
  // returns it as the first pill); otherwise one of the server's result types
  // (posts | comments | media | …). Seeded from the route so opening search
  // from the Events/Games/Communities tabs pre-selects that type. Changing it
  // re-fetches (part of the search identity, so caches reset).
  const initialType = (route.params as any)?.type || "all";
  const [resultType, setResultType] = useState<string>(initialType);
  const resultTypeRef = useRef(resultType);
  resultTypeRef.current = resultType;
  // Type pills the server returned for the current query — each carries its
  // own display label, so the pill row is rendered verbatim. Re-populated on
  // every unified fetch.
  const [serverTypes, setServerTypes] = useState<
    { type: string; label: string; count?: number }[]
  >([]);

  const [showFilters, setShowFilters] = useState(false);
  // Draft values for the filter modal — only committed to the live search
  // when "Apply Filters" is pressed, so tapping chips inside the modal does
  // NOT re-run the search while it's still open.
  const [draftSort, setDraftSort] = useState("relevance");
  const [draftTime, setDraftTime] = useState("all_time");

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  useEffect(() => {
    AsyncStorage.getItem("@recent_searches").then((res) => {
      if (res) setRecentSearches(JSON.parse(res));
    });
  }, []);

  const saveRecentSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const updated = [
      trimmed,
      ...recentSearches.filter((s) => s !== trimmed),
    ].slice(0, 10);
    setRecentSearches(updated);
    await AsyncStorage.setItem("@recent_searches", JSON.stringify(updated));
  };

  // ── Reddit-style filter chips ──
  // A token typed in the box and completed with a space (or committed on
  // submit) becomes a removable chip: `@user` scopes to that author's posts,
  // `c/community` scopes to that community's posts. They combine — e.g.
  // "@pravin_viswa c/tvk" returns that person's posts inside that community —
  // and the free text left in the box is what's actually searched.
  const applyTokenFilter = (token: string) => {
    const t = token.toLowerCase();
    if (t.startsWith("@")) {
      const u = token.slice(1);
      setAuthorFilters((prev) => (prev.includes(u) ? prev : [...prev, u]));
    } else if (t.startsWith("c/")) {
      const slug = token.slice(2);
      setCommunityFilters((prev) =>
        prev.includes(slug) ? prev : [...prev, slug],
      );
    } else if (t.startsWith("#")) {
      const tag = token.slice(1);
      setTagFilters((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    } else if (t.startsWith("./")) {
      const destination = t.slice(2);
      if (destination === "settings") {
        (navigation as any).navigate("Settings");
      } else if (destination === "bookmarks") {
        (navigation as any).navigate("Bookmarks");
      } else if (destination === "notifications") {
        (navigation as any).navigate("Notifications");
      }
    }
  };

  // Commit every complete filter token in `text` (all tokens except the
  // trailing one, which may still be mid-typing) and return the free text
  // that remains. When the text ends with a space the last token is complete
  // too, so it's committed as well.
  const commitFilterTokens = (text: string): string => {
    const tokens = text.split(/\s+/).filter(Boolean);
    const complete = text.endsWith(" ");
    const commitCount = complete
      ? tokens.length
      : Math.max(0, tokens.length - 1);
    let freeText = text;
    for (let i = 0; i < commitCount; i++) {
      const t = tokens[i];
      if (TOKEN_FILTER_RE.test(t)) {
        applyTokenFilter(t);
        freeText = freeText.replace(t, "").trim();
      }
    }
    return freeText;
  };

  const handleQueryChange = (text: string) => {
    setQuery(commitFilterTokens(text));
  };

  // Pressing search (keyboard return or the search icon) commits a trailing
  // filter token (e.g. "@foo" with no space) so it still applies instead of
  // being searched as plain text, then fires an explicit request — with an
  // empty box this hits the API with all params empty so the backend returns
  // the default types + discoveries for each type.
  const handleSubmit = () => {
    const next = commitFilterTokens(query + " ");
    if (next !== query) setQuery(next);
    const searchToSave = next.trim() || query.trim();
    saveRecentSearch(searchToSave);
    fetchResults(searchToSave, activeTab, 1, false);
  };

  // An uncommitted trailing @/c/ token isn't searched as plain text — strip
  // it until it's completed (space) and committed as a chip.
  const trailingToken = (() => {
    const tokens = query.split(/\s+/).filter(Boolean);
    const last = tokens[tokens.length - 1];
    return last && TOKEN_FILTER_RE.test(last) ? last : "";
  })();
  // Suggestions while typing: the trailing token may still be mid-typing
  // ("@", "@fo", "c/tv") — detect it by prefix so matching users (@) and
  // communities (c/) can be offered to tap-and-commit as a chip.
  const trailingRaw = (() => {
    const tokens = query.split(/\s+/).filter(Boolean);
    return tokens[tokens.length - 1] || "";
  })();
  const suggestionKind: "user" | "community" | "tag" | "nav" | null =
    trailingRaw.startsWith("@")
      ? "user"
      : trailingRaw.startsWith("c/")
        ? "community"
        : trailingRaw.startsWith("#")
          ? "tag"
          : trailingRaw.startsWith("./")
            ? "nav"
            : null;
  const suggestionKeyword = trailingRaw.slice(
    suggestionKind === "user"
      ? 1
      : suggestionKind === "community"
        ? 2
        : suggestionKind === "tag"
          ? 1
          : suggestionKind === "nav"
            ? 2
            : 0,
  );
  // The API query — filter chips are sent separately, so only the free text
  // (the uncommitted prefix token is stripped too while suggestions show).
  const effectiveQuery =
    trailingToken || suggestionKind
      ? query.replace(trailingToken || trailingRaw, "").trim()
      : query;

  // ── @user / c/community suggestions (Reddit-style autocomplete) ──
  const [suggestions, setSuggestions] = useState<{
    kind: "user" | "community" | "tag" | "nav";
    items: any[];
  }>({ kind: "user", items: [] });
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);

  useEffect(() => {
    if (!suggestionKind) {
      setSuggestionsVisible(false);
      return;
    }
    let cancelled = false;
    const handler = setTimeout(async () => {
      try {
        let items: any[] = [];
        if (suggestionKind === "user") {
          const res = await userService.searchUsers(suggestionKeyword);
          items = res?.data || [];
        } else if (suggestionKind === "community") {
          const res = await communityService.getCommunities(
            1,
            20,
            suggestionKeyword,
          );
          items = res?.data || [];
        } else if (suggestionKind === "nav") {
          const routes = [
            { id: "settings", title: "Settings", icon: "settings-outline" },
            { id: "bookmarks", title: "Bookmarks", icon: "bookmark-outline" },
            {
              id: "notifications",
              title: "Notifications",
              icon: "notifications-outline",
            },
          ];
          items = routes.filter((r) =>
            r.id.startsWith(suggestionKeyword.toLowerCase()),
          );
        } else {
          const res = await hashtagService.getHashtags(suggestionKeyword);
          items = (res?.data || []).map((h: any) =>
            typeof h === "string" ? { hashtag: h } : h,
          );
        }
        if (cancelled) return;
        setSuggestions({ kind: suggestionKind, items });
        setSuggestionsVisible(items.length > 0);
      } catch (e) {
        if (!cancelled) setSuggestionsVisible(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionKind, suggestionKeyword]);

  // Tap a suggestion → commit it as a filter chip and drop the typed token.
  const selectSuggestion = (item: any) => {
    if (suggestionKind === "user") {
      const u = item.username;
      setAuthorFilters((prev) => (prev.includes(u) ? prev : [...prev, u]));
    } else if (suggestionKind === "community") {
      const slug = item.slug;
      setCommunityFilters((prev) =>
        prev.includes(slug) ? prev : [...prev, slug],
      );
    } else if (suggestionKind === "tag") {
      const t = (item.hashtag || item.text || item.name || "").replace(
        /^#/,
        "",
      );
      if (t) setTagFilters((prev) => (prev.includes(t) ? prev : [...prev, t]));
    } else if (suggestionKind === "nav") {
      if (item.id === "settings") (navigation as any).navigate("Settings");
      else if (item.id === "bookmarks")
        (navigation as any).navigate("Bookmarks");
      else if (item.id === "notifications")
        (navigation as any).navigate("Notifications");
      setSuggestionsVisible(false);
      setQuery("");
      return;
    }
    const raw = trailingRaw;
    setQuery((q) => {
      const idx = q.lastIndexOf(raw);
      return idx >= 0
        ? (q.slice(0, idx) + q.slice(idx + raw.length)).trim()
        : q.trim();
    });
    setSuggestionsVisible(false);
  };

  // Content filters are active → the results ARE content (filter chips always
  // scope the unified search; they don't swap any tab sets anymore).
  const filtersActive =
    authorFilters.length > 0 ||
    communityFilters.length > 0 ||
    tagFilters.length > 0 ||
    !!source;

  // Source scopes set the active view: Bookmarks → the unified search ("all",
  // scoped to saved content via bookmarked=1), Notifications → its n-* tabs,
  // Settings → plain "all" (filtered locally). Only runs when the source
  // changes so a user's n-* tab selection is preserved.
  useEffect(() => {
    if (!source) {
      // Scope chip removed (or opened without one) → back to the unified
      // "all" view; the n-* tabs belong only to the notifications scope.
      setActiveTab("all");
      return;
    }
    setActiveTab((prev) => {
      if (source === "notifications" && String(prev).startsWith("n-"))
        return prev;
      return "all";
    });
  }, [source]);

  // Hashtag taps navigate to Search with { query, tab: 'hashtags' }. When the
  // Search screen is ALREADY in the stack, navigate() pops back to the existing
  // instance instead of mounting a fresh one — its useState initializers won't
  // re-run, so sync params → state here to pick up the new query/tab. The query
  // change then flows through the normal cache-reset + fetch path below.
  //
  // Scope params (source / scopeCommunity / authorFilter / type) are also
  // CLEARED when a navigation arrives without them, so an auto-applied scope
  // (e.g. the Notifications chip) never sticks around on a later, plain search
  // that reuses this mounted screen.
  useEffect(() => {
    const p = route.params as any;
    if (p?.query !== undefined) setQuery(p.query);
    if (p?.tab) {
      const t = String(p.tab);
      // Legacy tab params (hashtags, f-all, posts, …) all land on the unified
      // search; only the notifications scope keeps its n-* tabs.
      setActiveTab(t.startsWith("n-") ? t : "all");
    }
    if (p?.scopeCommunity !== undefined)
      setCommunityFilters(
        p.scopeCommunity
          ? String(p.scopeCommunity)
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [],
      );
    else if (p) setCommunityFilters([]);
    if (p?.authorFilter !== undefined)
      setAuthorFilters(
        p.authorFilter
          ? String(p.authorFilter)
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [],
      );
    else if (p) setAuthorFilters([]);
    if (p?.source !== undefined) setSource(p.source || "");
    else if (p) setSource("");
    if (p?.type !== undefined) setResultType(String(p.type) || "all");
    else if (p) setResultType("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    (route.params as any)?.query,
    (route.params as any)?.tab,
    (route.params as any)?.scopeCommunity,
    (route.params as any)?.authorFilter,
    (route.params as any)?.source,
    (route.params as any)?.type,
  ]);
  // Track whether we've loaded discovery content at least once — prevents the
  // empty-state flash on the "all" tab when discovery data is already available.
  const [discoveryLoaded, setDiscoveryLoaded] = useState(false);

  // ── Per-tab results cache ──
  // Each tab keeps its own rows + pagination + scroll offset, so switching tabs
  // back and forth restores exactly where you left off instead of resetting to
  // page 1. The cache is invalidated only when the QUERY changes.
  const [rowsByTab, setRowsByTab] = useState<Partial<Record<string, Row[]>>>(
    {},
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const tabPageRef = useRef<Record<string, number>>({});
  const tabHasMoreRef = useRef<Record<string, boolean>>({});
  // Guards against out-of-order responses when typing/tab-switching fast — only
  // the latest request may commit its rows.
  const searchReqRef = useRef(0);
  // Mirrors so effects/async flows read fresh values without re-subscribing.
  const rowsByTabRef = useRef(rowsByTab);
  rowsByTabRef.current = rowsByTab;
  const lastQueryRef = useRef(query);
  // Filters (author / community chips) count as part of the search identity:
  // a chip added or removed must invalidate the per-tab caches like a query
  // change does.
  const lastFiltersKeyRef = useRef("");
  // Per-tab scroll offsets — saved on leave, restored on return.
  const scrollOffsetsRef = useRef<Record<string, number>>({});
  const scrollOffsetCurrentRef = useRef(0);
  const listRef = useRef<any>(null);

  // FlashList viewability tells us which items are visible; the hook picks
  // the most-visible post row. isFocused guards playback when navigating away.
  const isFocused = useIsFocused();
  // For mixed-type rows, extract the post ID only from post-type rows.
  const { activePostId, viewabilityConfig, onViewableItemsChanged,
          trackLayout, handleScroll: handleScrollForTracking } =
    useActivePostTracking([], {
      getPostId: (row: any) =>
        !row.isHeader && (row.type === 'posts' || row.type === 'post')
          ? (row.item?.id ?? null)
          : null,
    });

  // Active tab's rows — derived from the cache so switching tabs is instant.
  const rows = rowsByTab[activeTab] || [];

  const { user: currentUser } = useAuth();
  const { mutate: toggleLike } = useToggleLike();
  const { mutate: toggleSave } = useToggleSave();

  // One combined `filter` param for the unified API — c/<slug> for communities,
  // @<user> for people, #<tag> for hashtags. Matches the URL shape
  // search/?q=&sort=&filter=[c/x, @y, #z]&type=. Reads refs so it stays fresh
  // inside the memoized fetchResults callback.
  const buildFilterString = () => {
    const tokens: string[] = [];
    communityRef.current.forEach((slug) => tokens.push(`c/${slug}`));
    authorRef.current.forEach((u) => tokens.push(`@${u}`));
    tagRef.current.forEach((t) => tokens.push(`#${t}`));
    return tokens.join(",");
  };

  // Stable key for deduping mixed-type rows on append (posts, media and
  // comments each use different id columns). Rows with NO stable identity
  // field (a future backend type may not carry id/media_id/text/username/slug)
  // return null — the dedupe then keeps every such row instead of collapsing
  // them all onto one shared key.
  const rowKey = (row: Row): string | null => {
    if (row.isHeader) return `header:${row.type}`;
    const it = row.item;
    const id = it?.id ?? it?.media_id ?? it?.text ?? it?.username ?? it?.slug;
    return id ? `${row.type}:${id}` : null;
  };

  const fetchResults = useCallback(
    async (
      q: string,
      tab: string,
      pageToLoad = 1,
      append = false,
      // Pull-to-refresh: skip the full-screen loading spinner (the RefreshControl
      // shows its own) so the list stays visible while it re-fetches.
      silent = false,
    ) => {
      const reqId = ++searchReqRef.current;
      if (!append && !silent) setLoading(true);
      try {
        if (sourceRef.current === "settings") {
          const term = q.toLowerCase();
          const filtered = SETTINGS_ITEMS.filter(s => s.title.toLowerCase().includes(term) || s.keywords.some(k => k.toLowerCase().includes(term)));
          setRowsByTab((prev) => ({
            ...prev,
            [tab]: filtered.map(item => ({ isHeader: false, item, type: "settings_item" as SearchType }))
          }));
          setLoading(false);
          return;
        }

        if (sourceRef.current === "notifications") {
          // Fully global-search driven: notifications go through the SAME
          // unified /search endpoint (notified=1) as bookmarks — server-owned
          // ordering, pagination and type pills (All / Likes / Comments /
          // Follows, each with a count). Rows are mapped into the app's
          // Notification shape before rendering.
          const res = await searchService.universalSearch({
            q,
            sort: sortByRef.current,
            time: timeWindowRef.current,
            filter: buildFilterString(),
            type: resultTypeRef.current,
            scope: "notifications",
            page: pageToLoad,
            limit: 10,
          });
          // A newer request (typing / pill switch) started after this one — drop it.
          if (searchReqRef.current !== reqId) return;
          tabHasMoreRef.current[tab] = res.hasNext;
          tabPageRef.current[tab] = res.page;
          setServerTypes(res.types);
          const newRows: Row[] = (res.results || []).map((item: any) => ({
            isHeader: false,
            item: mapNotificationRow(item),
            type: "notification_item" as ResultType,
          }));
          setRowsByTab((prev) => {
            const existing = prev[tab] || [];
            const merged = append ? [...existing, ...newRows] : newRows;
            // Dedupe by (type, id) so infinite-scroll pages never repeat rows.
            const seen = new Set<string>();
            return {
              ...prev,
              [tab]: merged.filter((row: Row) => {
                const key = rowKey(row);
                if (key === null) return true;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              }),
            };
          });
          return;
        }

        // Wallet scope — search the user's cash + XP transactions. The query
        // goes to BOTH endpoints so the FULL history is searched server-side
        // (not just the first page); the local pass applies the TIME window
        // and the chosen SORT on top.
        if (sourceRef.current === "wallet") {
          // Backend-driven like the other scopes: q/time/sort go to BOTH the
          // cash and XP transaction endpoints, each paginating server-side
          // (no more 100-row ceiling). The two ordered pages merge and sort
          // by the same key (top = amount, else newest); hasNext = either
          // endpoint still has rows.
          const [cashRes, xpRes] = await Promise.all([
            walletService.getTransactions(
              pageToLoad,
              10,
              q,
              timeWindowRef.current,
              sortByRef.current,
            ),
            xpService.getTransactions(
              pageToLoad,
              10,
              q,
              timeWindowRef.current,
              sortByRef.current,
            ),
          ]);
          // A newer request (typing / sort change) started after this one — drop it.
          if (searchReqRef.current !== reqId) return;
          tabHasMoreRef.current[tab] = !!(
            cashRes?.meta?.hasNext || xpRes?.meta?.hasNext
          );
          tabPageRef.current[tab] = pageToLoad;
          const toCashTxn = (t: any): Transaction => ({
            id: t.id,
            title:
              t.description ||
              (t.type === "credit" ? "Cash Added" : "Cash Deducted"),
            date: new Date(t.createdAt || Date.now()).toLocaleDateString(),
            ts: new Date(t.createdAt || Date.now()).getTime(),
            amount: (t.amountCents || 0) / 100,
            currency: "INR",
            type:
              t.category === "withdrawal"
                ? "withdraw"
                : t.category === "topup"
                  ? "topup"
                  : t.type === "credit"
                    ? "earn"
                    : "spend",
            status: t.status,
          });
          const toXpTxn = (t: any): Transaction => ({
            id: t.id,
            title:
              t.gameName ||
              t.game_name ||
              (t.transactionType === "spent" ? "XP Spent" : "XP Earned"),
            date: new Date(t.createdAt || Date.now()).toLocaleDateString(),
            ts: new Date(t.createdAt || Date.now()).getTime(),
            amount: t.xp || 0,
            currency: "XP",
            type: t.transactionType === "spent" ? "spend" : "earn",
            status: t.status || "completed",
          });
          // Merge both ordered pages and apply the chosen order (top = biggest
          // amount, otherwise newest first — matching the old local sort).
          const merged = [
            ...(cashRes?.data || []).map(toCashTxn),
            ...(xpRes?.data || []).map(toXpTxn),
          ].sort((a, b) =>
            sortByRef.current === "top"
              ? Math.abs(b.amount) - Math.abs(a.amount)
              : (b.ts ?? 0) - (a.ts ?? 0),
          );
          const newRows: Row[] = merged.map((item) => ({
            isHeader: false,
            item,
            type: "transaction_item" as ResultType,
          }));
          setRowsByTab((prev) => {
            const existing = prev[tab] || [];
            const combined = append ? [...existing, ...newRows] : newRows;
            // Dedupe by (type, id) so infinite-scroll pages never repeat rows.
            const seen = new Set<string>();
            return {
              ...prev,
              [tab]: combined.filter((row: Row) => {
                const key = rowKey(row);
                if (key === null) return true;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              }),
            };
          });
          return;
        }

        // Unified search — ONE request returns an ordered list that may mix
        // posts, comments, media, people, communities, events and text rows.
        // The client renders the results verbatim (never reorders). Bookmarks
        // scope is sent as bookmarked=1 so saved content is searched.
        const res = await searchService.universalSearch({
          q,
          sort: sortByRef.current,
          time: timeWindowRef.current,
          filter: buildFilterString(),
          type: resultTypeRef.current,
          scope: (sourceRef.current || 'global') as any,
          page: pageToLoad,
          limit: 10,
        });
        // A newer request (typing / pill switch) started after this one — drop it.
        if (searchReqRef.current !== reqId) return;
        tabHasMoreRef.current[tab] = res.hasNext;
        tabPageRef.current[tab] = res.page;
        setServerTypes(res.types);
        const newRows: Row[] = res.results.map((item: any) => ({
          isHeader: false,
          item,
          type: (item.itemType || "text") as ResultType,
        }));
        setRowsByTab((prev) => {
          const existing = prev[tab] || [];
          const merged = append ? [...existing, ...newRows] : newRows;
          // Dedupe by (type, id) so infinite-scroll pages never repeat rows.
          // Rows without a stable identity (rowKey === null) are always kept.
          const seen = new Set<string>();
          return {
            ...prev,
            [tab]: merged.filter((row: Row) => {
              const key = rowKey(row);
              if (key === null) return true;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }),
          };
        });
        if (!q.trim() && !buildFilterString() && newRows.length > 0)
          setDiscoveryLoaded(true);
      } catch (e) {
        console.warn("Search failed", e);
        if (!append) setRowsByTab((prev) => ({ ...prev, [tab]: [] }));
      } finally {
        if (searchReqRef.current === reqId) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  // Pull-to-refresh — re-fetch the ACTIVE tab's first page (replaces the rows
  // for that tab; other tabs keep their cached results + scroll offsets).
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchResults(effectiveQuery, activeTab, 1, false, true);
    } finally {
      setRefreshing(false);
    }
  }, [effectiveQuery, activeTab, fetchResults]);

  // Infinite scroll — appends the next page using the tab's own pagination
  // refs (the unified view paginates; notifications/settings are single
  // local fetches so their hasMore never gets set).
  const loadMore = useCallback(() => {
    if (!tabHasMoreRef.current[activeTab] || loadingMore || loading) return;
    setLoadingMore(true);
    fetchResults(
      effectiveQuery,
      activeTab,
      (tabPageRef.current[activeTab] || 1) + 1,
      true,
    );
  }, [activeTab, loadingMore, loading, effectiveQuery, fetchResults]);

  // Single debounced effect: on a QUERY change every tab's cache is invalidated
  // and the active tab refetches; on a TAB switch the cached rows (if any) are
  // kept and only scrolled back into place — no reset to page 1.
  useEffect(() => {
    // A filter chip added/removed changes the search identity just like the
    // text does — compare both so the caches reset and results refetch.
    const filtersKey = `${authorFilters.join(",")}|${communityFilters.join(",")}|${tagFilters.join(",")}|${source || ""}|${sortBy}|${timeWindow}|${resultType}`;
    const queryChanged =
      lastQueryRef.current !== effectiveQuery ||
      lastFiltersKeyRef.current !== filtersKey;
    lastQueryRef.current = effectiveQuery;
    lastFiltersKeyRef.current = filtersKey;
    const handler = setTimeout(
      () => {
        if (queryChanged) {
          // New query → drop every tab's cache + pagination + scroll offsets,
          // and clear the stale type pills (the fetch re-populates them).
          setRowsByTab({});
          tabPageRef.current = {};
          tabHasMoreRef.current = {};
          scrollOffsetsRef.current = {};
          scrollOffsetCurrentRef.current = 0;
          setServerTypes([]);
        }
        const cached = rowsByTabRef.current[activeTab];
        if (!queryChanged && cached && cached.length > 0) {
          // Already fetched for this query — just restore the scroll position
          // (an offset of 0 — user was at the top — is still a valid restore).
          const offset = scrollOffsetsRef.current[activeTab];
          if (typeof offset === "number" && offset > 0 && listRef.current) {
            requestAnimationFrame(() => {
              listRef.current?.scrollToOffset({ offset, animated: false });
            });
          }
          return;
        }
        fetchResults(effectiveQuery, activeTab);
      },
      queryChanged ? 300 : 0,
    );
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveQuery,
    activeTab,
    authorFilters,
    communityFilters,
    tagFilters,
    source,
    sortBy,
    timeWindow,
    resultType,
    fetchResults,
  ]);

  // Open a games tab result inside the Games screen.
  const openGames = useCallback(() => {
    (navigation as any).navigate("Main", { screen: "Games" });
  }, [navigation]);

  // Optimistically flip a post row's like/save state in the cached rows so the
  // icon updates instantly. Patches EVERY tab carrying the post (the unified
  // view keeps rows under "all") — search results aren't react-query cached,
  // so the mutation cache updates can't reach them.
  const patchPost = useCallback((postId: string, patch: Partial<Post>) => {
    setRowsByTab((prev) => {
      let changed = false;
      const next: Partial<Record<string, Row[]>> = {};
      for (const tab of Object.keys(prev)) {
        const list = prev[tab] || [];
        const mapped = list.map((row) =>
          row.isHeader ||
          row.type !== "posts" ||
          (row.item as any)?.id !== postId
            ? row
            : { ...row, item: { ...(row.item as any), ...patch } },
        );
        if (mapped !== list) changed = true;
        next[tab] = mapped;
      }
      return changed ? next : prev;
    });
  }, []);

  // Everything the per-type row renderers need, bundled once per render so the
  // ROW_RENDERERS map stays pure and stateless.
  const rowCtx = useMemo<RowCtx>(() => {
    return {
      styles,
      colors,
      navigation,
      isFocused,
      activePostId,
      currentUserId: currentUser?.id,
      toggleLike: (id, isCurrentlyLiked) => toggleLike({ id, isCurrentlyLiked }),
      toggleSave: (id, isCurrentlySaved) => toggleSave({ id, isCurrentlySaved }),
      patchPost,
      sharePost: (post) => {
        const shareTitle =
          (post as any)?.title || `${post.author?.name || "User"}'s Post`;
        const appUrl = `https://taddlebox.com/post/${post.id}`;
        Share.share({
          message: `${shareTitle}\n\n${appUrl}`,
          url: appUrl,
          title: shareTitle,
        }).catch(() => {});
      },
      reportPost: () =>
        themedAlert(
          "Reported",
          "Thank you. This post has been reported for review.",
        ),
      refresh: () => fetchResults(query, activeTab),
      openPost: (post) => navigation.push("PostDetail", { post }),
      openUser: (user) => navigation.push("UserProfile", { user }),
      openCommunity: (slug) =>
        (navigation as any).navigate("Community", {
          screen: "CommunityDetail",
          params: { communitySlug: slug },
        }),
      openGames,
      openEvents: () => (navigation as any).navigate("Main", { screen: "Events" }),
      openSettings: () => (navigation as any).navigate("Settings"),
      openNotifications: () => (navigation as any).navigate("Notifications"),
      addHashtag: (tag) => {
        setTagFilters((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
        setResultType("all");
      },
      trackLayout,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    styles,
    colors,
    navigation,
    isFocused,
    activePostId,
    currentUser?.id,
    toggleLike,
    toggleSave,
    patchPost,
    openGames,
    query,
    activeTab,
    trackLayout,
  ]);

  const renderItem = ({ item }: { item: Row }) => {
    // Section headers are no longer produced — the server returns a flat,
    // ordered list; the pill row under the search bar handles type filtering.
    if (item.isHeader) return null;
    // Declarative dispatch: each backend result kind maps to its own row
    // component (ROW_RENDERERS); unknown kinds fall back to the generic row.
    const RowComponent = ROW_RENDERERS[item.type] ?? GenericRow;
    return <RowComponent data={item.item} ctx={rowCtx} />;
  };

  // Result-type pills the SERVER returns for the current query — the unified
  // search's equivalent of tabs. The backend returns "all" first (the mixed
  // ordered list) plus every type that exists, each with its own label; every
  // pill re-requests with type=<that type>. Rendered verbatim — no
  // client-side defaults or label map.
  // Result-type pills the SERVER returns for the current query — rendered
  // VERBATIM: whatever the backend sends is shown, nothing more. If it sends
  // no pills, no pills row is rendered at all and the results just show.
  const universalPills = useMemo(
    () =>
      serverTypes.map((t) => ({
        key: t.type,
        label: t.label,
        count: t.count,
      })),
    [serverTypes],
  );

  // Instagram-style hide-on-scroll for the search chrome — the search bar and
  // the result-pill row slide up with the results for a full-screen view.
  // The header is an absolute overlay whose true height (status-bar inset +
  // search bar + padding + border) varies by device/font scale — hardcoding
  // it made the pills row sit PARTIALLY BEHIND the search bar. It's measured
  // on layout so pills/suggestions/results align to the real height.
  const [headerMeasuredH, setHeaderMeasuredH] = useState<number | null>(null);
  const searchHeaderH = headerMeasuredH ?? 60 + insets.top; // measured, or fallback
  const searchPillsH = 56; // horizontal result-pill row
  const searchOverlayY = useSharedValue(0);
  const searchPrevY = useRef(0);
  // Dismiss the keyboard once per scroll gesture; reset when the user taps
  // the input again (TextInput onFocus below).
  const keyboardDismissedRef = useRef(false);
  const showPills =
    source === "notifications" ||
    (source !== "settings" &&
      source !== "wallet" &&
      universalPills.length > 0);
  const searchOverlayH = searchHeaderH + (showPills ? searchPillsH : 0);

  const headerAnimStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: Math.max(
          -searchHeaderH,
          Math.min(0, searchOverlayY.value),
        ),
      },
    ],
  }));
  // The pills sit at top: searchHeaderH, so to leave the screen they must
  // travel the FULL overlay height — clamping to -searchPillsH (their own
  // height) left them parked at insets.top+4, floating over the results.
  const pillsAnimStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: Math.max(-searchOverlayH, Math.min(0, searchOverlayY.value)),
      },
    ],
  }));
  const renderPill = (pill: {
    key: string;
    label: string;
    count?: number;
  }) => {
    const isActive = resultType === pill.key;
    return (
      <TouchableOpacity
        style={[styles.tabBtn, isActive && styles.tabBtnActive]}
        onPress={() => {
          if (pill.key !== resultType) setResultType(pill.key);
        }}
        activeOpacity={0.8}
      >
        <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
          {pill.label}
          {typeof pill.count === "number" ? ` (${pill.count})` : ""}
        </Text>
      </TouchableOpacity>
    );
  };

  const isEmptyQuery = !query.trim() && !filtersActive;
  // Sort/time apply in discovery only to groups whose queries honor them —
  // the mixed "all" view and the posts/events pills (posts: sort+time,
  // events: time window). The fixed-order pills (people/communities/games)
  // can't, so the sort/filter modal is hidden while only they are showing.
  const sortTimeApplies =
    !isEmptyQuery ||
    resultType === "all" ||
    resultType === "posts" ||
    resultType === "events";
  const hasResults = rows.length > 0;
  // Friendly tab name for empty-state text — the active result pill's label
  // (from the server) when the unified search is on, otherwise the wallet
  // transactions scope.
  const activeTabLabel =
    source === "wallet"
      ? "transactions"
      : serverTypes.find((t) => t.type === resultType)?.label || activeTab;

  // Show a discovery hint when there's no search query.
  // Don't show the generic "type something" empty state when we already know
  // discovery content was loaded — it briefly flashes before rows populate.
  const showSearchPrompt =
    isEmptyQuery && !hasResults && !loading && !discoveryLoaded;

  const renderEmptyStateHeader = () => (
    <View style={{ flex: 1, paddingBottom: 10 }}>
      {recentSearches.length > 0 && (
        <View style={styles.recentSearchesContainer}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent Searches</Text>
            <TouchableOpacity
              onPress={async () => {
                setRecentSearches([]);
                await AsyncStorage.removeItem("@recent_searches");
              }}
            >
              <Text style={styles.recentClear}>Clear</Text>
            </TouchableOpacity>
          </View>
          {recentSearches.map((term) => (
            <TouchableOpacity
              key={term}
              style={styles.recentRow}
              onPress={() => {
                setQuery(term);
                saveRecentSearch(term);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name="time-outline"
                size={20}
                color={colors.text.muted}
              />
              <Text style={styles.recentText}>{term}</Text>
              <TouchableOpacity
                onPress={async () => {
                  const updated = recentSearches.filter((s) => s !== term);
                  setRecentSearches(updated);
                  await AsyncStorage.setItem(
                    "@recent_searches",
                    JSON.stringify(updated),
                  );
                }}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={16} color={colors.text.muted} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Header Search Bar — absolute overlay; slides up on scroll (Instagram
          style) so the results go full screen. The status-bar inset lives on
          the header itself (like MainHeader), not the container. */}
      <Animated.View
        onLayout={(e) => setHeaderMeasuredH(e.nativeEvent.layout.height)}
        style={[
          styles.header,
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            paddingTop: insets.top + 10,
          },
          headerAnimStyle,
        ]}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          {/* Tapping the search icon fires the request — with an empty box
              that's the all-empty-params call returning default discoveries. */}
          <TouchableOpacity onPress={handleSubmit} hitSlop={8}>
            <Ionicons name="search" size={20} color={colors.text.muted} />
          </TouchableOpacity>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1, marginHorizontal: 8 }}
            contentContainerStyle={{ alignItems: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Scope / source chips — always FIRST so the user sees which
                domain they're searching before the filter tokens. */}
            {source === "bookmarks" ? (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.primary + "22",
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() => setSource("")}
                activeOpacity={0.8}
              >
                <Ionicons name="bookmark" size={12} color={colors.primary} />
                <Text
                  style={[styles.filterChipText, { color: colors.primary }]}
                  numberOfLines={1}
                >
                  Bookmarks
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.primary}
                />
              </TouchableOpacity>
            ) : null}
            {source === "settings" ? (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.bg.elevated,
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() => setSource("")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="settings-outline"
                  size={12}
                  color={colors.text.secondary}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: colors.text.secondary },
                  ]}
                  numberOfLines={1}
                >
                  Settings
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            ) : null}
            {source === "notifications" ? (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.bg.elevated,
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() => setSource("")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="notifications-outline"
                  size={12}
                  color={colors.text.secondary}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: colors.text.secondary },
                  ]}
                  numberOfLines={1}
                >
                  Notifications
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            ) : null}
            {source === "wallet" ? (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.bg.elevated,
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() => setSource("")}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="wallet-outline"
                  size={12}
                  color={colors.text.secondary}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    { color: colors.text.secondary },
                  ]}
                  numberOfLines={1}
                >
                  Wallet
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            ) : null}
            {/* Filter chips — @user (author) and c/community, each with an X
                to drop it. They appear AFTER scope tags. */}
            {authorFilters.map((u) => (
              <TouchableOpacity
                key={u}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.primaryLight + "22",
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() =>
                  setAuthorFilters((prev) => prev.filter((x) => x !== u))
                }
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: colors.primaryLight },
                  ]}
                  numberOfLines={1}
                >
                  @{u}
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.primaryLight}
                />
              </TouchableOpacity>
            ))}
            {communityFilters.map((slug) => (
              <TouchableOpacity
                key={slug}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.cyanLight + "22",
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() =>
                  setCommunityFilters((prev) => prev.filter((x) => x !== slug))
                }
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.filterChipText, { color: colors.cyanLight }]}
                  numberOfLines={1}
                >
                  c/{slug}
                </Text>
                <Ionicons
                  name="close-circle"
                  size={13}
                  color={colors.cyanLight}
                />
              </TouchableOpacity>
            ))}
            {tagFilters.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: colors.xpGold + "22",
                    marginLeft: 0,
                    marginRight: 8,
                  },
                ]}
                onPress={() =>
                  setTagFilters((prev) => prev.filter((x) => x !== t))
                }
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.filterChipText, { color: colors.xpGold }]}
                  numberOfLines={1}
                >
                  #{t}
                </Text>
                <Ionicons name="close-circle" size={13} color={colors.xpGold} />
              </TouchableOpacity>
            ))}
            <TextInput
              style={[
                styles.searchInput,
                { marginLeft: 0, marginRight: 0, minWidth: 120 },
              ]}
              placeholder="Taddle the box…"
              placeholderTextColor={colors.text.muted}
              value={query}
              onChangeText={handleQueryChange}
              onSubmitEditing={handleSubmit}
              returnKeyType="search"
              autoCapitalize="none"
              onFocus={() => {
                keyboardDismissedRef.current = false;
              }}
            />
          </ScrollView>
          {(query.length > 0 ||
            authorFilters.length > 0 ||
            communityFilters.length > 0 ||
            tagFilters.length > 0 ||
            source) && (
            <TouchableOpacity
              onPress={() => {
                setQuery("");
                setAuthorFilters([]);
                setCommunityFilters([]);
                setTagFilters([]);
                setSource("");
                setResultType("all");
                setActiveTab("all");
              }}
              style={{ marginRight: 8 }}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.text.muted}
              />
            </TouchableOpacity>
          )}
          {/* Sort/filter modal — hidden in the settings scope (its items have
              no sortable/time attributes) and in discovery while only
              fixed-order pills (people/communities/games) are showing, where
              sort/time can't apply. */}
          {source !== "settings" && sortTimeApplies && (
              <TouchableOpacity
                onPress={() => {
                  // Open the modal with the CURRENT sort/time as the drafts.
                  setDraftSort(sortBy);
                  setDraftTime(timeWindow);
                  setShowFilters(true);
                }}
              >
                <MaterialCommunityIcons
                  name="sort-variant"
                  size={24}
                  color={colors.text.secondary}
                  style={{ transform: [{ scaleX: -1 }] }}
                />
              </TouchableOpacity>
            )}
        </View>
      </Animated.View>

      {/* @user / c/community / #tag suggestions — tap one to commit it as a chip */}
      {suggestionsVisible && suggestionKind && (
        <Animated.View
          style={[
            styles.suggestionBox,
            {
              position: "absolute",
              top: searchHeaderH,
              left: 0,
              right: 0,
              zIndex: 15,
            },
            headerAnimStyle,
          ]}
        >
          <Text style={styles.suggestionLabel}>
            {suggestionKind === "user"
              ? "People"
              : suggestionKind === "community"
                ? "Communities"
                : suggestionKind === "nav"
                  ? "Navigation"
                  : "Hashtags"}
          </Text>
          {suggestions.items.map((item, i) => {
            if (suggestionKind === "nav") {
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.suggestionRow}
                  onPress={() => selectSuggestion(item)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.suggestionAvatar,
                      { backgroundColor: colors.bg.base },
                    ]}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={18}
                      color={colors.text.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionName} numberOfLines={1}>
                      Navigate to {item.title}
                    </Text>
                    <Text style={styles.suggestionHandle} numberOfLines={1}>
                      ./{item.id}
                    </Text>
                  </View>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={colors.text.muted}
                  />
                </TouchableOpacity>
              );
            }

            const tag = (item.hashtag || item.text || item.name || "").replace(
              /^#/,
              "",
            );
            const avatar =
              suggestionKind === "user"
                ? item.user_avatar ||
                  item.avatar ||
                  item.avatarUrl ||
                  item.avatar_url
                : suggestionKind === "community"
                  ? item.community_avatar ||
                    item.avatar ||
                    item.avatarUrl ||
                    item.avatar_url
                  : "";
            const handle =
              suggestionKind === "user"
                ? `@${item.username}`
                : suggestionKind === "community"
                  ? `c/${item.slug}`
                  // nav rows return above — only tag rows reach here.
                  : `posts tagged #${tag}`;
            return (
              <TouchableOpacity
                key={suggestionKind === "tag" ? tag : item.id || i}
                style={styles.suggestionRow}
                onPress={() => selectSuggestion(item)}
                activeOpacity={0.7}
              >
                <View style={styles.suggestionAvatar}>
                  {avatar ? (
                    <Image
                      source={{ uri: avatar }}
                      style={styles.suggestionAvatarImg}
                    />
                  ) : suggestionKind === "user" ? (
                    <Text style={{ fontSize: 16 }}>👾</Text>
                  ) : suggestionKind === "community" ? (
                    <Ionicons
                      name="people-outline"
                      size={16}
                      color={colors.text.muted}
                    />
                  ) : (
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "800",
                        color: colors.xpGold,
                      }}
                    >
                      #
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionName} numberOfLines={1}>
                    {suggestionKind === "tag" ? `#${tag}` : (item.name || item.title)}
                  </Text>
                  <Text style={styles.suggestionHandle} numberOfLines={1}>
                    {handle}
                  </Text>
                </View>
                {/* nav rows return above — remaining rows get the commit icon. */}
                <Ionicons
                  name="add-circle-outline"
                  size={18}
                  color={colors.text.muted}
                />
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      )}

      {/* Pills Row — shown ONLY when there are pills to show. The unified
          search renders the SERVER-driven result pills verbatim (whatever the
          backend returns — even none); tapping one re-requests with
          type=<type>. This includes the notifications scope (All / Likes /
          Comments / Follows with counts); the wallet scope is a local
          transaction filter (no pills). */}
      {showPills && (
        <Animated.View
          style={[
            {
              position: "absolute",
              top: searchHeaderH,
              left: 0,
              right: 0,
              zIndex: 10,
              backgroundColor: colors.bg.base,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            },
            pillsAnimStyle,
          ]}
        >
          <FlashList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={universalPills}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.tabsContainer}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            renderItem={({ item }) => renderPill(item)}
          />
        </Animated.View>
      )}

      {/* Results */}
      {loading ? (
        <StateBlock
          loading
          style={[styles.centerBox, { paddingTop: searchOverlayH, paddingVertical: 0 }]}
        />
      ) : hasResults ? (
        // headerOffsetH drops the pull bubble BELOW the search chrome (bar +
        // pills) — without it the bubble sits at the global header height,
        // hidden behind the search overlay (zIndex 10+), so the pull showed
        // no feedback.
        <PullToRefreshWrapper
          refreshing={refreshing}
          onRefresh={onRefresh}
          headerOffsetH={searchOverlayH}
        >
          <FlashList
            ref={listRef}
            data={rows}
            keyExtractor={(row, index) =>
              row.isHeader
                ? `header-${row.type}-${index}`
                : `${row.type}-${row.item.id || index}`
            }
            renderItem={renderItem}
            contentContainerStyle={[
              styles.listContent,
              // Top padding clears the floating search chrome; bottom padding
              // clears the tab bar (the footer hides on scroll like the
              // chrome, but stays visible on short result lists).
              { paddingTop: searchOverlayH, paddingBottom: footerHeight + 20 },
            ]}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            // Track the live offset so switching tabs can save/restore it.
            onScroll={(e) => {
              scrollOffsetCurrentRef.current = e.nativeEvent.contentOffset.y;
              handleScrollForTracking(e);
              // Instagram-style hide — the search bar + pill row ride up
              // WITH the finger (the same finger-tracking as the global
              // header): scrolling down translates them proportionally,
              // scrolling up snaps them back immediately, and reaching the
              // top always restores them. Scrolling also dismisses the
              // keyboard.
              const y = e.nativeEvent.contentOffset.y;
              const dy = y - searchPrevY.current;
              applySectionScrollOffset(
                y,
                searchPrevY.current,
                searchOverlayY,
                searchOverlayH,
              );
              searchPrevY.current = y;
              if (!keyboardDismissedRef.current && Math.abs(dy) > 2) {
                keyboardDismissedRef.current = true;
                Keyboard.dismiss();
              }
            }}
          scrollEventThrottle={16}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <StateBlock inline loading loaderSize={36} style={{ paddingVertical: 16 }} />
            ) : null
          }
          ListHeaderComponent={
            // The discovery label belongs to the discovery CONTENT — only
            // render it once discovery rows actually exist (empty query AND
            // rows), right where the feed starts. It never appears as a
            // standalone banner above the pill row / empty area.
            isEmptyQuery && hasResults ? (
              <View>
                {renderEmptyStateHeader()}
                <View style={styles.discoverBanner}>
                  <Ionicons name="sparkles" size={16} color={colors.xpGold} />
                  <Text style={styles.discoverText}>Discover</Text>
                </View>
              </View>
            ) : null
          }
        />
        </PullToRefreshWrapper>
      ) : showSearchPrompt ? (
        renderEmptyStateHeader()
      ) : !isEmptyQuery ? (
        <View style={[styles.centerBox, { paddingTop: searchOverlayH }]}>
          <Text style={styles.emptyText}>
            No results found for "{query}" in {activeTabLabel}
          </Text>
        </View>
      ) : (
        // Empty query + no rows on an individual tab — e.g. a "See all" jump
        // from the discovery view. Show a hint instead of a blank screen.
        <View style={[styles.centerBox, { paddingTop: searchOverlayH }]}>
          <Ionicons name="compass-outline" size={56} color={colors.border} />
          <Text style={styles.emptyText}>
            Nothing here yet — type a search, or explore the All tab.
          </Text>
        </View>
      )}

      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFilters(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Search Options</Text>
              <TouchableOpacity
                onPress={() => setShowFilters(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterGroup}>
              <Text style={styles.filterGroupTitle}>SORT</Text>
              <View style={styles.filterRow}>
                {[
                  { id: "relevance", label: "Relevance" },
                  { id: "top", label: "Top" },
                  { id: "latest", label: "Latest" },
                  { id: "hot", label: "Hot" },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.sheetFilterChip,
                      draftSort === t.id && styles.sheetFilterChipActive,
                    ]}
                    onPress={() => {
                      // Draft only — committed on "Apply Filters". The chip
                      // ids ARE the API's sort values (Top = most engagement
                      // overall, Hot = trending recently).
                      setDraftSort(t.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.sheetFilterChipText,
                        draftSort === t.id && styles.sheetFilterChipTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.filterGroup}>
              <Text style={styles.filterGroupTitle}>TIME</Text>
              <View style={styles.filterRow}>
                {[
                  { id: "recent", label: "Recent" },
                  { id: "past_week", label: "Past Week" },
                  { id: "past_month", label: "Past Month" },
                  { id: "past_year", label: "Past Year" },
                  { id: "all_time", label: "All Time" },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.id}                      style={[
                        styles.sheetFilterChip,
                        draftTime === t.id && styles.sheetFilterChipActive,
                      ]}
                    onPress={() => setDraftTime(t.id)}
                  >
                    <Text
                      style={[
                        styles.sheetFilterChipText,
                        draftTime === t.id && styles.sheetFilterChipTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.applyFilterBtn}
              onPress={() => {
                // Commit the drafts to the live search and close.
                setSortBy(draftSort);
                setTimeWindow(draftTime);
                setShowFilters(false);
              }}
            >
              <Text style={styles.applyFilterText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

