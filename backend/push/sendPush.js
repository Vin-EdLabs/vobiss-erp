import { sendWebPushToUserIds } from './webpush.js';
import { sendPushToUserIds as fcmSendToUserIds } from './fcm.js';

export async function sendPushToUserIds(userIds, payload) {
  const tasks = [sendWebPushToUserIds(userIds, payload)];
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    tasks.push(fcmSendToUserIds(userIds, payload));
  }
  const results = await Promise.allSettled(tasks);
  const sent = results.reduce(
    (n, r) => n + (r.status === 'fulfilled' ? (r.value?.sent || 0) : 0),
    0
  );
  return { sent };
}
