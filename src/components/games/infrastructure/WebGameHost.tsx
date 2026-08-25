/**
 * WebGameHost — renders an HTML5 game bundle inside a WebView.
 *
 * Used for runtimeType = 'web' games. The game is an HTML5/Canvas/WebGL
 * bundle hosted on S3/CDN, loaded inside a React Native WebView.
 *
 * Communication:
 *   WebView → postMessage → TaddleBridge → validate → socket MOVE → server
 *   Server → socket SYNC → React Native → postMessage → WebView
 *
 * Security (TaddleBridge):
 *   - Known message types only
 *   - Max message size (64KB)
 *   - Rate limiting on bridge messages
 *   - Allowed command types per game
 */

import React, { useRef, useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Text } from "react-native";
import { WebView } from "react-native-webview";
import {
  createBridgeHandler,
  sendStateToWebView,
  sendResultToWebView,
  type BridgeResponse,
} from "./TaddleBridge";
import type { HtmlGameResult } from "../../../games/types";

// ── Props ─────────────────────────────────────────────────────────────────
interface WebGameHostProps {
  /** URL of the hosted HTML5 game bundle */
  bundleUrl: string;
  /** Integrity hash for the bundle */
  bundleHash?: string;
  /** Game config from backend */
  gameConfig?: Record<string, any>;
  /** Props forwarded from GameHost (matchId, userId, wsToken, players, etc.) */
  gameProps: Record<string, any>;
}

/**
 * WebGameHost — loads an HTML5 game bundle in a WebView and bridges
 * communication between the WebView and the React Native socket layer.
 */
export default function WebGameHost({
  bundleUrl,
  bundleHash,
  gameConfig,
  gameProps,
}: WebGameHostProps) {
  const webViewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  // Send state updates to the WebView
  const postToWebView = useCallback((msg: BridgeResponse) => {
    webViewRef.current?.postMessage(JSON.stringify(msg));
  }, []);

  // Handle commands from the WebView → forward to socket
  const handleCommand = useCallback(
    (commandId: string, payload: unknown) => {
      // TODO: forward to game socket as MOVE event
      // gameProps.socket?.emit("MOVE", payload);
      console.log("[WebGameHost] Command from WebView:", commandId, payload);
    },
    [gameProps],
  );

  // Create the bridge handler
  const handleBridgeMessage = useRef(
    createBridgeHandler(postToWebView, handleCommand),
  ).current;

  // Forward state updates to the WebView when gameProps change
  useEffect(() => {
    if (ready && gameProps) {
      sendStateToWebView(postToWebView, gameProps);
    }
  }, [ready, gameProps, postToWebView]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: bundleUrl }}
        style={styles.webview}
        originWhitelist={["*"]}
        onMessage={(event) => {
          handleBridgeMessage({ data: event.nativeEvent.data });
        }}
        onLoad={() => setReady(true)}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
      />
      {!ready && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingText}>Loading game…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  loadingText: { color: "#fff", fontSize: 16 },
});
