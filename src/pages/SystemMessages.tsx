import React, { useEffect, useState } from 'react';
import {
  createSystemNotification,
  deleteSystemNotification,
  getNotifications,
  getPushStats,
  testPushBroadcast,
  testPushToSelf,
  SystemNotification,
  PushStats,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Bell, PlusCircle, Send, Smartphone, Loader2, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import {
  enablePushNotifications,
  isCurrentlySubscribed,
  permissionState,
  isPushSupported,
} from '@/lib/webPush';
import { vobiAmbientStore } from '@/stores/vobiAmbientStore';

const SystemMessages: React.FC = () => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [stats, setStats] = useState<PushStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [confirmingTitle, setConfirmingTitle] = useState<string>('');

  useEffect(() => {
    vobiAmbientStore.getState().setFormHint('announcement-post');
  }, []);

  const refreshStats = async () => {
    try {
      const s = await getPushStats();
      setStats(s);
    } catch (e) {
      // non-blocking
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [data] = await Promise.all([getNotifications(), refreshStats()]);
        setNotifications(data);
      } catch (err: any) {
        setError(err?.message || 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setError('Title and message are required');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createSystemNotification(title.trim(), message.trim());
      setNotifications(prev => [created, ...prev]);
      setTitle('');
      setMessage('');
      const sentCount = created.push?.sent ?? 0;
      if (sentCount > 0) {
        setSuccess(`Message posted and pushed to ${sentCount} device${sentCount === 1 ? '' : 's'}.`);
        toast.success(`Notification pushed to ${sentCount} device${sentCount === 1 ? '' : 's'}`);
      } else {
        setSuccess('Message posted. No devices are subscribed yet — users need to click "Enable alerts" first.');
        toast.warning('No subscribed devices yet', {
          description: 'Ask staff to click "Enable alerts" in the header so they receive push notifications.',
        });
      }
      refreshStats();
    } catch (err: any) {
      setError(err?.message || 'Failed to post message');
    } finally {
      setSubmitting(false);
    }
  };

  const [enabling, setEnabling] = useState(false);

  const handleTestSelf = async () => {
    setTesting(true);
    try {
      const r = await testPushToSelf();
      if (r.push.sent > 0) {
        toast.success(`Test push sent to ${r.push.sent} of your device${r.push.sent === 1 ? '' : 's'}`, {
          description: 'Look for the notification on your screen / system tray.',
        });
      } else {
        toast.warning('No devices subscribed for your account', {
          description: 'Click "Enable on this device" first to receive the test.',
        });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleTestBroadcast = async () => {
    setTesting(true);
    try {
      const r = await testPushBroadcast();
      toast.success(`Test push sent to ${r.push.sent} device${r.push.sent === 1 ? '' : 's'}`);
    } catch (e: any) {
      toast.error(e?.message || 'Test broadcast failed');
    } finally {
      setTesting(false);
    }
  };

  const handleEnableHere = async () => {
    if (!isPushSupported()) {
      toast.error('Notifications are not supported in this browser.');
      return;
    }
    setEnabling(true);
    try {
      const ok = await enablePushNotifications();
      const perm = permissionState();
      if (ok) {
        toast.success('Notifications enabled on this device');
      } else if (perm === 'denied') {
        toast.error('Notifications blocked', {
          description: 'Open your browser site settings and allow notifications, then try again.',
        });
      } else {
        toast.error('Could not enable notifications');
      }
      const subscribed = await isCurrentlySubscribed();
      if (subscribed) refreshStats();
    } catch (e: any) {
      toast.error(e?.message || 'Enable failed');
    } finally {
      setEnabling(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Message Center</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create announcement banners and alerts for all users. Messages appear in the bell
            notifications and can be marked as read by each user.
          </p>
        </div>
        {user && (
          <div className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
            System Admin: {user.full_name || user.username}
          </div>
        )}
      </div>

      {/* Push diagnostics */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-[var(--shadow-md)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">Push delivery</p>
              {stats ? (
                <p className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-800">{stats.total}</span> device
                  {stats.total === 1 ? '' : 's'} subscribed across all users
                  {' · '}
                  <span className={stats.yourDevices > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                    you: {stats.yourDevices}
                  </span>
                  {' · '}
                  <span className={stats.vapidConfigured ? 'text-emerald-600' : 'text-red-500'}>
                    Web Push {stats.vapidConfigured ? 'ready' : 'NOT configured'}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-gray-500">Loading subscription stats…</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enabling}
              onClick={handleEnableHere}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            >
              {enabling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
              {enabling ? 'Enabling…' : 'Enable on this device'}
            </button>
            <button
              type="button"
              disabled={testing}
              onClick={handleTestSelf}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send test to me
            </button>
            <button
              type="button"
              disabled={testing}
              onClick={handleTestBroadcast}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              Broadcast test
            </button>
          </div>
        </div>
        {stats && stats.yourDevices === 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <strong>You</strong> haven't subscribed this device yet. Click <strong>Enable on this device</strong> above (and Allow when the browser prompts) so you can actually see push notifications when you post a message.
          </p>
        )}
        {stats && stats.total === 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            No one in the system has enabled notifications yet. Each user must click <strong>Enable alerts</strong> in the header (and allow the browser permission prompt) before they will receive desktop / home-screen / lock-screen pushes.
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <PlusCircle className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Post new message</h2>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              {success}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Month-end stock reconciliation"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              placeholder="Write the full message staff should read. You can include bullet points, deadlines, and instructions."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-xs text-gray-400">
              Tip: Keep it clear and short. Users will see this in their notification panel.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? 'Posting...' : 'Post message'}
          </button>
        </form>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900">Active messages</h2>
          </div>

          {loading && <p className="text-sm text-gray-500">Loading messages...</p>}

          {!loading && notifications.length === 0 && (
            <p className="text-sm text-gray-500">No active messages yet. Post one on the left.</p>
          )}

          <div className="space-y-3">
            {notifications.map(notif => (
              <div
                key={notif.id}
                className="border border-gray-100 rounded-lg px-4 py-3 bg-gray-50/60"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex flex-col">
                    <h3 className="text-sm font-semibold text-gray-900">{notif.title}</h3>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">
                      {new Date(notif.created_at).toLocaleString()}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => {
                      setConfirmingId(notif.id);
                      setConfirmingTitle(notif.title);
                      setError(null);
                      setSuccess(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
                <p className="text-xs text-gray-700 whitespace-pre-line">{notif.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Delete confirmation card */}
      {confirmingId !== null && (
        <>
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={() => setConfirmingId(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Delete message?
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                This will remove <span className="font-semibold">"{confirmingTitle}"</span> from
                the notifications panel for all users. They will no longer see or read it.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setConfirmingId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                  onClick={async () => {
                    if (confirmingId == null) return;
                    try {
                      await deleteSystemNotification(confirmingId);
                      setNotifications(prev => prev.filter(n => n.id !== confirmingId));
                      setSuccess('Message deleted successfully');
                    } catch (err: any) {
                      setError(err?.message || 'Failed to delete message');
                    } finally {
                      setConfirmingId(null);
                      setConfirmingTitle('');
                    }
                  }}
                >
                  Delete for all
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SystemMessages;

