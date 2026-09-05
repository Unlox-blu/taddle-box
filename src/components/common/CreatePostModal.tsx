import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  Animated,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import axios from "axios";
import { VideoView, useVideoPlayer } from "expo-video";
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { colors as staticColors, fontSizes, spacing, radii } from "../../theme";
import { useThemeColors } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useWallet } from "../../context/WalletContext";
import { useCreatePost } from "../../mutations/content";
import { mediaService } from "../../services/media.service";
import { hashtagService } from "../../services/hashtag.service";
import { userService } from "../../services/user.service";
import { useMyCommunities, useCommunity } from "../../queries/communities";
import type { Post } from "../../types";
import SmartInput from "./SmartInput";
import AudiencePicker from "./AudiencePicker";
import { nativeBypass } from "../../utils/nativeBypass";
import { themedAlert } from "./ThemedAlert";
import { useThemedAlertModal } from "./ThemedAlert";
import { log, warn, error } from "../../utils/logger";
import { notificationBus } from "../../lib/notificationBus";

const SCREEN_W = Dimensions.get("window").width;

interface Props {
  visible: boolean;
  onClose: () => void;
  preselectedCommunityId?: string; // pre-fill when opened from a community detail page
}

type MediaType = "photo" | "video" | "gif" | "audio";

export interface MediaItem {
  uri: string;
  type: "image" | "video" | "audio";
  name?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
}

const MENTION_AND_HASHTAG_CONFIG = {
  "#": {
    trigger: "#",
    allowedSpacesCount: 0,
    textStyle: { color: staticColors.primaryLight, fontWeight: "700" as const },
  },
  "@": {
    trigger: "@",
    allowedSpacesCount: 0,
    textStyle: { color: staticColors.primaryLight, fontWeight: "700" as const },
  },
};

// Helper to detect pasted media URLs in content text
const IMAGE_EXTS = /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;
const VIDEO_EXTS = /\.(mp4|mov|webm|m4v)(\?.*)?$/i;
const AUDIO_EXTS = /\.(mp3|m4a|aac|wav|ogg)(\?.*)?$/i;
const GIF_EXT = /\.gif(\?.*)?$/i;
const URL_RE = /(https?:\/\/[^\s]+)/gi;

/** Video preview inside the media grid — expo-video needs a hook per player,
 *  so the map entry is its own component. Loops and starts immediately;
 *  mutes itself when an audio attachment is playing instead. */
const PreviewVideo = React.memo(function PreviewVideo({
  uri,
  width,
  height,
  muted,
  isActive,
}: {
  uri: string;
  width: number;
  height: number;
  muted: boolean;
  isActive: boolean;
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
  });
  // Only play when this slide is active
  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);
  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);
  // Release native video player when preview unmounts
  useEffect(() => {
    return () => {
      try {
        player.release();
      } catch {
        /* best-effort */
      }
    };
  }, [player]);
  return (
    <VideoView
      player={player}
      style={{ width, height }}
      contentFit="contain"
      nativeControls={false}
    />
  );
});

function detectMediaInText(text: string): {
  uri: string;
  type: "image" | "video" | "audio";
  mimeType: string;
  name: string;
} | null {
  const matches = text.match(URL_RE);
  if (!matches) return null;
  for (const url of matches) {
    if (GIF_EXT.test(url))
      return {
        uri: url,
        type: "image",
        mimeType: "image/gif",
        name: `pasted-${Date.now()}.gif`,
      };
    if (IMAGE_EXTS.test(url))
      return {
        uri: url,
        type: "image",
        mimeType: "image/jpeg",
        name: `pasted-${Date.now()}.jpg`,
      };
    if (VIDEO_EXTS.test(url))
      return {
        uri: url,
        type: "video",
        mimeType: "video/mp4",
        name: `pasted-${Date.now()}.mp4`,
      };
    if (AUDIO_EXTS.test(url))
      return {
        uri: url,
        type: "audio",
        mimeType: "audio/mpeg",
        name: `pasted-${Date.now()}.mp3`,
      };
  }
  return null;
}

export default function CreatePostModal({
  visible,
  onClose,
  preselectedCommunityId,
}: Props) {
  const { user: CURRENT_USER } = useAuth();
  const [isPublishing, setIsPublishing] = useState(false);
  useThemedAlertModal(visible, onClose);
  const { mutateAsync: createPostAsync } = useCreatePost();
  const { wallet } = useWallet();
  const insets = useSafeAreaInsets();
  // Joined + owned communities for the audience picker — backed by the
  // react-query cache (the legacy CommunityContext is never mounted). Gated
  // on `visible`: the modal is mounted at startup (tab bar) and must not
  // fetch communities until it's actually opened.
  const communities = useMyCommunities(visible);
  const colors = useThemeColors(); // ← dynamic theme colors
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<"feed" | "community" | null>(
    preselectedCommunityId ? "community" : null,
  );
  const [selectedComId, setSelComId] = useState<string | null>(
    preselectedCommunityId ?? null,
  );
  const [showPicker, setShowPicker] = useState(false);

  // Validate preselected community: if private and not joined, unselect it.
  const { data: preselectedCommunity } = useCommunity(
    preselectedCommunityId || "",
  );

  React.useEffect(() => {
    if (preselectedCommunityId && preselectedCommunity) {
      const isJoined =
        preselectedCommunity.isJoined ||
        preselectedCommunity.ownerId === CURRENT_USER?.id;
      if (preselectedCommunity.privacy === "private" && !isJoined) {
        setPostType(null);
        setSelComId(null);
      }
    }
  }, [preselectedCommunityId, preselectedCommunity, CURRENT_USER?.id]);

  // The preselection prop carries the community SLUG (from the detail screen
  // and the FAB). The detail fetch above validates it and returns the real
  // id, which is what the create-post payload requires (the backend validates
  // communityId as a UUID).
  const resolvedComId =
    selectedComId === preselectedCommunityId && preselectedCommunity?.id
      ? preselectedCommunity.id
      : selectedComId;

  // ── Location tag (lat / lon / place) shown in the card's rolling text ──
  const [postLocation, setPostLocation] = useState<{
    lat: number;
    lon: number;
    place?: string;
  } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  // Location picker — type-to-search with suggestions, or auto-detect (same
  // behaviour as the signup page).
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<
    { name: string; lat: number; lon: number }[]
  >([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [locationDropdownVisible, setLocationDropdownVisible] = useState(false);
  const [isTypingLocation, setIsTypingLocation] = useState(false);

  const [showHashtagInput, setShowHashtagInput] = useState(false);
  const [hashtagInput, setHashtagInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const validationAnim = useRef(new Animated.Value(0)).current;
  const validationTimer = useRef<any>(null);

  // ── Hashtags & Mentions ─────────────────────────────────────────
  const [hashtags, setHashtags] = useState<string[]>([]);
  // ── Poll composer state ──
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [activeInput, setActiveInput] = useState<
    "title" | "content" | "hashtag" | "location" | null
  >(null);

  // Media state
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [audioItem, setAudioItem] = useState<MediaItem | null>(null);
  const [pickLoading, setPickLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentMediaPage, setCurrentMediaPage] = useState(0);

  // GIF state
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);

  // Audio preview state
  const [sound, setSound] = useState<AudioPlayer | null>(null);
  // Mirrors the same player so stopping it is safe from both the effect
  // cleanup and resetAndClose — expo-audio's remove() releases the native
  // player but does NOT pause a looping AVPlayer, so an explicit pause() is
  // required to actually stop the preview audio.
  const soundRef = useRef<AudioPlayer | null>(null);
  // Track all video preview players for cleanup on close
  const videoPlayersRef = useRef<any[]>([]);

  // Clear memory on close/open
  React.useEffect(() => {
    if (!visible) {
      setTitle("");
      setContent("");
      setHashtags([]);
      setHashtagInput("");
      setMediaItems([]);
      setAudioItem(null);
      setGifQuery("");
      setShowGifPicker(false);
      setShowHashtagInput(false);
      setPostType(preselectedCommunityId ? "community" : null);
      setSelComId(preselectedCommunityId ?? null);
      setShowPicker(false);
      setPostLocation(null);
      setShowLocationInput(false);
      setLocationQuery("");
      setLocationResults([]);
      setLocationDropdownVisible(false);
      setIsTypingLocation(false);
      setActiveInput(null);
      setPollEnabled(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
    } else {
      setPostType(preselectedCommunityId ? "community" : null);
      setSelComId(preselectedCommunityId ?? null);
    }
  }, [visible, preselectedCommunityId]);

  const [dynamicTags, setDynamicTags] = useState<string[]>([]);
  const activeHashtagQuery = React.useMemo(() => {
    return (hashtagInput || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
  }, [hashtagInput]);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (activeHashtagQuery) {
        hashtagService
          .getHashtags(activeHashtagQuery)
          .then((res) => {
            if (res?.data) setDynamicTags(res.data);
          })
          .catch((e) => error("Failed to fetch hashtags", e));
      }
    }, 200);
    return () => clearTimeout(handler);
  }, [activeHashtagQuery]);

  const suggestedTags = React.useMemo(() => {
    if (!activeHashtagQuery) return [];
    let tags = dynamicTags.filter(
      (t) => typeof t === "string" && t.toLowerCase() !== activeHashtagQuery,
    );
    tags = [activeHashtagQuery, ...tags];
    return tags.slice(0, 15);
  }, [dynamicTags, activeHashtagQuery]);

  const renderPillSuggestions = () => {
    if (activeInput !== "hashtag" || suggestedTags.length === 0) return null;

    return (
      <View
        style={{
          backgroundColor: colors.bg.elevated,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: colors.border,
          maxHeight: 120,
          width: 160,
          position: "absolute",
          top: 40,
          left: 0,
          zIndex: 1000,
          elevation: 10,
        }}
      >
        <ScrollView keyboardShouldPersistTaps="always">
          {suggestedTags.map((tag, index) => (
            <TouchableOpacity
              key={tag}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderBottomWidth: index === suggestedTags.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
              onPress={() => {
                if (
                  !hashtags.includes(`#${tag}`) &&
                  !autoHashtags.includes(`#${tag}`)
                ) {
                  setHashtags((prev) => [...prev, `#${tag}`]);
                }
                setHashtagInput("");
                setShowHashtagInput(false);
                setActiveInput(null);
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.bg.surface,
                  justifyContent: "center",
                  alignItems: "center",
                  marginRight: 8,
                }}
              >
                <Text
                  style={{
                    color: colors.text.secondary,
                    fontSize: 10,
                    fontWeight: "bold",
                  }}
                >
                  #
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  color: colors.text.primary,
                  fontSize: fontSizes.xs,
                  fontWeight: "500",
                  flex: 1,
                }}
              >
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  React.useEffect(() => {
    let currentSound: AudioPlayer | null = null;
    const loadAudio = async () => {
      if (audioItem && visible) {
        try {
          const newSound = createAudioPlayer({ uri: audioItem.uri });
          newSound.loop = true;
          newSound.play();
          setSound(newSound);
          soundRef.current = newSound;
          currentSound = newSound;
        } catch (e) {
          warn("Failed to load audio preview", e);
        }
      }
    };
    loadAudio();

    return () => {
      // Pause before release — remove() alone lets a looping player keep
      // going. The soundRef check means resetAndClose (publish/cancel) and
      // this cleanup each stop the player exactly once.
      if (currentSound && soundRef.current === currentSound) {
        currentSound.pause();
        currentSound.remove();
        soundRef.current = null;
      }
    };
  }, [audioItem, visible]);

  // Owned communities always appear in the audience picker — the owner isn't
  // necessarily an explicit active member row, but the backend lets them post.
  const joinedCommunities = communities.filter(
    (c) => c.isJoined || c.ownerId === CURRENT_USER?.id,
  );
  const selectedComm =
    joinedCommunities.find((c) => c.id === selectedComId) ||
    (selectedComId === preselectedCommunityId
      ? preselectedCommunity
      : undefined);

  // Audience adapts to the account type: public accounts post to everyone,
  // private accounts post to their followers only (community posts always use
  // the community's own privacy).
  const isPrivateAccount = CURRENT_USER?.privacy === "private";
  const feedLabel = isPrivateAccount ? "Followers" : "Public";

  // ── Validation ────────────────────────────────────────────────
  const hasTitle = title.trim().length > 0;
  const hasText = content.trim().length > 0;
  const hasVisualMedia = mediaItems.length > 0;
  const hasContent = hasText || hasVisualMedia;

  // Shake refs
  const shakeAudienceAnim = useRef(new Animated.Value(0)).current;
  const shakeMediaAnim = useRef(new Animated.Value(0)).current;
  const shakeHashtagAnim = useRef(new Animated.Value(0)).current;
  const shakeTitleAnim = useRef(new Animated.Value(0)).current;
  const shakeContentAnim = useRef(new Animated.Value(0)).current;
  const shakePollAnim = useRef(new Animated.Value(0)).current;

  const shake = (anim: Animated.Value) => {
    anim.setValue(0);
    Animated.sequence([
      Animated.timing(anim, {
        toValue: 8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: -8,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 6,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: -6,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 3,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 0,
        duration: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // ── Media picker ────────────────────────────────────────────────
  const pickMedia = async (kind: "gallery" | "audio") => {
    setPickLoading(true);
    try {
      if (kind === "audio") {
        if (mediaItems.length >= 5 && !audioItem) {
          themedAlert(
            "Limit Reached",
            "You can only add up to 5 media files total.",
          );
          setPickLoading(false);
          return;
        }

        const result = await DocumentPicker.getDocumentAsync({
          type: "audio/*",
          multiple: false,
        });
        if (!result.canceled && result.assets.length > 0) {
          const a = result.assets[0];
          setAudioItem({
            uri: a.uri,
            type: "audio",
            name: a.name,
            mimeType: a.mimeType || "audio/mpeg",
            size: a.size,
          });
        }
      } else {
        nativeBypass.beginNativeFlow();
        try {
          const { status } =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") {
            themedAlert(
              "Permission needed",
              "Allow access to your media library to upload photos and videos.",
            );
            setPickLoading(false);
            return;
          }

          const currentTotal = mediaItems.length + (audioItem ? 1 : 0);
          const remaining = 5 - currentTotal;
          if (remaining <= 0) {
            themedAlert(
              "Limit Reached",
              "You can only add up to 5 media files total.",
            );
            setPickLoading(false);
            nativeBypass.endNativeFlow();
            return;
          }

          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images", "videos"],
            allowsEditing: false,
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            quality: 0.85,
          });

          if (!result.canceled && result.assets.length > 0) {
            const newItems = result.assets.map((a) => ({
              uri: a.uri,
              type:
                a.type === "video" ? ("video" as const) : ("image" as const),
              name:
                a.fileName || (a.type === "video" ? "video.mp4" : "image.jpg"),
              mimeType:
                a.mimeType || (a.type === "video" ? "video/mp4" : "image/jpeg"),
              size: a.fileSize || 1000000,
              width: a.width,
              height: a.height,
            }));
            setMediaItems((prev) => {
              const currentTotal = prev.length + (audioItem ? 1 : 0);
              const combined = [...prev, ...newItems];
              if (currentTotal + newItems.length > 5) {
                themedAlert(
                  "Limit Reached",
                  "You can only add up to 5 media files total.",
                );
                return combined.slice(0, 5 - (audioItem ? 1 : 0));
              }
              return combined;
            });
          }
        } finally {
          nativeBypass.endNativeFlow();
        }
      }
    } catch {
      themedAlert("Error", "Could not open media library. Try again.");
    }
    setPickLoading(false);
  };

  const removeMedia = (index: number) => {
    setMediaItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Location picker ───────────────────────────────────────
  // Same behaviour as the signup page: type to search (nominatim
  // suggestions) or auto-detect the current position. The chosen tag
  // (lat / lon / place) rides in the post payload and shows in the card's
  // rolling text; place falls back to the coordinates offline.
  const applyLocation = (
    loc: { lat: number; lon: number; place?: string },
    keepPanelOpen = false,
  ) => {
    setPostLocation(loc);
    setLocationQuery(
      loc.place || `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`,
    );
    setIsTypingLocation(false);
    setLocationDropdownVisible(false);
    if (!keepPanelOpen) setShowLocationInput(false);
  };

  // Captures the current position (lat/lon) and reverse-geocodes it to a
  // human-readable place name ("Bengaluru, Karnataka"). Pass keepPanelOpen
  // when called from the input's onFocus so the detected place lands in the
  // field (like signup) instead of closing the picker.
  const captureLocation = async (keepPanelOpen = false) => {
    setLocationLoading(true);
    nativeBypass.beginNativeFlow();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        themedAlert(
          "Permission needed",
          "Allow location access to tag your post with a place.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      let place: string | undefined;
      try {
        const [addr] = await Location.reverseGeocodeAsync(pos.coords);
        if (addr) {
          place = [addr.city, addr.region, addr.country]
            .filter(Boolean)
            .join(", ");
        }
      } catch (e) {
        place = undefined;
      }
      applyLocation(
        {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          place: place || undefined,
        },
        keepPanelOpen,
      );
    } catch (e) {
      warn("Failed to capture location", e);
      themedAlert("Error", "Could not fetch your location. Try again.");
    } finally {
      nativeBypass.endNativeFlow();
      setLocationLoading(false);
    }
  };

  // Live place search — mirrors the signup page's nominatim lookup.
  useEffect(() => {
    if (!isTypingLocation || locationQuery.length < 3) {
      setLocationResults([]);
      setLocationSearching(false);
      return;
    }
    setLocationSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            locationQuery,
          )}&limit=5`,
          { headers: { "User-Agent": "TaddleBoxApp/1.0" } },
        );
        const uniqueItems = res.data
          .map((item: any) => ({
            name: item.display_name.split(",").slice(0, 3).join(",").trim(),
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
          }))
          .filter(
            (v: any, i: number, a: any[]) =>
              a.findIndex((t) => t.name === v.name) === i,
          );
        setLocationResults(uniqueItems);
        setLocationDropdownVisible(true);
      } catch (e) {
        log("Location search error", e);
      } finally {
        setLocationSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [locationQuery, isTypingLocation]);

  // ── GIF helpers ─────────────────────────────────────────────────
  const fetchGifs = async (query: string = "") => {
    setGifLoading(true);
    try {
      const endpoint = query.trim()
        ? `search?q=${encodeURIComponent(query.trim())}&`
        : `trending?`;
      const klipyKey =
        process.env.EXPO_PUBLIC_KLIPY_KEY ||
        "cVApYlZX4zBljHaSpnIstsHmTWPNThPuYmuJ167v0ETv7askko61kZKD2r2ytJ2X";
      const res = await fetch(
        `https://api.klipy.co/api/v1/${klipyKey}/gifs/${endpoint}limit=20`,
      );
      const json = await res.json();
      setGifs(json.data?.data || []);
    } catch (e) {
      warn("Failed to fetch GIFs", e);
    }
    setGifLoading(false);
  };

  React.useEffect(() => {
    if (showGifPicker && gifs.length === 0) {
      fetchGifs();
    }
  }, [showGifPicker]);

  const selectGif = (gif: any) => {
    const original =
      gif.file?.hd?.gif || gif.file?.md?.gif || gif.file?.xs?.gif;
    const uri = original?.url;
    if (!uri) return;

    if (mediaItems.length + (audioItem ? 1 : 0) >= 5) {
      themedAlert(
        "Limit Reached",
        "You can only add up to 5 media files total.",
      );
      return;
    }

    setMediaItems((prev) => [
      ...prev,
      {
        uri,
        type: "image" as const,
        name: `gif-${gif.id}.gif`,
        mimeType: "image/gif",
        size: original.size || 500000,
        width: parseInt(original.width, 10) || 500,
        height: parseInt(original.height, 10) || 500,
      },
    ]);
    setShowGifPicker(false);
  };

  const extractTags = (text: string) => {
    const plainText = text.replace(/\{#\}\[([^\]]+)\]\([^)]+\)/g, "#$1");
    const tags = new Set<string>();
    const matches = Array.from(plainText.matchAll(/(?:^|\s)(#[a-z0-9_]+)/gi));
    matches.forEach((m) => tags.add(m[1].toLowerCase()));
    return Array.from(tags);
  };

  const extractMentions = (text: string) => {
    // Library encodes confirmed mentions as {@ }[name](id) in the raw value string
    const mentionsMap = new Map<string, { id: string; name: string }>();
    const matches = Array.from(text.matchAll(/\{@\}\[([^\]]+)\]\(([^)]+)\)/g));
    matches.forEach((m) => {
      mentionsMap.set(m[2], { name: m[1], id: m[2] });
    });
    return Array.from(mentionsMap.values());
  };

  const autoHashtags = Array.from(
    new Set([...extractTags(title), ...extractTags(content)]),
  );
  // text OR media — either is sufficient
  const hasHashtag = autoHashtags.length > 0 || hashtags.length > 0;

  // Read confirmed mentions from raw text (library writes {@ }[name](id) for selected mentions)
  const autoMentions = React.useMemo(() => {
    const all = [...extractMentions(title), ...extractMentions(content)];
    const seen = new Map<string, { id: string; name: string }>();
    all.forEach((m) => seen.set(m.id, m));
    return Array.from(seen.values());
  }, [title, content]);

  const addHashtag = () => {
    const tag = hashtagInput.trim().replace(/^#+/, "");
    if (tag) {
      const fullTag = `#${tag.toLowerCase()}`;
      if (!hashtags.includes(fullTag) && !autoHashtags.includes(fullTag)) {
        setHashtags((prev) => [...prev, fullTag]);
      }
    }
    setHashtagInput("");
  };
  // ── Submit ──────────────────────────────────────────────────────
  const handleTitleChange = React.useCallback(
    (val: string) => setTitle(val),
    [],
  );

  const handleContentChange = React.useCallback(
    (val: string) => {
      setContent(val);
      // Auto-detect pasted media/gif/audio URLs and add as media items
      const detected = detectMediaInText(val);
      if (detected) {
        const alreadyAdded =
          mediaItems.some((m) => m.uri === detected.uri) ||
          audioItem?.uri === detected.uri;
        if (!alreadyAdded) {
          const currentTotal = mediaItems.length + (audioItem ? 1 : 0);
          if (currentTotal >= 5 && !(detected.type === "audio" && audioItem)) {
            themedAlert(
              "Limit Reached",
              "You can only add up to 5 media files total.",
            );
          } else {
            if (detected.type === "audio") {
              setAudioItem(detected);
            } else {
              setMediaItems((prev) => [...prev, { ...detected, size: 500000 }]);
            }
          }
          // Strip the URL from text after capturing it
          setContent(val.replace(detected.uri, "").trim());
        }
      }
    },
    [mediaItems, audioItem],
  );

  const resetAndClose = () => {
    // Stop the looping audio preview immediately — the modal may stay mounted
    // (visible=false) so the effect cleanup alone is not enough.
    const p = soundRef.current;
    if (p) {
      p.pause();
      p.remove();
      soundRef.current = null;
      setSound(null);
    }
    // Force-clear media items to unmount PreviewVideo components
    // and trigger their cleanup effects (releasing native video players)
    setMediaItems([]);
    setAudioItem(null);
    onClose();
  };

  const showValidationPop = (msg: string) => {
    setValidationError(msg);
    if (validationTimer.current) clearTimeout(validationTimer.current);
    validationAnim.setValue(0);
    Animated.spring(validationAnim, {
      toValue: 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start();
    validationTimer.current = setTimeout(() => {
      Animated.timing(validationAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => setValidationError(null));
    }, 2600);
  };

  React.useEffect(
    () => () => {
      if (validationTimer.current) clearTimeout(validationTimer.current);
    },
    [],
  );

  const handlePost = async () => {
    // ── Validation with shakes + sleek pop under the Post button ──
    let hasValidationError = false;

    if (!hasTitle) {
      shake(shakeTitleAnim);
      showValidationPop("Add a title to your post");
      hasValidationError = true;
    } else if (!hasContent && !pollEnabled) {
      shake(shakeContentAnim);
      shake(shakeMediaAnim);
      showValidationPop("Add some text, media, or a poll to your post");
      hasValidationError = true;
    } else if (
      pollEnabled &&
      (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2)
    ) {
      shake(shakePollAnim);
      showValidationPop("Add a poll question and at least 2 options");
      hasValidationError = true;
    } else if (!postType) {
      shake(shakeAudienceAnim);
      showValidationPop(
        isPrivateAccount
          ? "Choose where to post — Followers or a Community"
          : "Choose where to post — Public or a Community",
      );
      hasValidationError = true;
    } else if (!hasHashtag) {
      shake(shakeHashtagAnim);
      showValidationPop("Add at least one hashtag to your post");
      hasValidationError = true;
    }

    if (hasValidationError) {
      return;
    }

    setUploading(true);
    
    // Close modal immediately + show spinner on + icon
    Keyboard.dismiss();
    onClose();
    notificationBus.emit("postSubmitting");

    // Tracks every media row created this attempt so a failure AFTER upload
    // (e.g. the post API rejects) deletes the orphaned S3 objects instead of
    // junking the bucket.
    const uploadedMedia: { id: string; type?: string }[] = [];
    try {
      const allMedia = [...mediaItems];
      if (audioItem) allMedia.push(audioItem);

      // Upload all selected media files
      for (const item of allMedia) {
        // For GIFs from the Klipy CDN, download locally first before uploading
        let uploadUri = item.uri;
        let tempPath: string | null = null;
        if (item.mimeType === "image/gif" && item.uri.startsWith("http")) {
          const fileName = item.name || `gif-${Date.now()}.gif`;
          tempPath = `${FileSystem.cacheDirectory}${fileName}`;
          const downloadResult = await FileSystem.downloadAsync(
            item.uri,
            tempPath,
          );
          uploadUri = downloadResult.uri;
        }

        const folder = "posts";
        const res = await mediaService.getSignedUrl(
          folder,
          item.size || 1000000,
          item.mimeType || (item.type === "video" ? "video/mp4" : "image/jpeg"),
          item.width,
          item.height,
        );
        await mediaService.uploadFileDirect(
          res.data.signedUrl!,
          uploadUri,
          item.mimeType || (item.type === "video" ? "video/mp4" : "image/jpeg"),
        );
        await mediaService.confirmUpload(res.data.mediaId, res.data.s3Key!);
        uploadedMedia.push({ id: res.data.mediaId, type: item.type });

        // Clean up temp GIF file
        if (tempPath) {
          FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(
            () => {},
          );
        }
      }

      const postPayload = {
        title: title.trim(),
        content: content.trim(),
        communityId: postType === "community" ? resolvedComId : undefined,
        tags: Array.from(new Set([...autoHashtags, ...hashtags])).map((t) =>
          t.startsWith("#") ? t.substring(1) : t,
        ),
        mentions: autoMentions.map((m) => m.id),
        visibility:
          postType === "community"
            ? "community_only"
            : isPrivateAccount
              ? "followers"
              : "public",
        status: "published",
        media: uploadedMedia,
        location: postLocation ?? undefined,
        // Poll posts carry the question + options in poll_data; the backend
        // treats them as a valid post even without body text.
        pollData: pollEnabled
          ? {
              question: pollQuestion.trim(),
              options: pollOptions
                .filter((o) => o.trim().length > 0)
                .map((o) => ({ text: o.trim(), votes: 0 })),
            }
          : undefined,
      };

      // Publish post via mutation
      await createPostAsync(postPayload);

      // Show success alert globally after a delay to prevent iOS multiple-modal 
      // conflict (wait for this modal's slide-out animation to finish)
      setTimeout(() => {
        themedAlert("Success", `Post published successfully! +${xpReward} XP earned.`);
      }, 400);

      // Reset state after successful submit
      setTitle("");
      setContent("");
      setMediaItems([]);
      setAudioItem(null);
      setHashtags([]);
      setPollEnabled(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPostLocation(null);
    } catch (err) {
      // Roll back any media that already made it to S3 so a failed publish
      // doesn't leave orphaned uploads behind.
      if (uploadedMedia.length > 0) {
        uploadedMedia.forEach((m) => {
          if (m.id) {
            mediaService.cancleUpload(m.id).catch(() => {});
          }
        });
      }
      // Since modal is closed, alert shows globally
      themedAlert("Error", "Failed to create post. Try again.");
      error(err);
    } finally {
      setUploading(false);
      notificationBus.emit("postCompleted");
    }
  };

  // ── Computed media preview height ────────────────────────────────
  const previewW = SCREEN_W - spacing.lg * 2; // match content margin width
  let previewH = previewW;

  if (mediaItems.length > 0) {
    let minAspectRatio = 1;
    let hasValidDimensions = false;

    mediaItems.forEach((item) => {
      if (item.width && item.height) {
        const ratio = item.width / item.height;
        if (!hasValidDimensions || ratio < minAspectRatio) {
          minAspectRatio = ratio;
          hasValidDimensions = true;
        }
      }
    });

    if (hasValidDimensions) {
      previewH = previewW / minAspectRatio;
      // Bound the preview height so it doesn't break the UI
      if (previewH > SCREEN_W * 1.5) previewH = SCREEN_W * 1.5;
      if (previewH < SCREEN_W * 0.4) previewH = SCREEN_W * 0.4;
    }
  }

  const xpReward = React.useMemo(() => {
    const hasText = content.trim().length > 0;
    const visualMedia = mediaItems.filter((m) => m.mimeType !== "audio");
    const audioMedia = mediaItems.filter((m) => m.mimeType === "audio");

    const typesCount =
      (hasText ? 1 : 0) +
      (visualMedia.length > 0 ? 1 : 0) +
      (audioMedia.length > 0 ? 1 : 0);
    if (typesCount >= 3) return 10;
    if (typesCount === 2) return 5;
    return 2;
  }, [content, mediaItems]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top || 16 }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 24}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Post</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "rgba(251,191,36,0.15)",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 12,
                gap: 3,
              }}
            >
              <Ionicons
                name="flash"
                size={12}
                color={colors.xpGold || "#FBBF24"}
              />
              <Text
                style={{
                  color: colors.xpGold || "#FBBF24",
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                up to 100 XP
              </Text>
            </View>
            <View style={{ position: "relative", zIndex: 200, elevation: 20 }}>
              <TouchableOpacity onPress={handlePost} disabled={uploading}>
                <LinearGradient
                  colors={
                    !uploading
                      ? [colors.primary, colors.cyanDark]
                      : [colors.bg.elevated, colors.bg.elevated]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.postBtn}
                >
                  <Text
                    style={[
                      styles.postBtnText,
                      uploading && styles.postBtnTextDisabled,
                    ]}
                  >
                    {uploading ? "Posting..." : "Post"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Validation pop — sleek tooltip under the Post button */}
              {validationError && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.validationPop,
                    {
                      opacity: validationAnim,
                      transform: [
                        {
                          translateY: validationAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-6, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle"
                    size={13}
                    color="#fff"
                    style={{ marginRight: 5 }}
                  />
                  <Text style={styles.validationPopText}>
                    {validationError}
                  </Text>
                </Animated.View>
              )}
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── User + destination ── */}
          <View style={styles.userRow}>
            <View style={styles.avatarBubble}>
              {CURRENT_USER?.avatarUrl || CURRENT_USER?.avatar_url ? (
                <Image
                  source={{
                    uri: CURRENT_USER.avatarUrl || CURRENT_USER.avatar_url,
                  }}
                  style={styles.avatarImage}
                />
              ) : (
                <Text style={styles.avatarText}>
                  {CURRENT_USER?.avatar || "👾"}
                </Text>
              )}
            </View>
            <View style={styles.userMeta}>
              <Text style={styles.userName}>
                {CURRENT_USER?.name || "Taddle User"}
              </Text>
              <View style={styles.postTypeRow}>
                <Animated.View
                  style={{ transform: [{ translateX: shakeAudienceAnim }] }}
                >
                  <TouchableOpacity
                    style={[styles.typePill, postType && styles.typePillActive]}
                    onPress={() => setShowPicker(true)}
                  >
                    <Ionicons
                      name={
                        postType === "feed"
                          ? isPrivateAccount
                            ? "lock-closed-outline"
                            : "globe-outline"
                          : postType === "community"
                            ? "people-outline"
                            : "earth"
                      }
                      size={11}
                      color={postType ? colors.primaryLight : colors.text.muted}
                    />
                    <Text
                      style={[
                        styles.typePillText,
                        postType && styles.typePillTextActive,
                      ]}
                    >
                      {postType === "feed"
                        ? feedLabel
                        : postType === "community"
                          ? selectedComm
                            ? selectedComm.name
                            : "Community"
                          : "Select Audience"}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={11}
                      color={postType ? colors.primaryLight : colors.text.muted}
                    />
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </View>
          </View>

          {/* ── Content ── */}
          <Animated.View
            style={{
              position: "relative",
              zIndex: activeInput === "title" ? 100 : 1,
              elevation: activeInput === "title" ? 100 : 1,
              transform: [{ translateX: shakeTitleAnim }],
            }}
          >
            <View style={styles.inputField}>
              <SmartInput
                style={[
                  styles.contentInput,
                  { minHeight: 40, fontWeight: "700", fontSize: fontSizes.lg },
                ]}
                placeholder="Post title"
                placeholderTextColor={colors.text.muted}
                value={title}
                onChange={handleTitleChange}
                onFocus={() => setActiveInput("title")}
                maxLength={100}
                suggestionPosition="bottom"
              />
            </View>
          </Animated.View>
          <Animated.View
            style={{
              position: "relative",
              zIndex: activeInput === "content" ? 100 : 1,
              elevation: activeInput === "content" ? 100 : 1,
              transform: [{ translateX: shakeContentAnim }],
            }}
          >
            <View style={[styles.inputField, styles.inputFieldBody]}>
              <SmartInput
                style={styles.contentInput}
                placeholder="Share your thoughts"
                placeholderTextColor={colors.text.muted}
                multiline
                value={content}
                onChange={handleContentChange}
                onFocus={() => setActiveInput("content")}
                maxLength={500}
                suggestionPosition="top"
                textAlignVertical="top"
              />
            </View>
          </Animated.View>
          <View
            style={{
              flexDirection: "row",
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.sm,
              marginTop: -spacing.md,
            }}
          >
            <Text
              style={[
                styles.charCount,
                content.length > 450 && styles.charCountWarn,
                { marginLeft: "auto" },
              ]}
            >
              {content.length}/500
            </Text>
          </View>

          {/* Media preview list */}
          {mediaItems.length > 0 && (
            <View style={styles.previewWrapper}>
              {/* Previews (Horizontal Scroll) */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={previewW + 10}
                decelerationRate="fast"
                onScroll={(e) => {
                  const x = e.nativeEvent.contentOffset.x;
                  const page = Math.max(
                    0,
                    Math.min(
                      mediaItems.length - 1,
                      Math.round(x / (previewW + 10)),
                    ),
                  );
                  if (page !== currentMediaPage) setCurrentMediaPage(page);
                }}
                scrollEventThrottle={16}
              >
                <View
                  style={{
                    flexDirection: "row",
                    paddingHorizontal: 0,
                    gap: 10,
                  }}
                >
                  {mediaItems.map((item, index) => (
                    <View
                      key={index}
                      style={[
                        styles.previewBox,
                        {
                          width: previewW,
                          height: previewH,
                          backgroundColor: "#000",
                        },
                      ]}
                    >
                      {item.type === "video" ? (
                        <PreviewVideo
                          uri={item.uri}
                          width={previewW}
                          height={previewH}
                          muted={!!audioItem}
                          isActive={index === currentMediaPage}
                        />
                      ) : (
                        <Image
                          source={{ uri: item.uri }}
                          style={{ width: previewW, height: previewH }}
                          resizeMode="contain"
                        />
                      )}
                      {/* Remove button */}
                      <TouchableOpacity
                        style={styles.removeMedia}
                        onPress={() => removeMedia(index)}
                      >
                        <View style={styles.removeMediaInner}>
                          <Ionicons name="close" size={16} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </ScrollView>

              {/* Pagination Dots */}
              {mediaItems.length > 1 && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 6,
                    marginTop: 12,
                  }}
                >
                  {mediaItems.map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor:
                          i === currentMediaPage
                            ? colors.primaryLight
                            : colors.border,
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Action Toolbar */}
          <View style={styles.toolbar}>
            {/* Gallery + GIF icon group — shakes when no content */}
            <Animated.View
              style={{
                flexDirection: "row",
                gap: spacing.lg,
                transform: [{ translateX: shakeMediaAnim }],
              }}
            >
              <TouchableOpacity
                onPress={() => pickMedia("gallery")}
                style={styles.toolbarBtn}
                disabled={pickLoading}
              >
                <Ionicons
                  name="image-outline"
                  size={24}
                  color={colors.primaryLight}
                />
                <View style={styles.toolbarBadge}>
                  <Ionicons name="add" size={10} color="#fff" />
                </View>
                {mediaItems.filter((m) => m.mimeType !== "image/gif").length >
                  0 && (
                  <View style={styles.toolbarCountBadge}>
                    <Text style={styles.toolbarBadgeText}>
                      {
                        mediaItems.filter((m) => m.mimeType !== "image/gif")
                          .length
                      }
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowGifPicker(true)}
                style={styles.toolbarBtn}
                disabled={pickLoading}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: colors.primaryLight,
                      fontSize: 10,
                      fontWeight: "900",
                      borderWidth: 1.5,
                      borderColor: colors.primaryLight,
                      borderRadius: 4,
                      paddingHorizontal: 2,
                      paddingVertical: 1,
                      textAlign: "center",
                    }}
                  >
                    GIF
                  </Text>
                </View>
                <View style={styles.toolbarBadge}>
                  <Ionicons name="add" size={10} color="#fff" />
                </View>
                {mediaItems.filter((m) => m.mimeType === "image/gif").length >
                  0 && (
                  <View style={styles.toolbarCountBadge}>
                    <Text style={styles.toolbarBadgeText}>
                      {
                        mediaItems.filter((m) => m.mimeType === "image/gif")
                          .length
                      }
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* Poll toggle — filled when a poll is attached */}
            <TouchableOpacity
              onPress={() => setPollEnabled((v) => !v)}
              style={styles.toolbarBtn}
            >
              <Ionicons
                name={pollEnabled ? "bar-chart" : "bar-chart-outline"}
                size={24}
                color={colors.primaryLight}
              />
            </TouchableOpacity>

            {audioItem ? (
              <View
                style={[
                  styles.audioBtn,
                  styles.audioBtnFilled,
                  {
                    flex: 1,
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    marginHorizontal: spacing.sm,
                    borderWidth: 0,
                  },
                ]}
              >
                <Ionicons
                  name="musical-notes"
                  size={16}
                  color={colors.primaryLight}
                />
                <Text
                  style={[
                    styles.audioBtnFilledText,
                    { fontSize: fontSizes.xs },
                  ]}
                  numberOfLines={1}
                >
                  {audioItem.name}
                </Text>
                <TouchableOpacity
                  onPress={() => setAudioItem(null)}
                  style={{ marginLeft: "auto" }}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={colors.text.muted}
                  />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => pickMedia("audio")}
                style={styles.toolbarBtn}
                disabled={pickLoading}
              >
                <Ionicons
                  name="musical-notes-outline"
                  size={24}
                  color={colors.primaryLight}
                />
                <View style={styles.toolbarBadge}>
                  <Ionicons name="add" size={10} color="#fff" />
                </View>
              </TouchableOpacity>
            )}

            {/* Mentions & Hashtag Icons Group — separate so only # shakes */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                marginLeft: "auto",
              }}
            >
              {/* Mentions Icon — static, no shake */}
              <View style={styles.toolbarBtn}>
                <Ionicons name="at" size={26} color={colors.primaryLight} />
                {autoMentions.length > 0 && (
                  <View
                    style={[
                      styles.toolbarCountBadge,
                      { bottom: -2, left: -2, top: "auto", right: "auto" },
                    ]}
                  >
                    <Text style={styles.toolbarBadgeText}>
                      {autoMentions.length}
                    </Text>
                  </View>
                )}
              </View>

              {/* Location toggle — sits right after @, opens the picker below */}
              <View style={styles.toolbarBtn}>
                <TouchableOpacity
                  onPress={() => {
                    if (!showLocationInput && postLocation) {
                      setLocationQuery(
                        postLocation.place ||
                          `${postLocation.lat.toFixed(4)}, ${postLocation.lon.toFixed(4)}`,
                      );
                    }
                    setShowLocationInput((v) => !v);
                  }}
                  disabled={locationLoading}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons
                    name={postLocation ? "location" : "location-outline"}
                    size={24}
                    color={
                      locationLoading ? colors.text.muted : colors.primaryLight
                    }
                  />
                </TouchableOpacity>
                {postLocation && (
                  <View
                    style={[
                      styles.toolbarCountBadge,
                      { bottom: -2, left: -2, top: "auto", right: "auto" },
                    ]}
                  >
                    <Ionicons name="location" size={8} color="#fff" />
                  </View>
                )}
              </View>

              {/* Hashtag Toggle */}
              <Animated.View
                style={{ transform: [{ translateX: shakeHashtagAnim }] }}
              >
                <TouchableOpacity
                  onPress={() => setShowHashtagInput(!showHashtagInput)}
                  style={styles.toolbarBtn}
                >
                  <Ionicons
                    name="pricetag-outline"
                    size={24}
                    color={colors.primaryLight}
                  />
                  {hashtags.length + autoHashtags.length > 0 && (
                    <View
                      style={[
                        styles.toolbarCountBadge,
                        { bottom: -2, left: -2, top: "auto", right: "auto" },
                      ]}
                    >
                      <Text style={styles.toolbarBadgeText}>
                        {hashtags.length + autoHashtags.length}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>

          {/* ── Poll composer — preview under the media, matches the card
              layout (media leads, poll sits below it) ── */}
          {pollEnabled && (
            <Animated.View
              style={[
                styles.section,
                {
                  // A little extra room below the media preview above it.
                  marginTop: spacing.md,
                  transform: [{ translateX: shakePollAnim }],
                },
              ]}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={styles.sectionLabel}>Poll</Text>
                <TouchableOpacity
                  onPress={() => setPollEnabled(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color={colors.text.muted}
                  />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.pollInput}
                placeholder="Poll question"
                placeholderTextColor={colors.text.muted}
                value={pollQuestion}
                onChangeText={setPollQuestion}
                maxLength={300}
              />

              {pollOptions.map((opt, i) => (
                <View key={i} style={styles.pollOptionRow}>
                  {/* flex: 1 keeps the pill inside the card — without it,
                      long option text grows the row and pushes the remove
                      button past the screen edge. */}
                  <View style={[styles.hashInputPill, { flex: 1 }]}>
                    <Text
                      style={{
                        color: colors.text.muted,
                        fontSize: 12,
                        fontWeight: "700",
                        width: 18,
                      }}
                    >
                      {i + 1}.
                    </Text>
                    <TextInput
                      style={[styles.hashInputPillInput, { flex: 1 }]}
                      placeholder={`Option ${i + 1}`}
                      placeholderTextColor={colors.text.muted}
                      value={opt}
                      onChangeText={(t) =>
                        setPollOptions((prev) =>
                          prev.map((o, idx) => (idx === i ? t : o)),
                        )
                      }
                      maxLength={120}
                    />
                  </View>
                  {pollOptions.length > 2 && (
                    <TouchableOpacity
                      onPress={() =>
                        setPollOptions((prev) =>
                          prev.filter((_, idx) => idx !== i),
                        )
                      }
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="remove-circle-outline"
                        size={20}
                        color={colors.text.muted}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {pollOptions.length < 6 && (
                <TouchableOpacity
                  onPress={() => setPollOptions((prev) => [...prev, ""])}
                  style={styles.pollAddBtn}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={16}
                    color={colors.primaryLight}
                  />
                  <Text style={styles.pollAddText}>Add option</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}

          {/* ── Location picker ── */}
          {showLocationInput && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Location </Text>
              <View
                style={{
                  position: "relative",
                  zIndex: activeInput === "location" ? 100 : 1,
                  elevation: activeInput === "location" ? 100 : 1,
                }}
              >
                <View style={styles.hashInputPill}>
                  <Ionicons
                    name="location"
                    size={14}
                    color={colors.primaryLight}
                  />
                  <TextInput
                    style={[styles.hashInputPillInput, { flex: 1 }]}
                    placeholder="Search a place…"
                    placeholderTextColor={colors.text.muted}
                    value={locationQuery}
                    onFocus={() => {
                      setActiveInput("location");
                      setLocationDropdownVisible(true);
                      // Same as signup: auto-detect when opened empty,
                      // filling the field rather than closing the picker.
                      if (!locationQuery.trim() && !postLocation) {
                        captureLocation(true);
                      }
                    }}
                    onChangeText={(text) => {
                      setLocationQuery(text);
                      setIsTypingLocation(true);
                      setLocationDropdownVisible(true);
                    }}
                    onBlur={() =>
                      setTimeout(() => setLocationDropdownVisible(false), 250)
                    }
                    autoCapitalize="words"
                    returnKeyType="search"
                  />
                  <TouchableOpacity
                    onPress={() => captureLocation()}
                    disabled={locationLoading}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons
                      name={locationLoading ? "sync" : "locate"}
                      size={18}
                      color={colors.primaryLight}
                    />
                  </TouchableOpacity>
                </View>

                {locationDropdownVisible && (
                  <View style={styles.locationDropdown}>
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      style={{ maxHeight: 240 }}
                    >
                      <TouchableOpacity
                        style={styles.locationDropdownItem}
                        onPress={() => captureLocation()}
                      >
                        <Ionicons
                          name="locate"
                          size={16}
                          color={colors.primaryLight}
                        />
                        <Text
                          style={[
                            styles.locationDropdownText,
                            {
                              color: colors.primaryLight,
                              fontWeight: "700",
                            },
                          ]}
                        >
                          Auto-detect my location
                        </Text>
                      </TouchableOpacity>
                      {locationQuery.length < 3 ? (
                        <View style={styles.locationDropdownHint}>
                          <Text
                            style={[
                              styles.locationDropdownHintText,
                              { color: colors.text.muted },
                            ]}
                          >
                            Type at least 3 letters to search…
                          </Text>
                        </View>
                      ) : locationSearching ? (
                        <View style={styles.locationDropdownHint}>
                          <Text
                            style={[
                              styles.locationDropdownHintText,
                              { color: colors.text.muted },
                            ]}
                          >
                            Searching…
                          </Text>
                        </View>
                      ) : locationResults.length === 0 ? (
                        <View style={styles.locationDropdownHint}>
                          <Text
                            style={[
                              styles.locationDropdownHintText,
                              { color: colors.text.muted },
                            ]}
                          >
                            No locations found for "{locationQuery}"
                          </Text>
                        </View>
                      ) : (
                        locationResults.map((item, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={styles.locationDropdownItem}
                            onPress={() =>
                              applyLocation({
                                lat: item.lat,
                                lon: item.lon,
                                place: item.name,
                              })
                            }
                          >
                            <Ionicons
                              name="location-outline"
                              size={16}
                              color={colors.text.muted}
                            />
                            <Text style={styles.locationDropdownText}>
                              {item.name}
                            </Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ── Location ── */}
          {postLocation && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Location</Text>
              <View style={styles.hashtagChips}>
                <View style={styles.hashChip}>
                  <Ionicons
                    name="location"
                    size={13}
                    color={colors.primaryLight}
                  />
                  <Text
                    style={[styles.hashChipText, { flexShrink: 1 }]}
                    numberOfLines={1}
                  >
                    {postLocation.place ||
                      `${postLocation.lat.toFixed(4)}, ${postLocation.lon.toFixed(4)}`}
                  </Text>
                  <TouchableOpacity onPress={() => setPostLocation(null)}>
                    <Ionicons
                      name="close-circle"
                      size={13}
                      color={colors.primaryLight}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* ── Hashtags ── */}
          {(showHashtagInput ||
            hashtags.length > 0 ||
            autoHashtags.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Hashtags</Text>

              <View style={styles.hashtagChips}>
                {autoHashtags.map((tag) => (
                  <View
                    key={`auto-${tag}`}
                    style={[styles.hashChip, styles.hashChipAuto]}
                  >
                    <Text
                      style={[styles.hashChipText, styles.hashChipTextAuto]}
                    >
                      {tag}
                    </Text>
                  </View>
                ))}
                {hashtags.map((tag) => (
                  <TouchableOpacity
                    key={`manual-${tag}`}
                    style={styles.hashChip}
                    onPress={() =>
                      setHashtags((prev) => prev.filter((t) => t !== tag))
                    }
                  >
                    <Text style={styles.hashChipText}>{tag}</Text>
                    <Ionicons
                      name="close-circle"
                      size={13}
                      color={colors.primaryLight}
                    />
                  </TouchableOpacity>
                ))}

                {showHashtagInput && (
                  <View
                    style={{
                      position: "relative",
                      zIndex: activeInput === "hashtag" ? 100 : 1,
                      elevation: activeInput === "hashtag" ? 100 : 1,
                    }}
                  >
                    <View style={styles.hashInputPill}>
                      <Text style={styles.hashInputPillPrefix}>#</Text>
                      <TextInput
                        style={styles.hashInputPillInput}
                        placeholder="add tag"
                        placeholderTextColor={colors.text.muted}
                        value={hashtagInput}
                        onFocus={() => setActiveInput("hashtag")}
                        onChangeText={(val) => {
                          if (val.endsWith(" ") || val.endsWith(",")) {
                            const tag = val
                              .trim()
                              .replace(/,/g, "")
                              .replace(/^#+/, "");
                            if (tag) {
                              const fullTag = `#${tag.toLowerCase()}`;
                              if (
                                !hashtags.includes(fullTag) &&
                                !autoHashtags.includes(fullTag)
                              ) {
                                setHashtags((prev) => [...prev, fullTag]);
                              }
                            }
                            setHashtagInput("");
                          } else {
                            setHashtagInput(val);
                          }
                        }}
                        onSubmitEditing={addHashtag}
                        onBlur={() => {
                          if (hashtagInput.trim()) {
                            addHashtag();
                          } else {
                            setShowHashtagInput(false);
                          }
                        }}
                        returnKeyType="done"
                        autoCapitalize="none"
                        blurOnSubmit={false}
                        autoFocus
                      />
                    </View>
                    {renderPillSuggestions()}
                  </View>
                )}
                {!showHashtagInput && (
                  <TouchableOpacity
                    style={{
                      justifyContent: "center",
                      alignItems: "center",
                      paddingHorizontal: 4,
                    }}
                    onPress={() => setShowHashtagInput(true)}
                  >
                    <Ionicons
                      name="add"
                      size={10}
                      color={colors.primaryLight}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ── Mentions ── */}
          {autoMentions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Mentions</Text>
              <View style={styles.hashtagChips}>
                {autoMentions.map((user) => (
                  <View
                    key={`mention-${user.id}`}
                    style={[styles.hashChip, styles.hashChipAuto]}
                  >
                    <Text
                      style={[styles.hashChipText, styles.hashChipTextAuto]}
                    >
                      @{user.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Audience picker — shared, searchable + paginated ── */}
          <AudiencePicker
            visible={showPicker}
            onClose={() => setShowPicker(false)}
            selectedId={
              postType === "community"
                ? selectedComId
                : postType === "feed"
                  ? null
                  : undefined
            }
            onSelect={(id) => {
              if (id === null) {
                setPostType("feed");
                setSelComId(null);
              } else {
                setPostType("community");
                setSelComId(id);
              }
              setShowPicker(false);
            }}
            feedLabel={feedLabel}
            feedMeta={
              isPrivateAccount
                ? "Only your approved followers can see this"
                : "Anyone on Taddle can see this"
            }
            feedIcon={
              isPrivateAccount ? "lock-closed-outline" : "globe-outline"
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── GIF Picker Modal ── */}
      <Modal visible={showGifPicker} animationType="slide" transparent={true}>
        <View style={styles.gifModalContainer}>
          <View style={styles.gifModalContent}>
            <View style={styles.gifHeader}>
              <Text style={styles.gifTitle}>Select a GIF</Text>
              <TouchableOpacity onPress={() => setShowGifPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.gifSearchRow}>
              <Ionicons name="search" size={20} color={colors.text.muted} />
              <TextInput
                style={styles.gifSearchInput}
                placeholder="Search GIFs..."
                placeholderTextColor={colors.text.muted}
                value={gifQuery}
                onChangeText={setGifQuery}
                onSubmitEditing={() => fetchGifs(gifQuery)}
                returnKeyType="search"
              />
            </View>
            {gifLoading ? (
              <View style={styles.gifLoading}>
                <Text style={styles.gifLoadingText}>Loading...</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.gifGrid}>
                {gifs.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => selectGif(g)}
                    style={styles.gifItem}
                  >
                    <Image
                      source={{
                        uri: g.file?.xs?.gif?.url || g.file?.md?.gif?.url,
                      }}
                      style={{
                        width: "100%",
                        height: 100,
                        borderRadius: radii.sm,
                      }}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg.base },

    // Header
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      // Keep the header (and the validation tooltip it contains) above the
      // ScrollView content so the tooltip never renders behind the composer.
      position: "relative",
      zIndex: 300,
      elevation: 30,
    },
    closeBtn: { padding: 4 },
    headerTitle: {
      fontSize: fontSizes.lg,
      fontWeight: "700",
      color: colors.text.primary,
    },
    postBtn: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 8,
      borderRadius: radii.full,
    },
    postBtnText: { fontSize: fontSizes.sm, fontWeight: "700", color: "#fff" },
    postBtnTextDisabled: { color: colors.text.muted },
    validationPop: {
      position: "absolute",
      top: "100%",
      right: 0,
      marginTop: 8,
      minWidth: 150,
      backgroundColor: "rgba(239,68,68,0.95)",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      shadowColor: "#EF4444",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 12,
      zIndex: 300,
    },
    validationPopText: {
      fontSize: fontSizes.xs,
      fontWeight: "700",
      color: "#fff",
      // Allow the message to wrap inside the bubble instead of spilling out.
      flexShrink: 1,
    },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 200 },

    // User row
    userRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    avatarBubble: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.bg.elevated,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.primaryDark,
      overflow: "hidden",
    },
    avatarImage: { width: "100%", height: "100%", borderRadius: 23 },
    avatarText: { fontSize: 22 },
    userMeta: { flex: 1, gap: 6 },
    userName: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: colors.text.primary,
    },
    postTypeRow: { flexDirection: "row", gap: 8 },
    typePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg.surface,
    },
    typePillActive: {
      borderColor: colors.primaryLight,
      backgroundColor: "rgba(124,58,237,0.12)",
    },
    typePillText: {
      fontSize: fontSizes.xs,
      fontWeight: "600",
      color: colors.text.muted,
    },
    typePillTextActive: { color: colors.primaryLight },

    // Content — inputs are borderless with only placeholder hints so the
    // composer reads like a natural text page (Twitter-style) instead of
    // boxes around every field.
    inputField: {
      marginBottom: spacing.sm,
      paddingTop: spacing.xs,
    },
    inputFieldBody: {
      minHeight: 130,
    },
    contentInput: {
      fontSize: fontSizes.md,
      color: colors.text.primary,
      lineHeight: 22,
      paddingTop: 0,
      paddingBottom: 20,
    },
    charCount: {
      fontSize: fontSizes.xs,
      color: colors.text.muted,
    },
    charCountWarn: { color: colors.warning },

    // Toolbar
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: spacing.md,
    },
    toolbarBtn: {
      padding: 4,
      position: "relative",
    },
    toolbarBadge: {
      position: "absolute",
      top: 0,
      right: 0,
      backgroundColor: colors.primary,
      borderRadius: 8,
      width: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.bg.surface,
    },
    toolbarCountBadge: {
      position: "absolute",
      bottom: 0,
      left: 0,
      backgroundColor: colors.primary,
      borderRadius: 8,
      width: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.bg.surface,
    },
    toolbarBadgeText: {
      color: "#fff",
      fontSize: 8,
      fontWeight: "bold",
    },

    // Sections
    section: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.md,
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
    sectionLabel: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    optionalLabel: {
      color: colors.text.muted,
      fontWeight: "400",
      textTransform: "none",
    },

    // Poll composer
    pollInput: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      color: colors.text.primary,
      fontSize: fontSizes.md,
    },
    pollOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    pollAddBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      paddingVertical: 6,
    },
    pollAddText: {
      color: colors.primaryLight,
      fontSize: fontSizes.sm,
      fontWeight: "700",
    },

    // Media type buttons (before pick)
    mediaRow: { flexDirection: "row", gap: 10 },
    mediaBtn: {
      flex: 1,
      alignItems: "center",
      gap: 5,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg.surface,
    },
    mediaBtnLabel: {
      fontSize: fontSizes.xs,
      fontWeight: "600",
      color: colors.text.muted,
    },

    // Audio button
    audioBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg.surface,
    },
    audioBtnFilled: {
      borderColor: colors.primaryDark,
      backgroundColor: "rgba(124,58,237,0.1)",
    },
    audioBtnLabel: {
      fontSize: fontSizes.sm,
      fontWeight: "600",
      color: colors.text.muted,
    },
    audioBtnFilledText: {
      fontSize: fontSizes.sm,
      fontWeight: "600",
      color: colors.primaryLight,
      flex: 1,
    },

    // Media preview
    previewWrapper: { gap: 10 },
    ratioRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    ratioLabel: {
      fontSize: fontSizes.sm,
      color: colors.text.secondary,
      fontWeight: "600",
    },
    ratioToggle: { flexDirection: "row", gap: 6 },
    ratioPill: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg.surface,
    },
    ratioPillActive: {
      borderColor: colors.primaryLight,
      backgroundColor: "rgba(124,58,237,0.14)",
    },
    ratioPillText: {
      fontSize: fontSizes.xs,
      fontWeight: "600",
      color: colors.text.muted,
    },
    ratioPillTextActive: { color: colors.primaryLight },

    previewBox: {
      borderRadius: radii.md,
      overflow: "hidden",
      position: "relative",
    },
    audioPreview: {
      backgroundColor: colors.bg.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    audioPreviewText: {
      color: colors.text.primary,
      fontWeight: "600",
      marginTop: 10,
      fontSize: fontSizes.sm,
      paddingHorizontal: 20,
      textAlign: "center",
    },
    addMorePreview: {
      backgroundColor: colors.bg.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
    },
    addMorePreviewText: {
      color: colors.text.muted,
      fontWeight: "600",
      marginTop: 10,
      fontSize: fontSizes.sm,
    },
    removeMedia: {
      position: "absolute",
      top: 8,
      right: 8,
    },
    removeMediaInner: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
    },
    replaceMedia: { position: "absolute", bottom: 8, right: 8 },
    replaceMediaInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(0,0,0,0.6)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radii.full,
    },
    replaceText: { fontSize: fontSizes.xs, color: "#fff", fontWeight: "600" },

    // Hashtags
    hashtagChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    hashChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radii.full,
      backgroundColor: "rgba(124,58,237,0.15)",
      borderWidth: 1,
      borderColor: colors.primaryDark,
    },
    hashChipText: {
      fontSize: fontSizes.sm,
      color: colors.primaryLight,
      fontWeight: "600",
    },
    hashChipAuto: {
      backgroundColor: colors.bg.elevated,
      borderColor: colors.border,
    },
    hashChipTextAuto: {
      color: colors.text.secondary,
    },
    hashInputPill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "transparent",
      borderRadius: radii.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 80,
    },
    hashInputPillPrefix: {
      fontSize: fontSizes.sm,
      fontWeight: "700",
      color: colors.primaryLight,
    },
    hashInputPillInput: {
      fontSize: fontSizes.sm,
      color: colors.text.primary,
      marginLeft: 2,
      paddingVertical: 0,
      minWidth: 50,
    },

    // Location picker dropdown (type-to-search suggestions)
    locationDropdown: {
      position: "absolute",
      top: "100%",
      left: 0,
      right: 0,
      zIndex: 100,
      elevation: 100,
      marginTop: 4,
      backgroundColor: colors.bg.elevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      overflow: "hidden",
    },
    locationDropdownItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    locationDropdownText: {
      fontSize: fontSizes.sm,
      color: colors.text.primary,
      flex: 1,
    },
    locationDropdownHint: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      alignItems: "center",
    },
    locationDropdownHintText: {
      fontSize: fontSizes.sm,
    },

    // Community picker
    communitySheet: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.md,
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
    communitySheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    communitySheetTitle: {
      fontSize: fontSizes.md,
      fontWeight: "700",
      color: colors.text.primary,
    },
    communityOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg.surface,
    },
    communityOptionActive: {
      borderColor: colors.primaryLight,
      backgroundColor: "rgba(124,58,237,0.10)",
    },
    communityAvatar: { fontSize: 28 },
    communityInfo: { flex: 1 },
    communityName: {
      fontSize: fontSizes.md,
      fontWeight: "600",
      color: colors.text.primary,
    },
    communityMeta: {
      fontSize: fontSizes.sm,
      color: colors.text.muted,
      marginTop: 2,
    },
    emptyComm: { padding: spacing.lg, alignItems: "center" },
    emptyCommText: {
      fontSize: fontSizes.sm,
      color: colors.text.muted,
      textAlign: "center",
    },

    // GIF Modal Styles
    gifModalContainer: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    gifModalContent: {
      backgroundColor: colors.bg.surface,
      height: "75%",
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.md,
    },
    gifHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    gifTitle: {
      fontSize: fontSizes.lg,
      fontWeight: "700",
      color: colors.text.primary,
    },
    gifSearchRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg.elevated,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      marginBottom: spacing.md,
    },
    gifSearchInput: {
      flex: 1,
      marginLeft: 8,
      fontSize: fontSizes.md,
      color: colors.text.primary,
      paddingVertical: 0,
    },
    gifGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "space-between",
      paddingBottom: 40,
    },
    gifItem: {
      width: "31%", // roughly 3 columns
      marginBottom: 5,
    },
    gifLoading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    gifLoadingText: {
      color: colors.text.muted,
    },
  }); // close StyleSheet.create
} // close makeStyles
