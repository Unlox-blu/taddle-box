import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useAuth } from "../../auth/state/AuthProvider";
import { router } from "expo-router";
import { accountSocket } from "../../../infrastructure/websocket/account-socket";
import { deviceSocketClient } from "../../../infrastructure/websocket/device-socket";
import { notificationService } from "../api/notifications.api";
import { chatService } from "../../chat/api/chat.api";
import {
  registerForPushNotificationsAsync,
  clearPushBadge,
  startTokenRefreshListener,
  stopTokenRefreshListener,
  setActiveUserIdForPush,
  getNotificationsModule,
} from "../../../infrastructure/notifications/push";
import { notificationBus, NOTIF_EVENTS } from "../../../shared/state/notification-bus";
import type { NotificationNewPayload } from "../../../shared/types";

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
  /** Number of unread chat messages (live-updated via socket). */
  unreadChatCount: number;
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
  /** Sets chat unread to 0 (e.g. user opened a conversation). */
  clearChatUnread: () => void;
};

const NotificationContext = createContext<NotificationContextType>({
  unreadCount: 0,
  unreadChatCount: 0,
  inactiveUnreadStatus: {},
  banner: null,
  showBanner: () => {},
  hideBanner: () => {},
  refreshUnread: async () => {},
  clearUnread: () => {},
  clearChatUnread: () => {},
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
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [inactiveUnreadStatus, setInactiveUnreadStatus] = useState<
    Record<string, boolean>
  >({});
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

  const clearChatUnread = useCallback(() => {
    setUnreadChatCount(0);
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
      if (
        notif?.recipientId &&
        String(notif.recipientId) !== String(user?.id)
      ) {
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

    let responseSub: { remove: () => void } | null = null;
    let notifSub: { remove: () => void } | null = null;
    let isCancelled = false;

    (async () => {
      await registerForPushNotificationsAsync();
      await startTokenRefreshListener();

      const Notifications = await getNotificationsModule();
      if (!Notifications || isCancelled) return;

      responseSub = Notifications.addNotificationResponseReceivedListener(
        async (response) => {
          clearUnread();
          const data: Record<string, any> =
            response.notification.request.content.data || {};
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
          if (
            (data?.resourceType === "chat" || data?.type === "chat:message") &&
            (data?.conversationId || data?.resourceId)
          ) {
            router.push(`/chat/${data.conversationId || data.resourceId}`);
            return;
          }

          // ── Chat invite deep-link (game invites inside chat) ────────────
          if (data?.type === "chat:invite" && data?.conversationId) {
            router.push(`/chat/${data.conversationId}`);
            return;
          }

          // ── Post deep-link (mentions, replies, likes, comments) ────────
          if (data?.resourceType === "post" && data?.resourceId) {
            router.push(`/post/${data.resourceId}`);
            return;
          }

          // ── Follow / generic notification → notifications list ──────────
          notificationBus.emit(NOTIF_EVENTS.OPEN, data);
          router.push("/notifications" as never);
        },
      );

      // Foreground system notifications → render as an in-app banner.
      notifSub = Notifications.addNotificationReceivedListener(
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
    })();

    return () => {
      isCancelled = true;
      responseSub?.remove();
      notifSub?.remove();
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

  // ── Chat unread count — fetch once on login, socket keeps it live ─────────
  useEffect(() => {
    if (!isLoggedIn) {
      setUnreadChatCount(0);
      return;
    }
    // One-time fetch to seed the initial count.
    chatService
      .getInbox(1, 50)
      .then((res) => {
        const count: number =
          res.conversations?.reduce(
            (acc: number, c: any) => acc + (c.unread_count || 0),
            0,
          ) ?? 0;
        setUnreadChatCount(count);
      })
      .catch(() => {});

    // Socket keeps it live — increment on incoming, decrement handled by
    // clearChatUnread when the user opens the conversation.
    const handleChatMessage = (data: { senderId: string }) => {
      if (data.senderId && data.senderId !== user?.id) {
        setUnreadChatCount((prev) => prev + 1);
      }
    };
    accountSocket.events.on('chat:message', handleChatMessage);
    return () => {
      accountSocket.events.off('chat:message', handleChatMessage);
    };
  }, [isLoggedIn, user?.id]);

  // ── Multi-account background unread checks ──────────────────────────────
  useEffect(() => {
    const handleDeviceUnreadStatus = (statusMap: Record<string, boolean>) => {
      setInactiveUnreadStatus(statusMap);
    };
    deviceSocketClient.events.on(
      "device:unread_status",
      handleDeviceUnreadStatus,
    );

    if (user?.id) {
      deviceSocketClient.fetchUnread();
    }

    return () => {
      deviceSocketClient.events.off(
        "device:unread_status",
        handleDeviceUnreadStatus,
      );
    };
  }, [user?.id]);

  return (
    <NotificationContext.Provider
      value={useMemo(
        () => ({
          unreadCount,
          unreadChatCount,
          inactiveUnreadStatus,
          banner,
          showBanner,
          hideBanner,
          refreshUnread,
          clearUnread,
          clearChatUnread,
        }),
        [
          unreadCount,
          unreadChatCount,
          inactiveUnreadStatus,
          banner,
          showBanner,
          hideBanner,
          refreshUnread,
          clearUnread,
          clearChatUnread,
        ],
      )}
    >
      {children}
    </NotificationContext.Provider>
  );
}
