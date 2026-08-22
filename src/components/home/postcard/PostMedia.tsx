import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableWithoutFeedback,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { useAudio } from "../../../context/AudioContext";
import { Ionicons } from "@expo/vector-icons";
import { radii, spacing, type ColorPalette } from "../../../theme";
import type { Post } from "../../../types";
import type { PostCardStyles } from "./shared";
import {
  FeedVideo,
  FeedAudio,
  ActiveVideo,
  VideoPoster,
  ZoomableMedia,
} from "./shared";

const SCREEN_W = Dimensions.get("window").width;

interface PostMediaProps {
  post: Post;
  mediaW: number;
  previewH: number;
  isActive: boolean;
  colors: ColorPalette;
  styles: PostCardStyles;
  onBodyTap: () => void;
  onVideoDuration?: (ms: number) => void;
  preloadVideo?: boolean;
  onPinchStateChange?: (isPinching: boolean) => void;
  isPinching?: boolean;
}

function PostMediaInner({
  post,
  mediaW,
  previewH,
  isActive,
  colors,
  styles: s,
  onBodyTap,
  onVideoDuration,
  preloadVideo,
  onPinchStateChange,
  isPinching = false,
}: PostMediaProps) {
  const [currentMediaPage, setCurrentMediaPage] = useState(0);
  const { toggleMediaSound, mediaSoundEnabled } = useAudio();
  // Local mute override: per-card mute state that inherits from global preference
  const [localMuted, setLocalMuted] = useState(!mediaSoundEnabled);
  // Long press tracking for simple pause/play override
  const [isLongPressing, setIsLongPressing] = useState(false);

  // Sync with global pref when it changes
  useEffect(() => {
    setLocalMuted(!mediaSoundEnabled);
  }, [mediaSoundEnabled]);
  // Final mute state
  const isMuted = localMuted;

  const allMedia = (post as any).media || [];
  const hasMedia =
    allMedia.length > 0 ||
    !!post.mediaUri ||
    (post.type === "image" && !!post.image);

  if (allMedia.length === 0) {
    return post.mediaUri ? (
      <Image
        source={{ uri: post.mediaUri }}
        style={{
          width: mediaW,
          height: previewH,
          backgroundColor: colors.bg.card,
        }}
        contentFit="contain"
      />
    ) : post.type === "image" && post.image ? (
      <View style={s.imageBanner}>
        <Text style={s.imageBannerEmoji}>{post.image}</Text>
        <View style={s.imageBannerLabel}>
          <Text style={s.imageBannerLabelText}>Media Post</Text>
        </View>
      </View>
    ) : null;
  }

  const visualMedia = allMedia.filter(
    (m: any) => m.media_type !== "audio" && m.type !== "audio",
  );
  const audioMedia = allMedia.filter(
    (m: any) => m.media_type === "audio" || m.type === "audio",
  );
  const hasAudioTrack = audioMedia.length > 0;
  // Check if current carousel item has audio
  const currentMedia = visualMedia[currentMediaPage] as any;
  const currentHasAudio = currentMedia?.has_audio ?? (hasAudioTrack );

  const renderMediaItem = (m: any, idx: number) => {
    const url = m.media_url;
    const isVideo = m.media_type === "video" || m.type === "video";
    const isCurrentPage = idx === currentMediaPage;
    const shouldPlay = isCurrentPage && isActive;
    // Preload: mount first video as ActiveVideo with preloadOnly=true
    // (buffers but doesn't play). Only for the next post in feed.
    const shouldPreload = preloadVideo && idx === 0 && isVideo && !isActive;

    if (isVideo) {
      return (
        <TouchableWithoutFeedback
          key={idx}
          onPress={onBodyTap}
          onLongPress={() => setIsLongPressing(true)}
          onPressOut={() => setIsLongPressing(false)}
          delayLongPress={200}
        >
          <View
            style={{
              width: mediaW,
              height: previewH,
              backgroundColor: colors.bg.card,
              overflow: "visible",
              opacity: isPinching && !isCurrentPage ? 0 : 1,
            }}
          >
            <ZoomableMedia
              width={mediaW}
              height={previewH}
              onPinchStateChange={onPinchStateChange}
            >
              {shouldPlay ? (
                <ActiveVideo
                  url={url}
                  width={mediaW}
                  height={previewH}
                  muted={isMuted || hasAudioTrack}
                  loop
                  onDuration={onVideoDuration}
                  isPausedOverride={isLongPressing}
                />
              ) : shouldPreload ? (
                <ActiveVideo
                  url={url}
                  width={mediaW}
                  height={previewH}
                  muted
                  loop
                  preloadOnly
                />
              ) : (
                <VideoPoster
                  url={url}
                  previewUrl={m.preview_url}
                  width={mediaW}
                  height={previewH}
                />
              )}
            </ZoomableMedia>
          </View>
        </TouchableWithoutFeedback>
      );
    }
    return url ? (
      <TouchableWithoutFeedback key={idx} onPress={onBodyTap}>
        <View
          style={{
            width: mediaW,
            height: previewH,
            backgroundColor: colors.bg.card,
            overflow: "visible",
            opacity: isPinching && !isCurrentPage ? 0 : 1,
          }}
        >
          <ZoomableMedia
            width={mediaW}
            height={previewH}
            onPinchStateChange={onPinchStateChange}
          >
            <Image
              source={{ uri: url }}
              style={{ width: mediaW, height: previewH }}
              contentFit="contain"
            />
          </ZoomableMedia>
        </View>
      </TouchableWithoutFeedback>
    ) : null;
  };

  return (
    <View
      style={{
        position: "relative",
        overflow: visualMedia.length === 0 || isPinching ? "visible" : "hidden",
        zIndex: 10,
      }}
    >
      {visualMedia.length === 1 ? (
        renderMediaItem(visualMedia[0], 0)
      ) : visualMedia.length > 1 ? (
        <ScrollView
          style={{ overflow: isPinching ? "visible" : "hidden" }}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={mediaW + 4}
          disableIntervalMomentum={true}
          decelerationRate="fast"
          contentContainerStyle={{ gap: 4 }}
          onScroll={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            const page = Math.max(
              0,
              Math.min(visualMedia.length - 1, Math.round(x / (mediaW + 4))),
            );
            if (page !== currentMediaPage) setCurrentMediaPage(page);
          }}
          scrollEventThrottle={16}
        >
          {visualMedia.map(renderMediaItem)}
        </ScrollView>
      ) : null}

      {/* Pagination Dots */}
      {visualMedia.length > 1 && !isPinching && (
        <View
          style={{
            position: "absolute",
            bottom: 12,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {visualMedia.map((_: any, i: number) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  i === currentMediaPage ? "#fff" : "rgba(255,255,255,0.5)",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.3,
                shadowRadius: 2,
                elevation: 2,
              }}
            />
          ))}
        </View>
      )}

      {/* Audio playback — renders nothing visible, just plays audio */}
      {audioMedia.length > 0 && isActive && (
        <>
          {audioMedia.map((m: any, idx: number) => {
            const url = m.media_url;
            return url ? (
              <FeedAudio
                key={`bg-audio-${idx}`}
                url={url}
                active={isActive}
                muted={isMuted}
                loop={false}
              />
            ) : null;
          })}
        </>
      )}

      {/* Mute Toggle Overlay — show only for active post with audio/video */}
      {isActive &&
        !isPinching &&
        (hasAudioTrack ||
          visualMedia.some(
            (m: any) => m.media_type === "video" || m.type === "video",
          )) && (
          <TouchableOpacity
            style={{
              position: "absolute",
              bottom: 10,
              right: 10,
              backgroundColor: "rgba(0,0,0,0.5)",
              borderRadius: 14,
              width: 28,
              height: 28,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
            onPress={() => {
              setLocalMuted((prev) => !prev);
              toggleMediaSound();
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={
                !currentHasAudio
                  ? "volume-off"
                  : isMuted
                    ? "volume-mute"
                    : "volume-high"
              }
              size={14}
              color={!currentHasAudio ? "rgba(255,255,255,0.5)" : "#fff"}
            />
          </TouchableOpacity>
        )}
    </View>
  );
}

export default React.memo(PostMediaInner);
