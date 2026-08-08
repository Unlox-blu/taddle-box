import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { Platform, DeviceEventEmitter } from 'react-native';
import Constants from 'expo-constants';

const debuggerHost = Constants.expoConfig?.hostUri;
const localhost = debuggerHost?.split(':')[0];
const fallbackIp = Platform.OS === "android" ? "10.0.2.2" : "localhost";
const currentIp = localhost || fallbackIp;

const SOCKET_URL = process.env.EXPO_PUBLIC_BACKEND_URL 
  ? process.env.EXPO_PUBLIC_BACKEND_URL 
  : `http://${currentIp}:8080`;

class SimpleEventEmitter {
  private listeners: { [event: string]: Function[] } = {};

  on(event: string, listener: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }

  off(event: string, listener: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(l => l !== listener);
  }

  emit(event: string, ...args: any[]) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(listener => listener(...args));
  }
}

class SocketService {
  public socket: Socket | null = null;
  public events = new SimpleEventEmitter();
  private isConnecting = false;
  private heartbeatTimer: any = null;

  async connect() {
    if (this.socket?.connected || this.isConnecting) return;
    this.isConnecting = true;

    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) return;

      this.socket = io(SOCKET_URL, {
        auth: { token },
        extraHeaders: {
          "ngrok-skip-browser-warning": "true"
        }
      });

      this.socket.on('connect', () => {
        this.isConnecting = false;
        console.log('WebSocket Connected:', this.socket?.id);
        // Keep the server-side presence key alive (30s TTL, beat every 20s).
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
          this.socket?.emit('heartbeat');
        }, 20000);
      });

      this.socket.on('disconnect', () => {
        console.log('WebSocket Disconnected');
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
      });

      this.socket.on('xp:updated', (data) => this.events.emit('xp:updated', data));
      this.socket.on('wallet:updated', (data) => this.events.emit('wallet:updated', data));
      this.socket.on('matchmaking:matched', (data) => this.events.emit('matchmaking:matched', data));
      this.socket.on('matchmaking:lobbyUpdated', (data) => this.events.emit('matchmaking:lobbyUpdated', data));
      this.socket.on('matchmaking:timedOut', (data) => this.events.emit('matchmaking:timedOut', data));
      this.socket.on('notification:new', (data) => this.events.emit('notification:new', data));
      this.socket.on('follow:requestCancelled', (data) => this.events.emit('follow:requestCancelled', data));
      this.socket.on('follow:stateChanged', (data) => this.events.emit('follow:stateChanged', data));
      this.socket.on('presence:changed', (data) => this.events.emit('presence:changed', data));
      this.socket.on('SESSION_EXPIRED', (data) => this.events.emit('SESSION_EXPIRED', data));

      this.socket.on('connect_error', (error) => {
        this.isConnecting = false;
        console.error('WebSocket Connection Error:', error);
      });
    } catch (error) {
      console.error('Error connecting to socket:', error);
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

export const createGameEngineSocket = (matchId: string, userId: string, token: string) => {
  const s = io(`${SOCKET_URL}/game-engine`, {
    auth: { matchId, userId, token },
    extraHeaders: { "ngrok-skip-browser-warning": "true" },
    transports: ['websocket', 'polling']
  });

  s.on('CONNECT_ACK', (data: any) => {
    // Rejoining an already-ACTIVE match → skip the countdown and go straight to
    // the live game (the game component syncs itself from the state snapshot).
    if (data?.state?.status === 'ACTIVE') {
      DeviceEventEmitter.emit('GAME_ENGINE_ACTIVE', { matchId, data });
    } else if (data?.state?.status === 'PAUSED' && data.reconnectWindowMs > 0) {
      // Returning to a paused match → show the offline/waiting overlay.
      DeviceEventEmitter.emit('GAME_ENGINE_PAUSE', { 
        matchId, 
        data: { reconnectWindowMs: data.reconnectWindowMs } 
      });
    }
    DeviceEventEmitter.emit('GAME_ENGINE_CONNECT', { matchId, data });
  });

  s.on('PAUSE', (data: any) => {
    DeviceEventEmitter.emit('GAME_ENGINE_PAUSE', { matchId, data });
  });

  // The match actually started (all real players readied) → countdown then play.
  s.on('START', (data: any) => {
    DeviceEventEmitter.emit('GAME_ENGINE_START', { matchId, data });
  });

  // A paused match resumed → clear the offline overlay.
  s.on('RESUME', (data: any) => {
    DeviceEventEmitter.emit('GAME_ENGINE_RESUME', { matchId, data });
  });

  s.on('STATE', (data: any) => {
    DeviceEventEmitter.emit('GAME_ENGINE_STATE', { matchId, data });
  });

  s.on('GAME_OVER', (data: any) => {
    DeviceEventEmitter.emit('GAME_ENGINE_OVER', { matchId, data });
  });

  return s;
};
