import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import * as Notifications from "expo-notifications";
import { useAuth } from "./AuthContext";
import { accountSocket } from "../services/accountSocketClient";
import { deviceSocketClient } from "../services/deviceSocketClient";
import { notificationService } from "../services/notification.service";
import {
  registerForPushNotificationsAsync,
  clearPushBadge,
  startTokenRefreshListener,
  stopTokenRefreshListener,
  setActiveUserIdForPush,
} from "../services/pushNotification.service";
import { notificationBus, NOTIF_EVENTS } from "../lib/notificationBus";
import type { NotificationNewPayload } from "../types";

export type InAppBanner = {
  id: string;
  title: string;
  body: string;
  type?: string;
  data?: Record<string, any>;
} | null;

type NotificationContextType = {
  /** Number of unread notifications (live-updated via socket). */
  unreadCount: number;
  /** Map of inactive userId to their unread status boolean. */
  inactiveUnreadStatus: Record<string, boolean>;
  /** The banner currently displayed in-app (top overlay). */
  banner: InAppBanner;
  showBanner: (b: Exclude<InAppBanner, null>) => void;
  hideBanner: () => void;
  /** Re-sync unread count from the backend. */
  refreshUnread: () => Promise<void>;
  /** Sets unread to 0 (e.g. user opened the notifications screen). */
  clearUnread: () => void;
};

const NotificationContext = createContext<NotificationContextType>({
  unreadCount: 0,
  inactiveUnreadStatus: {},
  banner: null,
  showBanner: () => {},
  hideBanner: () => {},
  refreshUnread: async () => {},
  clearUnread: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

// Maps a backend notification payload (from socket or DB) into banner fields.
const toBanner = (
  notif: NotificationNewPayload,
): Exclude<InAppBanner, null> => {
  const title = notif?.title || "Taddlebox";
  const body =
    typeof notif?.message === "string"
      ? notif.message
      : notif?.type || "You have a new notification";
  return {
    id: String(notif?.id || Date.now()),
    title,
    body: body.length > 140 ? body.slice(0, 140) + "…" : body,
    type: notif?.type,
    data: notif,
  };
};

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoggedIn, user, switchAccount } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [inactiveUnreadStatus, setInactiveUnreadStatus] = useState<Record<string, boolean>>({});
  const [banner, setBanner] = useState<InAppBanner>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registeredRef = useRef(false);
  const lastNotifKey = useRef<string>("");

  const refreshUnread = useCallback(async () => {
    try {
      // Count-only endpoint — no need to pull notification rows just for the badge.
      const count = await notificationService.getUnreadCount();
      setUnreadCount(count);
      notificationBus.emit(NOTIF_EVENTS.UNREAD_CHANGED, count);
      if (count === 0) clearPushBadge();
    } catch {
      // offline — keep current count
    }
  }, []);

  const hideBanner = useCallback(() => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner(null);
  }, []);

  const showBanner = useCallback((b: Exclude<InAppBanner, null>) => {
    setBanner(b);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 6000);
  }, []);

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
    clearPushBadge();
    notificationBus.emit(NOTIF_EVENTS.UNREAD_CHANGED, 0);
  }, []);

  // Handle an incoming notification (socket or system foreground) uniformly.
  const handleIncoming = useCallback(
    (notif: NotificationNewPayload) => {
      const key = String(notif?.id || notif?.message || Date.now());
      // De-dupe rapid socket re-emissions of the same notification.
      if (key === lastNotifKey.current) return;
      lastNotifKey.current = key;

      // If the notification is for a different account, ignore it here.
      // The device socket's ping will automatically update the inactive red dots instead.
      if (notif?.recipientId && String(notif.recipientId) !== String(user?.id)) {
        return;
      }

      setUnreadCount((prev) => prev + 1);
      notificationBus.emit(NOTIF_EVENTS.NEW, notif);
      showBanner(toBanner(notif));
    },
    [showBanner, user?.id],
  );

  // Reset on logout so a different account on the same device re-registers its
  // own push token (device tokens are stored per user on the backend).
  useEffect(() => {
    if (!isLoggedIn) registeredRef.current = false;
  }, [isLoggedIn]);

  useEffect(() => {
    setActiveUserIdForPush(user?.id ? String(user.id) : null);
  }, [user?.id]);

  // ── Push token registration + system notification listeners ──────────────
  useEffect(() => {
    if (!isLoggedIn || registeredRef.current) return;

    // Set the guard immediately to prevent double-registration from concurrent
    // renders, but clear it on failure so a retry is possible (e.g. user
    // grants permission after initially denying it).
    registeredRef.current = true;
    registerForPushNotificationsAsync().catch(() => {
      registeredRef.current = false;
    });

    // On Android, FCM tokens rotate periodically.  Listen for token changes
    // and re-register so pushes keep landing on this device.
    startTokenRefreshListener();

    // Tapped from the system tray. Post-bound pushes (mention / reply / like /
    // comment / new post) deep-link straight to the post's detail page — with
    // the exact comment id when it's a comment mention, so the page auto-scrolls
    // to that comment. Everything else falls back to the notifications list
    // (same route the in-app banner uses).
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        clearUnread();
        const data: Record<string, any> = response.notification.request.content.data || {};
        const { navigationRef } = require("../navigation/navigationRef");

        const recipientId = data?.recipientId;
        if (recipientId && String(user?.id) !== String(recipientId)) {
          try {
            await switchAccount(recipientId);
            // Give the app a small delay to unmount/remount the active session
            await new Promise((res) => setTimeout(res, 500));
          } catch (e) {
            console.warn("Failed to switch account from notification", e);
            return; // Stop deep linking if the switch failed
          }
        }

        // ── Chat message deep-link ──────────────────────────────────────
        // Chat pushes carry conversationId + otherUser info so we can
        // open the Chat screen directly (registered at root navigator).
        if (
          (data?.resourceType === "chat" || data?.type === "chat:message") &&
          (data?.conversationId || data?.resourceId)
        ) {
          if (navigationRef?.isReady?.()) {
            (navigationRef.navigate as any)("Chat", {
              conversationId: data.conversationId || data.resourceId,
              otherUserId: data.otherUserId || undefined,
              otherUser: data.otherUser || undefined,
            });
            return;
          }
        }

        // ── Chat invite deep-link (game invites inside chat) ────────────
        if (data?.type === "chat:invite" && data?.conversationId) {
          if (navigationRef?.isReady?.()) {
            (navigationRef.navigate as any)("Chat", {
              conversationId: data.conversationId,
              otherUserId: data.otherUserId || undefined,
              otherUser: data.otherUser || undefined,
            });
            return;
          }
        }

        // ── Post deep-link (mentions, replies, likes, comments) ────────
        if (data?.resourceType === "post" && data?.resourceId) {
          try {
            const { postsService } = require("../services/posts.service");
            const res = await postsService.getPost(data.resourceId);
            const post = res?.data;
            if (post && navigationRef?.isReady?.()) {
              (navigationRef.navigate as any)("PostDetail", {
                post,
                commentId: data.commentId,
                feedContext: 'notifications',
              });
              return;
            }
          } catch (e) {
            // Post gone / offline → fall through to the notifications list.
          }
        }

        // ── Follow / generic notification → notifications list ──────────
        notificationBus.emit(NOTIF_EVENTS.OPEN, data);
        if (navigationRef?.isReady?.()) {
          (navigationRef.navigate as any)("Main", {
            screen: "Home",
            params: { screen: "Notifications" },
          });
        }
      },
    );

    // Foreground system notifications → render as an in-app banner.
    const notifSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        handleIncoming(
          (notification.request.content.data || {
            id: String(Date.now()),
            title: notification.request.content.title,
            message: notification.request.content.body,
            type: "system",
          }) as NotificationNewPayload,
        );
      },
    );

    return () => {
      responseSub.remove();
      notifSub.remove();
      stopTokenRefreshListener();
    };
  }, [isLoggedIn, handleIncoming, clearUnread, user?.id, switchAccount]);

  // ── Real-time socket notifications ───────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    refreshUnread();
    accountSocket.events.on("notification:new", handleIncoming);
    return () => {
      accountSocket.events.off("notification:new", handleIncoming);
    };
  }, [isLoggedIn, handleIncoming, refreshUnread]);

  // ── Multi-account background unread checks ──────────────────────────────
  useEffect(() => {
    const handleDeviceUnreadStatus = (statusMap: Record<string, boolean>) => {
      // Do NOT delete the active user from this map!
      // The UI components (SideDrawer/MainHeader) explicitly filter out the active
      // user when deciding whether to show a red dot. If we delete it here, switching
      // accounts causes us to lose the previous account's state.
      setInactiveUnreadStatus(statusMap);
    };
    deviceSocketClient.events.on("device:unread_status", handleDeviceUnreadStatus);
    
    // When the active user changes (e.g. on account switch), immediately ask the
    // device socket for fresh counts so the new "inactive" accounts reflect properly.
    if (user?.id) {
      deviceSocketClient.fetchUnread();
    }

    return () => {
      deviceSocketClient.events.off("device:unread_status", handleDeviceUnreadStatus);
    };
  }, [user?.id]);

  return (
    <NotificationContext.Provider
      value={useMemo(
        () => ({
          unreadCount,
          inactiveUnreadStatus,
          banner,
          showBanner,
          hideBanner,
          refreshUnread,
          clearUnread,
        }),
        [
          unreadCount,
          inactiveUnreadStatus,
          banner,
          showBanner,
          hideBanner,
          refreshUnread,
          clearUnread,
        ],
      )}
    >
      {children}
    </NotificationContext.Provider>
  );
}
