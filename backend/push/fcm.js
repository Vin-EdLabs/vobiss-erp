/**
 * Firebase Cloud Messaging (HTTP v1) — optional.
 * Set FIREBASE_SERVICE_ACCOUNT_JSON to a JSON string of the service account key.
 */

import {
  getFcmTokensForUserIds,
  getAllFcmTokens,
} from '../db.js';

let adminApp = null;

async function getAdmin() {
  if (adminApp === false) return null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) {
    adminApp = false;
    return null;
  }
  if (adminApp) return adminApp;
  try {
    const admin = await import('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(raw)),
      });
    }
    adminApp = admin;
    return admin;
  } catch (e) {
    console.warn('[FCM] firebase-admin not available or invalid JSON:', e.message);
    adminApp = false;
    return null;
  }
}

async function sendMulticast(tokens, { title, body, data = {} }) {
  const admin = await getAdmin();
  if (!admin || !tokens.length) return { sent: 0, skipped: true };

  const messaging = admin.messaging();
  const dataStrings = {};
  for (const [k, v] of Object.entries(data)) {
    dataStrings[k] = v == null ? '' : String(v);
  }

  let sent = 0;
  const chunkSize = 400;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: title ? { title, body: body || '' } : undefined,
        data: Object.keys(dataStrings).length ? dataStrings : undefined,
        webpush: {
          fcmOptions: {
            link: dataStrings.url || dataStrings.link || '/',
          },
        },
      });
      sent += res.successCount;
      if (res.failureCount) {
        console.warn('[FCM] partial failures:', res.failureCount);
      }
    } catch (e) {
      console.error('[FCM] sendEachForMulticast error:', e.message);
    }
  }
  return { sent, skipped: false };
}

export async function sendPushToUserIds(userIds, { title, body, data }) {
  const tokens = await getFcmTokensForUserIds(userIds);
  return sendMulticast(tokens, { title, body, data });
}

export async function sendPushBroadcast({ title, body, data }) {
  const tokens = await getAllFcmTokens();
  return sendMulticast(tokens, { title, body, data });
}
