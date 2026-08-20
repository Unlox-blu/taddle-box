'use strict';

const { sendPushToMany, pollReceipts } = require('../../integrations/pushNotification/providers');

class ClientRegistryService {
  constructor({ clientRegistryRepository }) {
    this.repo = clientRegistryRepository;
  }

  /**
   * Registers or refreshes a device token.  Creates/updates the
   * (device_id, user_id) row in client_registry.
   */
  async registerToken({ userId, deviceId, sessionId, pushToken, pushProvider, platform, appVersion, osVersion }) {
    try {
      return await this.repo.create({
        userId, deviceId, sessionId, pushToken, pushProvider, platform, appVersion, osVersion,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Toggles push notifications for a specific device/user pair.
   */
  async toggleNotification({ userId, deviceId }) {
    try {
      const result = await this.repo.toggleNotification({ userId, deviceId });
      if (result.notificationsEnabled) return 'Notification on successfully';
      else return 'Notification off successfully';
    } catch (error) {
      throw error;
    }
  }

  /**
   * Device-wide push token update.
   *
   * Ownership is already verified by the verifyDeviceOwnership middleware
   * before this method is called.  This method performs the actual update:
   * ALL rows sharing the device_id get the new token, but each user's
   * notifications_enabled preference is preserved (the UPDATE only touches
   * push_token, push_provider, and updated_at).
   */
  async updateDevicePushToken({ deviceId, pushToken, pushProvider }) {
    try {
      const updatedCount = await this.repo.updateDevicePushToken({ deviceId, pushToken, pushProvider });
      return { updatedRows: updatedCount };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Sends push notifications to all devices for a user.
   * Deduplicates by device_id (each physical device receives exactly one push).
   * Includes accountUserId in the data payload for multi-account routing.
   */
  async sendToUser({ userId, title, message, data = {} }) {
    try {
      const devices = await this.repo.findByUser(userId);
      if (!devices.length) return [];

      // Inject accountUserId for multi-account routing on the client
      const enrichedData = { ...data, accountUserId: userId };

      const receipts = await sendPushToMany(devices, title, message, enrichedData);

      // Prune tokens that the provider rejected outright (ticket-level errors)
      const deadTokens = (receipts || [])
        .filter((r) => r?.details?.error === 'DeviceNotRegistered')
        .map((r) => r.token)
        .filter(Boolean);
      if (deadTokens.length) {
        await this.repo.deleteTokens(deadTokens).catch(() => {});
      }

      return receipts;
    } catch (_error) {
      throw _error;
    }
  }

  /**
   * Removes all device registrations for a user (e.g. on full logout).
   */
  async deleteTokensForUser(userId) {
    try {
      await this.repo.deleteByUser(userId);
    } catch (_error) {
      // Best-effort — never break logout because of token cleanup.
    }
  }

  // ── Auth Session Methods ─────────────────────────────────────────────────

  /**
   * Creates or updates an auth session for a (device_id, user_id) pair.
   * On re-login on the same device, the old refresh token is replaced.
   */
  async upsertSession({ userId, deviceId, sessionId, refreshHash, sessionExpiresAt, pushToken, pushProvider, platform }) {
    return await this.repo.upsertSession({ userId, deviceId, sessionId, refreshHash, sessionExpiresAt, pushToken, pushProvider, platform });
  }

  /**
   * Finds an active session by session_id. Used during refresh token rotation.
   */
  async findActiveSession({ sessionId }) {
    return await this.repo.findActiveSession({ sessionId });
  }

  /**
   * Revokes a single session (device-specific logout).
   */
  async revokeSession({ sessionId }) {
    await this.repo.revokeSession({ sessionId });
  }

  /**
   * Revokes ALL sessions for a user (full logout).
   */
  async revokeAllSessions({ userId }) {
    await this.repo.revokeAllSessions({ userId });
  }

  // ── Receipt polling (call ~30–60 s after sendToUser) ─────────────────────
  async pollAndPruneReceipts(receipts) {
    try {
      const ticketIds = (receipts || [])
        .map((r) => r.ticketId)
        .filter(Boolean);
      if (!ticketIds.length) return;

      const finalReceipts = await pollReceipts(ticketIds);

      const deadTokens = [];
      for (const [ticketId, receipt] of Object.entries(finalReceipts)) {
        if (receipt.status === 'ok') continue;

        const original = (receipts || []).find((r) => r.ticketId === ticketId);
        const token = original?.token;

        if (receipt.status === 'error') {
          const err = receipt.details?.error || receipt.message || 'unknown';
          if (err === 'DeviceNotRegistered' && token) {
            deadTokens.push(token);
          }
        }
      }

      if (deadTokens.length) {
        await this.repo.deleteTokens(deadTokens).catch(() => {});
      }
    } catch (error) {
      // Receipt polling is best-effort — never block the caller.
    }
  }
}

module.exports = ClientRegistryService;
