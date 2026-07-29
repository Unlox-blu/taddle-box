# Bundled HTML5 Games

Games are bundled in the Expo app as HTML strings and executed inside `react-native-webview`.

To add a game:

1. Add a `HtmlGameDefinition` entry to `htmlGames.ts`.
2. Provide metadata used by the native Games tab.
3. Implement `buildHtml(config)` and send messages with `window.ReactNativeWebView.postMessage`.

Supported messages:

```json
{ "type": "GAME_SCORE", "score": 12 }
{ "type": "GAME_COMPLETE", "score": 1200, "won": true, "xpEarned": 30, "durationSeconds": 42 }
```

Keep bundled games self-contained: no remote scripts, no external assets, and no network calls from game HTML.
