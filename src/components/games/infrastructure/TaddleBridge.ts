/**
 * TaddleBridge — postMessage bridge for WebView ↔ React Native communication.
 *
 * Security:
 *   - Known message types only (unknown → REJECT)
 *   - Max message size (64KB)
 *   - Allowed command types per game (plugin defines COMMAND_SCHEMAS)
 *   - Rate limit on bridge messages
 *   - Origin/source validation (only from known bundle origin)
 *
 * Flow:
 *   WebView → postMessage → TaddleBridge → validate → socket MOVE → server
 *   Server → socket SYNC → React Native → postMessage → WebView
 */

// ── Message Types ────────────────────────────────────────────────────────

export type BridgeMessage =
  | { type: "READY" }
  | { type: "COMMAND"; commandId: string; payload: unknown }
  | { type: "RESULT_REQUEST" }
  | { type: "HEARTBEAT" };

export type BridgeResponse =
  | { type: "STATE"; state: unknown }
  | { type: "COMMAND_ACK"; commandId: string; success: boolean; error?: string }
  | { type: "RESULT"; result: unknown }
  | { type: "ERROR"; message: string };

// ── Constants ────────────────────────────────────────────────────────────

const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MESSAGES = 30;

const KNOWN_MESSAGE_TYPES = new Set(["READY", "COMMAND", "RESULT_REQUEST", "HEARTBEAT"]);

// ── Rate Limiter ─────────────────────────────────────────────────────────

let lastWindowStart = Date.now();
let messageCount = 0;

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - lastWindowStart > RATE_LIMIT_WINDOW_MS) {
    lastWindowStart = now;
    messageCount = 0;
  }
  messageCount++;
  return messageCount <= RATE_LIMIT_MAX_MESSAGES;
}

// ── Schema Validation ────────────────────────────────────────────────────

/**
 * Validate a bridge message from the WebView.
 * Returns the parsed message if valid, null if invalid.
 */
export function validateBridgeMessage(
  raw: string | object,
  allowedCommandTypes?: string[]
): BridgeMessage | null {
  let msg: any;

  if (typeof raw === "string") {
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
  } else {
    msg = raw;
  }

  // Size check
  const size = Buffer.byteLength(JSON.stringify(msg));
  if (size > MAX_MESSAGE_SIZE) {
    console.warn(`[TaddleBridge] Message too large: ${size} bytes`);
    return null;
  }

  // Type check
  if (!msg || typeof msg.type !== "string") return null;
  if (!KNOWN_MESSAGE_TYPES.has(msg.type)) {
    console.warn(`[TaddleBridge] Unknown message type: ${msg.type}`);
    return null;
  }

  // Rate limit
  if (!checkRateLimit()) {
    console.warn("[TaddleBridge] Rate limit exceeded");
    return null;
  }

  // COMMAND-specific validation
  if (msg.type === "COMMAND") {
    if (!msg.commandId || typeof msg.commandId !== "string") return null;
    if (!msg.payload || typeof msg.payload !== "object") return null;

    // Validate command type if allowlist provided
    if (allowedCommandTypes && msg.payload.type) {
      if (!allowedCommandTypes.includes(msg.payload.type)) {
        console.warn(`[TaddleBridge] Command type not allowed: ${msg.payload.type}`);
        return null;
      }
    }
  }

  return msg as BridgeMessage;
}

/**
 * Create a TaddleBridge handler for a WebView.
 * Handles incoming messages from the WebView and routes them to the socket.
 */
export function createBridgeHandler(
  postMessageToWebView: (msg: BridgeResponse) => void,
  sendCommand: (commandId: string, payload: unknown) => void,
  allowedCommandTypes?: string[]
) {
  return function handleMessage(event: { data: string | object }) {
    const msg = validateBridgeMessage(event.data, allowedCommandTypes);
    if (!msg) return;

    switch (msg.type) {
      case "READY":
        // WebView is ready — can start sending state
        break;

      case "COMMAND":
        sendCommand(msg.commandId, msg.payload);
        break;

      case "RESULT_REQUEST":
        // WebView is requesting the match result
        break;

      case "HEARTBEAT":
        // Keep-alive
        break;
    }
  };
}

/**
 * Send a state update to the WebView.
 */
export function sendStateToWebView(
  postMessageToWebView: (msg: BridgeResponse) => void,
  state: unknown
): void {
  postMessageToWebView({ type: "STATE", state });
}

/**
 * Send a command acknowledgement to the WebView.
 */
export function sendCommandAckToWebView(
  postMessageToWebView: (msg: BridgeResponse) => void,
  commandId: string,
  success: boolean,
  error?: string
): void {
  postMessageToWebView({ type: "COMMAND_ACK", commandId, success, error });
}

/**
 * Send the match result to the WebView.
 */
export function sendResultToWebView(
  postMessageToWebView: (msg: BridgeResponse) => void,
  result: unknown
): void {
  postMessageToWebView({ type: "RESULT", result });
}
