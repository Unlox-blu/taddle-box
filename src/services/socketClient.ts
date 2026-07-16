import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SOCKET_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8080' : 'http://192.168.1.17:8080';

class SocketService {
  public socket: Socket | null = null;
  private isConnecting = false;

  async connect() {
    if (this.socket?.connected || this.isConnecting) return;
    this.isConnecting = true;

    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) return;

      this.socket = io(SOCKET_URL, {
        auth: { token },
      });

      this.socket.on('connect', () => {
        this.isConnecting = false;
        console.log('WebSocket Connected:', this.socket?.id);
      });

      this.socket.on('disconnect', () => {
        console.log('WebSocket Disconnected');
      });

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
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketClient = new SocketService();
