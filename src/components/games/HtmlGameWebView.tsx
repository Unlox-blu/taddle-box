import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import type { HtmlGameDefinition, HtmlGameMessage, HtmlGameResult } from '../../games/types';

type Props = {
  game: HtmlGameDefinition;
  sessionId: string;
  mode: string;
  onScore: (score: number) => void;
  onComplete: (result: HtmlGameResult) => void;
};

export default function HtmlGameWebView({
  game,
  sessionId,
  mode,
  onScore,
  onComplete,
}: Props) {
  const html = useMemo(
    () => game.buildHtml({ gameId: game.id, sessionId, mode, maxXp: game.maxXp }),
    [game, mode, sessionId],
  );

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as HtmlGameMessage;
      if (message.type === 'GAME_SCORE') {
        onScore(message.score);
      }
      if (message.type === 'GAME_COMPLETE') {
        onComplete({
          score: message.score,
          won: message.won,
          xpEarned: message.xpEarned,
          durationSeconds: message.durationSeconds,
        });
      }
    } catch (error) {
      console.warn('Invalid game message', error);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://local.taddlebox.game/' }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        mixedContentMode="never"
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05050F' },
  webView: { flex: 1, backgroundColor: '#05050F' },
});
