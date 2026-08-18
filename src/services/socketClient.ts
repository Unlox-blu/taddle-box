import { io, Socket } from "socket.io-client";
import * as SecureStore from "expo-secure-store";
import { Platform, DeviceEventEmitter } from "react-native";
import Constants from "expo-constants";
import type {
  XPUpdatedPayload,
  WalletUpdatedPayload,
  LeaderboardsChangedPayload,
  ActiveStatusChangedPayload,
  ActiveStatusSnapshotPayload,
  NotificationNewPayload,
  FollowRequestCancelledPayload,
  FollowRequestResolvedPayload,
  FollowStateChangedPayload,
  SessionExpiredPayload,
  MatchmakingEventPayload,
  SocketEventMap,
} from "../types";

const debuggerHost = Constants.expoConfig?.hostUri;
const localhost = debuggerHost?.split(":")[0];
const fallbackIp = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const currentIp = localhost || fallbackIp;

// Same policy as apiClient: dev builds talk to the Metro host; production
// builds must carry EXPO_PUBLIC_BACKEND_URL, otherwise fall back to the
// production domain instead of a device-unreachable emulator address.
const SOCKET_URL = process.env.EXPO_PUBLIC_BACKEND_URL
  ? process.env.EXPO_PUBLIC_BACKEND_URL
  : __DEV__
    ? `http://${currentIp}:1999`
    : (() => {
        console.warn(
          "[socketClient] EXPO_PUBLIC_BACKEND_URL is not set in this production build — sockets will connect to https://taddlebox.com. Set it in eas.json before publishing.",
        );
        return "https://taddlebox.com";
      })();

type AnyListener = (...args: any[]) => void;

// Typed event registry: `Events` maps each event name to its listener
// signature, so `.on/.off/.emit` are checked per event and payloads are
// inferred at every call site (fed by SocketEventMap from ../types).
class SimpleEventEmitter<Events extends Record<string, AnyListener>> {
  private listeners: { [K in keyof Events]?: Events[K][] } = {};

  on<K extends keyof Events>(event: K, listener: Events[K]): void {
    const bucket = (this.listeners[event] || []) as Events[K][];
    bucket.push(listener);
    this.listeners[event] = bucket;
  }

  off<K extends keyof Events>(event: K, listener: Events[K]): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = (this.listeners[event] as Events[K][]).filter(
      (l) => l !== listener,
    );
  }

  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    if (!this.listeners[event]) return;
    (this.listeners[event] as Events[K][]).forEach((listener) =>
      listener(...args),
    );
  }
}

class SocketService {
  public socket: Socket | null = null;
  public events = new SimpleEventEmitter<SocketEventMap>();
  private isConnecting = false;
  private heartbeatTimer: any = null;

  async connect() {
    if (this.socket?.connected || this.isConnecting) return;
    this.isConnecting = true;

    try {
      const token = await SecureStore.getItemAsync("accessToken");
      if (!token) return;

      this.socket = io(SOCKET_URL, {
        auth: { token },
        extraHeaders: {
          "ngrok-skip-browser-warning": "true",
        },
      });

      this.socket.on("connect", () => {
        this.isConnecting = false;
        console.log("WebSocket Connected:", this.socket?.id);
        // Keep the server-side active-status key alive (30s TTL, beat every 20s).
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
          this.socket?.emit("heartbeat");
        }, 20000);
      });

      this.socket.on("disconnect", () => {
        console.log("WebSocket Disconnected");
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
      });

      this.socket.on("xp:updated", (data: XPUpdatedPayload) =>
        this.events.emit("xp:updated", data),
      );
      this.socket.on("wallet:updated", (data: WalletUpdatedPayload) =>
        this.events.emit("wallet:updated", data),
      );
      this.socket.on(
        "leaderboards:changed",
        (data: LeaderboardsChangedPayload) =>
          this.events.emit("leaderboards:changed", data),
      );
      this.socket.on("matchmaking:matched", (data: MatchmakingEventPayload) =>
        this.events.emit("matchmaking:matched", data),
      );
      this.socket.on(
        "matchmaking:lobbyUpdated",
        (data: MatchmakingEventPayload) =>
          this.events.emit("matchmaking:lobbyUpdated", data),
      );
      this.socket.on("matchmaking:timedOut", (data: MatchmakingEventPayload) =>
        this.events.emit("matchmaking:timedOut", data),
      );
      this.socket.on("notification:new", (data: NotificationNewPayload) =>
        this.events.emit("notification:new", data),
      );
      this.socket.on(
        "follow:requestCancelled",
        (data: FollowRequestCancelledPayload) =>
          this.events.emit("follow:requestCancelled", data),
      );
      this.socket.on(
        "follow:requestResolved",
        (data: FollowRequestResolvedPayload) =>
          this.events.emit("follow:requestResolved", data),
      );
      this.socket.on("follow:stateChanged", (data: FollowStateChangedPayload) =>
        this.events.emit("follow:stateChanged", data),
      );
      this.socket.on(
        "activeStatus:changed",
        (data: ActiveStatusChangedPayload) =>
          this.events.emit("activeStatus:changed", data),
      );
      this.socket.on(
        "activeStatus:snapshot",
        (data: ActiveStatusSnapshotPayload) =>
          this.events.emit("activeStatus:snapshot", data),
      );
      this.socket.on("SESSION_EXPIRED", (data: SessionExpiredPayload) =>
        this.events.emit("SESSION_EXPIRED", data),
      );

      this.socket.on("connect_error", (error) => {
        this.isConnecting = false;
        console.error("WebSocket Connection Error:", error);
      });
    } catch (error) {
      console.error("Error connecting to socket:", error);
    }
  }

  disconnect() {
    this.isConnecting = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketClient = new SocketService();

export const createGameEngineSocket = (
  matchId: string,
  userId: string,
  token: string,
) => {
  const s = io(`${SOCKET_URL}/game-engine`, {
    auth: { matchId, userId, token },
    extraHeaders: { "ngrok-skip-browser-warning": "true" },
    transports: ["websocket", "polling"],
  });

  s.on("CONNECT_ACK", (data: any) => {
    // Rejoining an already-ACTIVE match → skip the countdown and go straight to
    // the live game (the game component syncs itself from the state snapshot).
    if (data?.state?.status === "ACTIVE") {
      DeviceEventEmitter.emit("GAME_ENGINE_ACTIVE", { matchId, data });
    } else if (data?.state?.status === "PAUSED" && data.reconnectWindowMs > 0) {
      // Returning to a paused match → show the offline/waiting overlay.
      DeviceEventEmitter.emit("GAME_ENGINE_PAUSE", {
        matchId,
        data: { reconnectWindowMs: data.reconnectWindowMs },
      });
    }
    DeviceEventEmitter.emit("GAME_ENGINE_CONNECT", { matchId, data });
  });

  s.on("PAUSE", (data: any) => {
    DeviceEventEmitter.emit("GAME_ENGINE_PAUSE", { matchId, data });
  });

  // The match actually started (all real players readied) → countdown then play.
  s.on("START", (data: any) => {
    DeviceEventEmitter.emit("GAME_ENGINE_START", { matchId, data });
  });

  // A paused match resumed → clear the offline overlay.
  s.on("RESUME", (data: any) => {
    DeviceEventEmitter.emit("GAME_ENGINE_RESUME", { matchId, data });
  });

  s.on("STATE", (data: any) => {
    DeviceEventEmitter.emit("GAME_ENGINE_STATE", { matchId, data });
  });

  s.on("GAME_OVER", (data: any) => {
    DeviceEventEmitter.emit("GAME_ENGINE_OVER", { matchId, data });
  });

  return s;
};
