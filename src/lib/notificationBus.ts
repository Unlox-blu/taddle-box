// Lightweight in-app event bus for notification events. Used to broadcast
// real-time (socket) notifications to every subscribed screen/component
// (badges, banners, notification list) without prop drilling.
import { warn } from '../utils/logger';

type Listener<T = any> = (payload: T) => void;

class NotificationBus {
  private listeners: { [event: string]: Set<Listener> } = {};

  on<T = any>(event: string, listener: Listener<T>) {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event].add(listener as Listener);
    return () => this.off(event, listener as Listener);
  }

  off(event: string, listener: Listener) {
    this.listeners[event]?.delete(listener);
  }

  emit<T = any>(event: string, payload?: T) {
    this.listeners[event]?.forEach((listener) => {
      try {
        listener(payload);
      } catch (e) {
        warn(`[notificationBus] listener error on ${event}`, e);
      }
    });
  }
}

export const notificationBus = new NotificationBus();

export const NOTIF_EVENTS = {
  // A new notification arrived in real-time (socket).
  NEW: "notif:new",
  // The unread badge count changed.
  UNREAD_CHANGED: "notif:unread-changed",
  // A notification was tapped from the system tray / banner → navigate to list.
  OPEN: "notif:open",
};
