import React, { useState } from "react";
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
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Video, Audio, ResizeMode } from "expo-av";
import { colors, fontSizes, spacing, radii } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { usePosts } from "../../context/PostsContext";
import { mediaService } from "../../services/media.service";
import { useCommunities } from "../../context/CommunityContext";
import type { Post } from "../../types";
import { MentionInput } from "react-native-controlled-mentions";

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

const HASHTAG_TRIGGER_CONFIG = {
  '#': {
    trigger: '#',
    textStyle: { color: colors.primaryLight, fontWeight: '700' as const },
  }
};

export default function CreatePostModal({
  visible,
  onClose,
  preselectedCommunityId,
}: Props) {
  const { user: CURRENT_USER } = useAuth();
  const insets = useSafeAreaInsets();
  const { addPost, posts } = usePosts();
  const { communities } = useCommunities();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postType, setPostType] = useState<"feed" | "community">(
    preselectedCommunityId ? "community" : "feed",
  );
  const [selectedComId, setSelComId] = useState<string | null>(
    preselectedCommunityId ?? null,
  );
  const [showPicker, setShowPicker] = useState(false);
  const [showHashtagInput, setShowHashtagInput] = useState(false);

  // ── Hashtags & Mentions ─────────────────────────────────────────
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [activeInput, setActiveInput] = useState<"title" | "content" | "hashtag" | null>(null);

  // Triggers state from react-native-controlled-mentions
  const [titleTriggers, setTitleTriggers] = useState<any>();
  const [contentTriggers, setContentTriggers] = useState<any>();

  // Media state
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [audioItem, setAudioItem] = useState<MediaItem | null>(null);
  const [pickLoading, setPickLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // GIF state
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);

  // Audio preview state
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  React.useEffect(() => {
    let currentSound: Audio.Sound | null = null;
    const loadAudio = async () => {
      if (audioItem && visible) {
        try {
          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: audioItem.uri },
            { shouldPlay: true, isLooping: true },
          );
          setSound(newSound);
          currentSound = newSound;
        } catch (e) {
          console.warn("Failed to load audio preview", e);
        }
      }
    };
    loadAudio();

    return () => {
      if (currentSound) {
        currentSound.unloadAsync();
      }
    };
  }, [audioItem, visible]);

  const joinedCommunities = communities.filter((c) => c.isJoined);
  const selectedComm = joinedCommunities.find((c) => c.id === selectedComId);
  const canPost = title.trim().length > 0;

  // ── Media picker ────────────────────────────────────────────────
  const pickMedia = async (kind: "gallery" | "audio") => {
    setPickLoading(true);
    try {
      if (kind === "audio") {
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
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission needed",
            "Allow access to your media library to upload photos and videos.",
          );
          setPickLoading(false);
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
          allowsEditing: false,
          allowsMultipleSelection: true,
          quality: 0.85,
        });

        if (!result.canceled && result.assets.length > 0) {
          const newItems = result.assets.map((a) => ({
            uri: a.uri,
            type: a.type === "video" ? ("video" as const) : ("image" as const),
            name:
              a.fileName || (a.type === "video" ? "video.mp4" : "image.jpg"),
            mimeType:
              a.mimeType || (a.type === "video" ? "video/mp4" : "image/jpeg"),
            size: a.fileSize || 1000000,
            width: a.width,
            height: a.height,
          }));
          setMediaItems((prev) => [...prev, ...newItems]);
        }
      }
    } catch {
      Alert.alert("Error", "Could not open media library. Try again.");
    }
    setPickLoading(false);
  };

  const removeMedia = (index: number) => {
    setMediaItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ── GIF helpers ─────────────────────────────────────────────────
  const fetchGifs = async (query: string = "") => {
    setGifLoading(true);
    try {
      const endpoint = query.trim()
        ? `search?q=${encodeURIComponent(query.trim())}&`
        : `trending?`;
      const res = await fetch(
        `https://api.klipy.co/v2/gifs/${endpoint}api_key=cVApYlZX4zBljHaSpnIstsHmTWPNThPuYmuJ167v0ETv7askko61kZKD2r2ytJ2X`,
      );
      const json = await res.json();
      setGifs(json.data || []);
    } catch (e) {
      console.warn("Failed to fetch GIFs", e);
    }
    setGifLoading(false);
  };

  React.useEffect(() => {
    if (showGifPicker && gifs.length === 0) {
      fetchGifs();
    }
  }, [showGifPicker]);

  const selectGif = (gif: any) => {
    const uri = gif.images.original.url;
    setMediaItems((prev) => [
      ...prev,
      {
        uri,
        type: "image" as const,
        name: `gif-${gif.id}.gif`,
        mimeType: "image/gif",
        size: gif.images.original.size || 500000,
        width: parseInt(gif.images.original.width, 10) || 500,
        height: parseInt(gif.images.original.height, 10) || 500,
      },
    ]);
    setShowGifPicker(false);
  };

  // ── Hashtag helpers ─────────────────────────────────────────────
  const globalTags = React.useMemo(() => {
    const tags = new Set<string>();
    posts.forEach((p) => {
      if (p.hashtags && Array.isArray(p.hashtags)) {
        p.hashtags.forEach((t: string) => tags.add(t.toLowerCase()));
      }
    });

    if (tags.size === 0) {
      [
        "trending",
        "photography",
        "design",
        "art",
        "music",
        "fashion",
        "nature",
        "travel",
        "fitness",
        "food",
        "tech",
        "coding",
      ].forEach((t) => tags.add(t));
    }

    return Array.from(tags);
  }, [posts]);

  // Pill Suggestions
  const suggestedTags = React.useMemo(() => {
    if (activeInput !== "hashtag" || !hashtagInput) return [];
    const query = hashtagInput.trim().replace(/^#/, "").toLowerCase();
    return globalTags
      .map((t) => t.replace(/^#/, ""))
      .filter((t) => t.includes(query) && t !== query)
      .slice(0, 15);
  }, [globalTags, hashtagInput, activeInput]);

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
                <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: "bold" }}>#</Text>
              </View>
              <Text numberOfLines={1} style={{ color: colors.text.primary, fontSize: fontSizes.xs, fontWeight: "500", flex: 1 }}>
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderV3Suggestions = () => {
    let keyword: string | undefined;
    let onSelect: ((suggestion: any) => void) | undefined;
    
    if (activeInput === 'title' && titleTriggers && titleTriggers['#']) {
       keyword = titleTriggers['#'].keyword;
       onSelect = titleTriggers['#'].onSelect;
    } else if (activeInput === 'content' && contentTriggers && contentTriggers['#']) {
       keyword = contentTriggers['#'].keyword;
       onSelect = contentTriggers['#'].onSelect;
    }

    if (keyword == null || !onSelect) return null;

    const query = keyword.toLowerCase();
    const suggestedTags = Array.from(globalTags).filter((tag) =>
      tag.toLowerCase().includes(query),
    );

    if (suggestedTags.length === 0) return null;

    return (
      <View
        style={{
          backgroundColor: colors.bg.elevated,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: colors.border,
          maxHeight: 120,
          marginTop: spacing.xs,
          width: 160,
        }}
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          {suggestedTags.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={{ padding: spacing.sm, flexDirection: "row", alignItems: "center" }}
              onPress={() => onSelect!({ id: tag, name: tag })}
            >
              <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: "bold", marginRight: 4 }}>#</Text>
              <Text numberOfLines={1} style={{ color: colors.text.primary, fontSize: fontSizes.xs, fontWeight: "500", flex: 1 }}>
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const extractTags = (text: string) => {
    const matches = text.match(/#[\w]+/g);
    return matches ? matches.map((t) => t.toLowerCase()) : [];
  };

  const autoHashtags = Array.from(
    new Set([...extractTags(title), ...extractTags(content)]),
  );

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
  const resetAndClose = () => {
    setTitle("");
    setContent("");
    setHashtags([]);
    setHashtagInput("");
    setMediaItems([]);
    setAudioItem(null);
    setGifQuery("");
    setShowGifPicker(false);
    setShowHashtagInput(false);
    setPostType(preselectedCommunityId ? "community" : "feed");
    setSelComId(preselectedCommunityId ?? null);
    setShowPicker(false);
    onClose();
  };

  const renderMentionSuggestions = (
    keyword: string | undefined,
    onSuggestionPress: (suggestion: { id: string; name: string }) => void
  ) => {
    if (keyword == null) return null;
    const query = keyword.toLowerCase();
    const suggestions = globalTags
      .map((t) => t.replace(/^#/, ""))
      .filter((t) => t.includes(query) && t !== query)
      .slice(0, 15);

    if (suggestions.length === 0) return null;

    return (
      <View
        style={{
          backgroundColor: colors.bg.elevated,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: colors.border,
          maxHeight: 120,
          marginTop: 4,
          zIndex: 1000,
          elevation: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 10,
        }}
      >
        <ScrollView keyboardShouldPersistTaps="always">
          {suggestions.map((tag, index) => (
            <TouchableOpacity
              key={tag}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderBottomWidth: index === suggestions.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
              onPress={() => onSuggestionPress({ id: `#${tag}`, name: tag })}
            >
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.bg.surface, justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
                <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: 'bold' }}>#</Text>
              </View>
              <Text numberOfLines={1} style={{ color: colors.text.primary, fontSize: fontSizes.sm, fontWeight: '500', flex: 1 }}>
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const handlePost = async () => {
    setUploading(true);
    try {
      const uploadedMedia = [];
      const allMedia = [...mediaItems];
      if (audioItem) allMedia.push(audioItem);

      // Upload all selected media files
      for (const item of allMedia) {
        if (item.type === "video") {
          const res = await mediaService.getVideoUploadUrl(
            item.size || 10000000,
            item.name || "video.mp4",
          );
          await mediaService.uploadFileDirect(
            res.data.uploadLink!,
            item.uri,
            item.mimeType || "video/mp4",
          );
          uploadedMedia.push({ id: res.data.mediaId, type: "video" });
        } else {
          // image or audio
          const folder = "posts";
          const res = await mediaService.getSignedUrl(
            folder,
            item.size || 1000000,
            item.mimeType || "image/jpeg",
          );
          await mediaService.uploadFileDirect(
            res.data.signedUrl!,
            item.uri,
            item.mimeType || "image/jpeg",
          );
          await mediaService.confirmUpload(res.data.mediaId, res.data.s3Key!);
          uploadedMedia.push({ id: res.data.mediaId, type: item.type });
        }
      }

      const postPayload = {
        title: title.trim(),
        content: content.trim(),
        communityId: postType === "community" ? selectedComId : undefined,
        tags: Array.from(new Set([...autoHashtags, ...hashtags])),
        visibility: postType === "community" ? "community_only" : "public",
        status: "published",
        media: uploadedMedia,
      };

      await addPost(postPayload);
      resetAndClose();
    } catch (err) {
      Alert.alert("Error", "Failed to upload media or create post. Try again.");
      console.error(err);
    }
    setUploading(false);
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top || 16 }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Post</Text>
          <TouchableOpacity
            onPress={handlePost}
            disabled={!canPost || uploading}
          >
            <LinearGradient
              colors={
                canPost && !uploading
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
                  (!canPost || uploading) && styles.postBtnTextDisabled,
                ]}
              >
                {uploading ? "Posting..." : "Post"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
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
              <Text style={styles.avatarText}>
                {CURRENT_USER?.avatarUrl ? null : "👾"}
              </Text>
            </View>
            <View style={styles.userMeta}>
              <Text style={styles.userName}>
                {CURRENT_USER?.name || "Taddle User"}
              </Text>
              <View style={styles.postTypeRow}>
                <TouchableOpacity
                  style={[
                    styles.typePill,
                    postType === "feed" && styles.typePillActive,
                  ]}
                  onPress={() => {
                    setPostType("feed");
                    setSelComId(null);
                  }}
                >
                  <Ionicons
                    name="globe-outline"
                    size={11}
                    color={
                      postType === "feed"
                        ? colors.primaryLight
                        : colors.text.muted
                    }
                  />
                  <Text
                    style={[
                      styles.typePillText,
                      postType === "feed" && styles.typePillTextActive,
                    ]}
                  >
                    Feed
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typePill,
                    postType === "community" && styles.typePillActive,
                  ]}
                  onPress={() => {
                    setPostType("community");
                    setShowPicker(true);
                  }}
                >
                  <Ionicons
                    name="people-outline"
                    size={11}
                    color={
                      postType === "community"
                        ? colors.primaryLight
                        : colors.text.muted
                    }
                  />
                  <Text
                    style={[
                      styles.typePillText,
                      postType === "community" && styles.typePillTextActive,
                    ]}
                  >
                    {selectedComm ? selectedComm.name : "Community"}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={11}
                    color={
                      postType === "community"
                        ? colors.primaryLight
                        : colors.text.muted
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Content ── */}
          <View
            style={{
              position: "relative",
              zIndex: activeInput === "title" ? 100 : 1,
              elevation: activeInput === "title" ? 100 : 1,
            }}
          >
            <MentionInput
              style={[
                styles.contentInput,
                { minHeight: 40, fontWeight: "700", fontSize: fontSizes.lg },
              ]}
              placeholder="An interesting title..."
              placeholderTextColor={colors.text.muted}
              value={title}
              onChange={setTitle}
              onFocus={() => setActiveInput("title")}
              triggersConfig={HASHTAG_TRIGGER_CONFIG}
              onTriggersChange={setTitleTriggers}
              maxLength={300}
              autoFocus
            />
            {activeInput === 'title' && renderV3Suggestions()}
          </View>
          <View
            style={{
              position: "relative",
              zIndex: activeInput === "content" ? 100 : 1,
              elevation: activeInput === "content" ? 100 : 1,
            }}
          >
            <MentionInput
              style={styles.contentInput}
              placeholder="What's on your mind? Share your thoughts..."
              placeholderTextColor={colors.text.muted}
              multiline
              value={content}
              onChange={setContent}
              onFocus={() => setActiveInput("content")}
              triggersConfig={HASHTAG_TRIGGER_CONFIG}
              onTriggersChange={setContentTriggers}
              maxLength={500}
              textAlignVertical="top"
            />
            {activeInput === 'content' && renderV3Suggestions()}
          </View>
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
                        <Video
                          source={{ uri: item.uri }}
                          style={{ width: previewW, height: previewH }}
                          resizeMode={ResizeMode.CONTAIN}
                          shouldPlay
                          isLooping
                          isMuted={!!audioItem}
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
            </View>
          )}

          {/* Action Toolbar */}
          <View style={styles.toolbar}>
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
              {mediaItems.length > 0 && (
                <View style={styles.toolbarCountBadge}>
                  <Text style={styles.toolbarBadgeText}>
                    {mediaItems.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowGifPicker(true)}
              style={styles.toolbarBtn}
              disabled={pickLoading}
            >
              <Ionicons
                name="film-outline"
                size={24}
                color={colors.primaryLight}
              />
              <View style={styles.toolbarBadge}>
                <Ionicons name="add" size={10} color="#fff" />
              </View>
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

            {/* Hashtag Toggle */}
            <TouchableOpacity
              onPress={() => setShowHashtagInput(!showHashtagInput)}
              style={[styles.toolbarBtn, { marginLeft: "auto" }]}
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
          </View>

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

          {/* ── Community picker ── */}
          {showPicker && (
            <View style={styles.communitySheet}>
              <View style={styles.communitySheetHeader}>
                <Text style={styles.communitySheetTitle}>
                  Post to Community
                </Text>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Ionicons
                    name="close"
                    size={20}
                    color={colors.text.secondary}
                  />
                </TouchableOpacity>
              </View>

              {joinedCommunities.length === 0 ? (
                <View style={styles.emptyComm}>
                  <Text style={styles.emptyCommText}>
                    You haven't joined any communities yet.
                  </Text>
                </View>
              ) : (
                joinedCommunities.map((comm) => {
                  const active = selectedComId === comm.id;
                  return (
                    <TouchableOpacity
                      key={comm.id}
                      style={[
                        styles.communityOption,
                        active && styles.communityOptionActive,
                      ]}
                      onPress={() => {
                        setSelComId(comm.id);
                        setShowPicker(false);
                      }}
                    >
                      <Text style={styles.communityAvatar}>{comm.avatar}</Text>
                      <View style={styles.communityInfo}>
                        <Text style={styles.communityName}>{comm.name}</Text>
                        <Text style={styles.communityMeta}>
                          {comm.members.toLocaleString()} members ·{" "}
                          {comm.category}
                        </Text>
                      </View>
                      {active && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={colors.primaryLight}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
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
                      source={{ uri: g.images.fixed_height_small.url }}
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

const styles = StyleSheet.create({
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

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 40 },

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
  },
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

  // Content
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
});
