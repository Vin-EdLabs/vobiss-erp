/**
 * Vobiss native Web Push service worker.
 * Runs in its own scope (/vobiss-push/) so it can coexist with the Vite PWA SW.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function updateBadgeFromNotifications(delta) {
  try {
    const list = await self.registration.getNotifications();
    const total = Math.max(0, list.length + (delta || 0));
    if ('setAppBadge' in self.navigator) {
      if (total > 0) {
        await self.navigator.setAppBadge(total);
      } else if ('clearAppBadge' in self.navigator) {
        await self.navigator.clearAppBadge();
      }
    }
  } catch (e) {
    /* not supported - silent */
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Vobiss', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Vobiss';
  const data = payload.data || {};
  const url = data.url || data.link || '/';
  const requireInteraction = data.requireInteraction === '1' || data.type === 'announcement';
  const isChat = data.type === 'chat_message' || data.type === 'chat_mention';
  const options = {
    body: payload.body || '',
    icon: '/vobiss-logo-192.png',
    badge: '/vobiss-logo-192.png',
    data: { ...data, url },
    tag: data.tag || `vobiss-${data.type || 'msg'}-${data.messageId || Date.now()}`,
    renotify: true,
    requireInteraction: requireInteraction,
    vibrate: [120, 60, 120, 60, 200],
    actions: [
      { action: 'open', title: isChat ? 'Open chat' : 'Open Vobiss' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // +1 because the just-shown notification may not yet appear in getNotifications()
      await updateBadgeFromNotifications(1);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') {
    event.waitUntil(updateBadgeFromNotifications(0));
    return;
  }
  const data = event.notification.data || {};
  const url = new URL(data.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      // Refresh the home-screen badge to reflect remaining notifications
      await updateBadgeFromNotifications(0);
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of list) {
        try {
          if ('focus' in client) {
            await client.focus();
            if ('navigate' in client) await client.navigate(url);
            return;
          }
        } catch (e) {
          /* ignore */
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});

self.addEventListener('notificationclose', () => {
  // User dismissed without clicking — update badge
  void updateBadgeFromNotifications(0);
});
