import { apiClient } from "./apiClient";

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const notificationService = {
  getNotifications: async (
    page = 1,
    limit = 20,
    unreadOnly = false,
  ): Promise<{ data: Notification[]; meta: { unreadCount: number } }> => {
    // The backend does not support the 'unread' query parameter, so we fetch all notifications
    const response = await apiClient.get(
      `/notifications?page=${page}&limit=${limit}`,
    );
    return { data: response.data?.data, meta: response.data?.meta };
  },

  markAllRead: async () => {
    const response = await apiClient.patch("/notifications/read-all");
    return response.data;
  },

  markOneRead: async (id: string) => {
    const response = await apiClient.patch(`/notifications/${id}/read`);
    return response.data;
  },
};
