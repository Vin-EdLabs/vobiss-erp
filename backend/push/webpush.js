/**
 * Native Web Push using VAPID — no Firebase required.
 * Reads VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT from the env.
 *
 * Sends to all subscriptions stored in the `push_subscriptions` table.
 * Automatically prunes subscriptions that return 404/410 (gone).
 */

import webpush from 'web-push';
import pool from '../db.js';

let configured = false;

function configure() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@vobiss.com';
  if (!pub || !priv) {
    console.warn('[webpush] VAPID keys not configured — push disabled.');
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export function getPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

export function isWebPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

async function fetchSubscriptions(filter, params) {
  const sql = filter
    ? `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE ${filter}`
    : 'SELECT id, endpoint, p256dh, auth FROM push_subscriptions';
  const res = await pool.query(sql, params || []);
  return res.rows.map((r) => ({
    id: r.id,
    endpoint: r.endpoint,
    keys: { p256dh: r.p256dh, auth: r.auth },
  }));
}

async function deleteSubscription(id) {
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [id]);
  } catch (e) {
    /* ignore */
  }
}

async function sendOne(subscription, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 } // 24h
    );
    return { ok: true };
  } catch (err) {
    const status = err.statusCode || err.status || 0;
    if (status === 404 || status === 410) {
      // Expired/gone — clean up
      await deleteSubscription(subscription.id);
    } else {
      console.warn('[webpush] send error', status, err.body || err.message);
    }
    return { ok: false };
  }
}

async function sendMany(subs, payload) {
  if (!configure() || !subs.length) return { sent: 0, skipped: !subs.length };
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      const r = await sendOne(s, payload);
      if (r.ok) sent += 1;
    })
  );
  return { sent };
}

export async function sendWebPushToUserIds(userIds, { title, body, data = {} }) {
  if (!userIds?.length) return { sent: 0, skipped: true };
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
  const subs = await fetchSubscriptions(`user_id IN (${placeholders})`, userIds);
  return sendMany(subs, { title, body, data });
}

export async function sendWebPushBroadcast({ title, body, data = {} }) {
  const subs = await fetchSubscriptions();
  return sendMany(subs, { title, body, data });
}
