import React, { useRef, useState, useEffect } from 'react';
import { Download, Upload, Trash2, RefreshCw, MessageCircle, FileJson, CheckCircle2 } from 'lucide-react';
import { API_URL } from '@/lib/api';

const DEV_CODE_KEY = 'vobiss_settings_chat_dev_code';
const CHAT_PREVIEW_KEY = 'vobiss_settings_chat_preview';
const CHAT_PAYLOAD_KEY = 'vobiss_settings_chat_payload';

function loadStoredPreview(): { fileName: string; messageCount: number; channelCount: number } | null {
  try {
    const raw = sessionStorage.getItem(CHAT_PREVIEW_KEY);
    return raw ? (JSON.parse(raw) as { fileName: string; messageCount: number; channelCount: number }) : null;
  } catch {
    return null;
  }
}

function loadStoredPayload(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(CHAT_PAYLOAD_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseChatBackupFile(text: string): Record<string, unknown> {
  const backupData = JSON.parse(text) as Record<string, unknown>;
  const tables = (backupData.tables as Record<string, unknown>) || backupData;
  const hasChat =
    backupData.kind === 'vobiss_chat_backup' ||
    Array.isArray((tables as { chat_messages?: unknown }).chat_messages) ||
    Array.isArray((tables as { chat_channels?: unknown }).chat_channels) ||
    Array.isArray(backupData.chat_messages);
  if (!hasChat) {
    throw new Error(
      'This file is not a chat backup. Use a .json file downloaded from Community Chat → Backup (not the inventory database backup).'
    );
  }
  return backupData.kind === 'vobiss_chat_backup' ? backupData : { ...backupData, tables };
}

type Props = {
  token: string | null;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export default function SettingsChatAdmin({ token, onError, onSuccess }: Props) {
  const [devCode, setDevCode] = useState(() => sessionStorage.getItem(DEV_CODE_KEY) || '');
  const [preview, setPreview] = useState<{
    fileName: string;
    messageCount: number;
    channelCount: number;
  } | null>(() => loadStoredPreview());
  const [payload, setPayload] = useState<Record<string, unknown> | null>(() => loadStoredPayload());
  const [busy, setBusy] = useState<'backup' | 'restore' | 'clear' | null>(null);
  const [parsingFile, setParsingFile] = useState(false);
  const [localStatus, setLocalStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sessionStorage.setItem(DEV_CODE_KEY, devCode);
  }, [devCode]);

  useEffect(() => {
    if (preview && payload) {
      setLocalStatus({
        type: 'ok',
        text: `${preview.fileName}: ${preview.messageCount} messages, ${preview.channelCount} channels — ready to restore.`,
      });
    }
  }, []);

  const restoreReady = !!payload && devCode.trim().length > 0;

  const handleFileChosen = async (file: File) => {
    setLocalStatus(null);
    onError('');
    if (!file.name.toLowerCase().endsWith('.json')) {
      setLocalStatus({ type: 'err', text: 'Please choose a .json chat backup file.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setParsingFile(true);
    try {
      const text = await file.text();
      const parsed = parseChatBackupFile(text);
      const tables = (parsed.tables as Record<string, unknown>) || parsed;
      const messageCount = Array.isArray((tables as { chat_messages?: unknown[] }).chat_messages)
        ? (tables as { chat_messages: unknown[] }).chat_messages.length
        : 0;
      const channelCount = Array.isArray((tables as { chat_channels?: unknown[] }).chat_channels)
        ? (tables as { chat_channels: unknown[] }).chat_channels.length
        : 0;
      setPayload(parsed);
      setPreview({ fileName: file.name, messageCount, channelCount });
      const msg = `File loaded: ${messageCount} messages, ${channelCount} channels. Enter developer code and click Insert / restore.`;
      setLocalStatus({ type: 'ok', text: msg });
    } catch (err: unknown) {
      setPreview(null);
      setPayload(null);
      const msg = err instanceof Error ? err.message : 'Could not read backup file';
      setLocalStatus({ type: 'err', text: msg });
      onError(msg);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setParsingFile(false);
    }
  };

  const handleBackup = async () => {
    const code = devCode.trim();
    if (!code) return setLocalStatus({ type: 'err', text: 'Enter the developer code above first' });
    if (!token) return onError('Not logged in');
    setBusy('backup');
    onError('');
    setLocalStatus(null);
    try {
      const res = await fetch(`${API_URL}/chat/admin/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ developerCode: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Chat backup failed');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vobiss-chat-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      setLocalStatus({ type: 'ok', text: 'Backup downloaded.' });
      onSuccess('Chat backup downloaded');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Chat backup failed';
      setLocalStatus({ type: 'err', text: msg });
      onError(msg);
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    const code = devCode.trim();
    if (!code) return setLocalStatus({ type: 'err', text: 'Enter the developer code above first' });
    if (!payload) return setLocalStatus({ type: 'err', text: 'Choose a chat backup file first' });
    if (!token) return onError('Not logged in');
    if (
      !confirm(
        `Restore chat from "${preview?.fileName || 'backup'}"? This replaces all current chat data.`
      )
    ) {
      return;
    }
    setBusy('restore');
    onError('');
    setLocalStatus({ type: 'ok', text: 'Restoring…' });
    try {
      const res = await fetch(`${API_URL}/chat/admin/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ backup: payload, developerCode: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Chat restore failed (HTTP ${res.status})`);
      }
      const msg = (data as { message?: string }).message || 'Chat data restored successfully';
      setLocalStatus({ type: 'ok', text: msg });
      onSuccess(msg);
      setPreview(null);
      setPayload(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      window.dispatchEvent(new CustomEvent('chat:unread-changed'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Chat restore failed';
      setLocalStatus({ type: 'err', text: msg });
      onError(msg);
    } finally {
      setBusy(null);
    }
  };

  const handleClear = async () => {
    const code = devCode.trim();
    if (!code) return setLocalStatus({ type: 'err', text: 'Enter the developer code above first' });
    if (!token) return onError('Not logged in');
    if (
      !confirm(
        'This will delete ALL chat messages, DMs, threads, and attachments. System channels will be recreated empty. Continue?'
      )
    ) {
      return;
    }
    setBusy('clear');
    onError('');
    setLocalStatus(null);
    try {
      const res = await fetch(`${API_URL}/chat/admin/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ developerCode: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to clear chats');
      const msg = (data as { message?: string }).message || 'All chat data cleared';
      setLocalStatus({ type: 'ok', text: msg });
      onSuccess(msg);
      setPreview(null);
      setPayload(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Clear chats failed';
      setLocalStatus({ type: 'err', text: msg });
      onError(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 lg:col-span-2">
      <div className="mb-4 flex items-center">
        <MessageCircle className="mr-2 h-5 w-5 text-[var(--primary)]" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Community Chat</h2>
      </div>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Backup, restore, or wipe all chat data (channels, messages, DMs, threads, reactions, bookmarks).
        Record links on tickets and requests are re-synced after restore.
      </p>

      <div className="mb-5">
        <label className="mb-1 block text-sm font-medium text-[var(--text-body)]">
          Developer code (all chat actions)
        </label>
        <input
          type="password"
          value={devCode}
          onChange={(e) => setDevCode(e.target.value)}
          placeholder="Same code as Database Management"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-green-light)]"
          autoComplete="off"
        />
      </div>

      {localStatus && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            localStatus.type === 'ok'
              ? 'border-[var(--accent-green)] bg-[var(--accent-green-light)] text-[var(--success-text)]'
              : 'border-[var(--accent-red)] bg-[var(--accent-red-light)] text-[var(--danger-text)]'
          }`}
        >
          {localStatus.type === 'ok' ? (
            <CheckCircle2 className="inline h-4 w-4 mr-1 -mt-0.5" />
          ) : (
            <span className="font-semibold">Error: </span>
          )}
          {localStatus.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-[var(--radius)] border border-[var(--accent-green)] bg-[var(--accent-green-light)] p-4">
          <label className="mb-2 block text-sm font-medium text-[var(--text-body)]">Backup chats</label>
          <button
            type="button"
            onClick={handleBackup}
            disabled={!devCode.trim() || busy !== null}
            className="flex w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-3 py-2.5 text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {busy === 'backup' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Download className="h-4 w-4 mr-1" /> Download backup
              </>
            )}
          </button>
        </div>

        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--accent-blue-light)] p-4">
          <label className="mb-2 block text-sm font-medium text-[var(--text-body)]">Restore / insert chats</label>
          <input
            ref={fileInputRef}
            id="vobiss-chat-backup-file"
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void handleFileChosen(file);
              e.target.value = '';
            }}
          />
          <div className="flex flex-col gap-2">
            <label
              htmlFor="vobiss-chat-backup-file"
              className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] ${
                busy !== null || parsingFile ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              {parsingFile ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <FileJson className="h-4 w-4" />
              )}
              {parsingFile ? 'Reading file…' : preview ? 'Change backup file…' : 'Choose backup file…'}
            </label>
            {preview && (
              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-body)]">
                <p className="truncate font-semibold text-[var(--text-primary)]">{preview.fileName}</p>
                <p className="mt-1">
                  {preview.messageCount} messages · {preview.channelCount} channels — ready to restore
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={handleRestore}
              disabled={!restoreReady || busy !== null || parsingFile}
              className="flex w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-3 py-2.5 font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {busy === 'restore' ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" /> Insert / restore
                </>
              )}
            </button>
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-[var(--accent-red)] bg-[var(--accent-red-light)] p-4">
          <label className="mb-2 block text-sm font-medium text-[var(--text-body)]">Clear all chats</label>
          <button
            type="button"
            onClick={handleClear}
            disabled={!devCode.trim() || busy !== null}
            className="flex w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--danger)] px-3 py-2.5 text-white hover:brightness-90 disabled:opacity-50"
          >
            {busy === 'clear' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-1" /> Clear all
              </>
            )}
          </button>
          <p className="text-xs text-red-700 mt-2">
            Removes all messages and threads; recreates #general, #announcements, and category hubs.
          </p>
        </div>
      </div>
    </div>
  );
}
