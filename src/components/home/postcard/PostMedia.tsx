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
import { FeedVideo, FeedAudio, ActiveVideo, VideoPoster } from "./shared";

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
}: PostMediaProps) {
  const [currentMediaPage, setCurrentMediaPage] = useState(0);
  const { toggleMediaSound, mediaSoundEnabled } = useAudio();
  // Local mute override: per-card mute state that inherits from global preference
  const [localMuted, setLocalMuted] = useState(!mediaSoundEnabled);
  // Sync with global pref when it changes
  useEffect(() => {
    setLocalMuted(!mediaSoundEnabled);
  }, [mediaSoundEnabled]);
  // Final mute state
  const isMuted = localMuted;

  const allMedia = (post as any).media || [];
  const hasMedia = allMedia.length > 0 || !!post.mediaUri || (post.type === "image" && !!post.image);

  if (allMedia.length === 0) {
    return post.mediaUri ? (
      <Image
        source={{ uri: post.mediaUri }}
        style={{ width: mediaW, height: previewH, backgroundColor: "#000" }}
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

  return (
    <View style={{ position: "relative" }}>
      {visualMedia.length > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={mediaW}
          decelerationRate="fast"
          onScroll={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            const page = Math.max(
              0,
              Math.min(visualMedia.length - 1, Math.round(x / mediaW)),
            );
            if (page !== currentMediaPage) setCurrentMediaPage(page);
          }}
          scrollEventThrottle={16}
        >
          {visualMedia.map((m: any, idx: number) => {
            const url = m.media_url || m.cloudfront_url || m.url || m.uri;
            const isVideo = m.media_type === "video" || m.type === "video";
            const isCurrentPage = idx === currentMediaPage;
            const shouldPlay = isCurrentPage && isActive;
            // Preload: mount first video as ActiveVideo with preloadOnly=true
            // (buffers but doesn't play). Only for the next post in feed.
            const shouldPreload = preloadVideo && idx === 0 && isVideo && !isActive;

            if (isVideo) {
              return (
                <TouchableWithoutFeedback key={idx} onPress={onBodyTap}>
                  <View
                    style={{ width: mediaW, height: previewH, backgroundColor: "#000" }}
                  >
                    {shouldPlay ? (
                      <ActiveVideo
                        url={url}
                        width={mediaW}
                        height={previewH}
                        muted={isMuted || hasAudioTrack}
                        loop
                        onDuration={onVideoDuration}
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
                      <VideoPoster url={url} previewUrl={m.preview_url} width={mediaW} height={previewH} />
                    )}
                  </View>
                </TouchableWithoutFeedback>
              );
            }
            return url ? (
              <TouchableWithoutFeedback key={idx} onPress={onBodyTap}>
                <Image
                  source={{ uri: url }}
                  style={{ width: mediaW, height: previewH, backgroundColor: "#000" }}
                  contentFit="contain"
                />
              </TouchableWithoutFeedback>
            ) : null;
          })}
        </ScrollView>
      )}

      {/* Pagination Dots */}
      {visualMedia.length > 1 && (
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

      {/* Invisible audio playback */}
      {/* Audio playback � only when active, uses expo-audio properly */}
      {audioMedia.length > 0 && isActive && (
        <View style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}>
          {audioMedia.map((m: any, idx: number) => {
            const url = m.media_url || m.cloudfront_url || m.url || m.uri;
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
        </View>
      )}

      {/* Mute Toggle Overlay — show only for active post with audio/video */}
      {isActive && (hasAudioTrack ||
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
            onPress={() => { setLocalMuted((prev) => !prev); toggleMediaSound(); }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isMuted ? "volume-mute" : "volume-high"}
              size={14}
              color="#fff"
            />
          </TouchableOpacity>
        )}
    </View>
  );
}

export default React.memo(PostMediaInner);
