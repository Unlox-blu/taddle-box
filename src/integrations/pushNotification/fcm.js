'use strict';

/**
 * Stub for direct FCM delivery.
 *
 * When ready to migrate from Expo Push:
 *   1. Install firebase-admin:  npm i firebase-admin
 *   2. Initialize with your service account:
 *        const admin = require('firebase-admin');
 *        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
 *   3. Replace this function body with:
 *        const response = await admin.messaging().sendEachForMulticast({
 *          tokens,
 *          notification: { title, body },
 *          data: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)])),
 *        });
 *        return response.responses.map((r, i) => ({
 *          token: tokens[i],
 *          status: r.success ? 'ok' : 'error',
 *          message: r.error?.message || null,
 *          details: r.error ? { error: r.error.code } : null,
 *        }));
 */
module.exports = async function sendViaFCM(tokens, title, body, data) {
  if (!tokens || tokens.length === 0) return [];

  // eslint-disable-next-line no-console
  console.warn(`[FCM] Direct FCM not yet configured — skipping ${tokens.length} token(s)`);

  return tokens.map((t) => ({
    token: t,
    ticketId: null,
    status: 'skipped',
    message: 'FCM not configured',
    details: null,
  }));
};
