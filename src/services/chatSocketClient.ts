/**
 * chatSocketClient.ts
 *
 * Chat-level WebSocket connection for /chat-socket namespace.
 * Authenticates by JWT. Connected only when the chat screen is open,
 * disconnected when the user navigates away.
 *
 * Handles: real-time messages, reactions, typing indicators.
 */

import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { log, warn, error as logError } from '../utils/logger';

// ── URL resolution ────────────────────────────────────────────────────────
const debuggerHost = Constants.expoConfig?.hostUri;
const localhost = debuggerHost?.split(":")[0];
const fallbackIp = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const currentIp = localhost || fallbackIp;

const SOCKET_URL = process.env.EXPO_PUBLIC_BACKEND_URL
  ? process.env.EXPO_PUBLIC_BACKEND_URL.replace(/\/+$/, "")
  : __DEV__
    ? `http://${currentIp}:1999`
    : "https://taddlebox.com";

type AnyListener = (...args: any[]) => void;

// ── Simple event emitter ────────────────────────────────────────────────
class ChatEventEmitter {
  private listeners: Record<string, AnyListener[]> = {};

  on(event: string, listener: AnyListener): void {
    const bucket = this.listeners[event] || [];
    bucket.push(listener);
    this.listeners[event] = bucket;
  }

  off(event: string, listener: AnyListener): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(
      (l) => l !== listener,
    );
  }

  emit(event: string, ...args: any[]): void {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach((listener) => listener(...args));
  }
}

// ── Chat Socket Client ──────────────────────────────────────────────────

class ChatSocketClient {
  public socket: Socket | null = null;
  public events = new ChatEventEmitter();
  private isConnecting = false;
  private _conversationId: string | null = null;

  async connect(conversationId?: string) {
    if (this.socket?.connected || this.isConnecting) return;
    this.isConnecting = true;
    this._conversationId = conversationId || null;

    try {
      const token = await SecureStore.getItemAsync("accessToken");
      if (!token) {
        this.isConnecting = false;
        return;
      }

      this.socket = io(`${SOCKET_URL}/chat-socket`, {
        auth: { token },
        transports: ["websocket"],
        extraHeaders: {
          "ngrok-skip-browser-warning": "true",
        },
      });

      this.socket.on("connect", () => {
        this.isConnecting = false;
        log("[chatSocket] Connected:", this.socket?.id);
        // Join conversation room if provided
        if (this._conversationId) {
          this.socket?.emit("chat:join", { conversationId: this._conversationId });
        }
      });

      this.socket.on("disconnect", (reason) => {
        this.isConnecting = false;
        log("[chatSocket] Disconnected:", reason);
      });

      this.socket.on("connect_error", (err) => {
        this.isConnecting = false;
        logError("[chatSocket] Connection error:", err.message);
      });

      this.socket.on("chat:message", (data: any) =>
        this.events.emit("chat:message", data),
      );
      this.socket.on("chat:reaction", (data: any) =>
        this.events.emit("chat:reaction", data),
      );
      this.socket.on("chat:typing", (data: any) =>
        this.events.emit("chat:typing", data),
      );
    } catch (err) {
      this.isConnecting = false;
      logError("[chatSocket] Failed to connect:", err);
    }
  }

  disconnect() {
    this.isConnecting = false;
    this._conversationId = null;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const chatSocketClient = new ChatSocketClient();
