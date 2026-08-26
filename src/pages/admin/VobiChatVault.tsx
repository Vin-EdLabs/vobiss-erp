/**
 * System Admin only — Vobi Vault (access-key gated).
 * First open: set access key (hashed in DB). Later: unlock to view archive.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Users,
  Bot,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  clearVaultToken,
  getStoredVaultToken,
  getVobiVaultMessages,
  getVobiVaultStats,
  getVobiVaultStatus,
  listVobiVaultThreads,
  setupVobiVaultKey,
  unlockVobiVault,
} from '@/api/vobiVault';
import { cn } from '@/lib/utils';

type Thread = Awaited<ReturnType<typeof listVobiVaultThreads>>['threads'][number];
type VaultMessage = Awaited<ReturnType<typeof getVobiVaultMessages>>['messages'][number];

function formatWhen(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const VobiChatVault: React.FC = () => {
  const { isAdminSuper, user } = useAuth();
  const [statusLoading, setStatusLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [unlocked, setUnlocked] = useState(Boolean(getStoredVaultToken()));
  const [accessKey, setAccessKey] = useState('');
  const [confirmKey, setConfirmKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [gateError, setGateError] = useState('');
  const [gateBusy, setGateBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{
    threads: number;
    messages: number;
    vobi_replies: number;
    user_messages: number;
    last_activity: string | null;
  } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<VaultMessage[]>([]);
  const [threadMeta, setThreadMeta] = useState<Awaited<ReturnType<typeof getVobiVaultMessages>>['thread'] | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setGateError('');
    try {
      const s = await getVobiVaultStatus();
      setConfigured(Boolean(s.configured));
      if (!s.configured) {
        clearVaultToken();
        setUnlocked(false);
      }
    } catch (e) {
      setGateError(e instanceof Error ? e.message : 'Unable to check vault status');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdminSuper) void loadStatus();
  }, [isAdminSuper, loadStatus]);

  const loadVaultData = useCallback(async (q = search) => {
    setListLoading(true);
    setPageError('');
    try {
      const [list, st] = await Promise.all([
        listVobiVaultThreads({ q: q.trim() || undefined, limit: 200 }),
        getVobiVaultStats(),
      ]);
      setThreads(list.threads || []);
      setTotal(list.total || 0);
      setStats(st.stats || null);
      if (!selectedUserId && list.threads?.[0]) {
        setSelectedUserId(list.threads[0].user_id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load vault';
      setPageError(msg);
      if (/locked|access key/i.test(msg)) {
        clearVaultToken();
        setUnlocked(false);
      }
    } finally {
      setListLoading(false);
    }
  }, [search, selectedUserId]);

  useEffect(() => {
    if (unlocked && configured) void loadVaultData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, configured]);

  useEffect(() => {
    if (!unlocked || !selectedUserId) {
      setMessages([]);
      setThreadMeta(null);
      return;
    }
    let cancelled = false;
    setMsgLoading(true);
    getVobiVaultMessages(selectedUserId, { limit: 1000 })
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages || []);
        setThreadMeta(data.thread);
      })
      .catch((e) => {
        if (cancelled) return;
        setPageError(e instanceof Error ? e.message : 'Failed to load conversation');
        if (/locked/i.test(String(e?.message))) {
          clearVaultToken();
          setUnlocked(false);
        }
      })
      .finally(() => {
        if (!cancelled) setMsgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unlocked, selectedUserId]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.user_id === selectedUserId) || null,
    [threads, selectedUserId]
  );

  if (!isAdminSuper) {
    return <Navigate to="/workspace" replace />;
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateBusy(true);
    setGateError('');
    try {
      await setupVobiVaultKey(accessKey, confirmKey);
      setConfigured(true);
      setUnlocked(true);
      setAccessKey('');
      setConfirmKey('');
    } catch (err) {
      setGateError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setGateBusy(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateBusy(true);
    setGateError('');
    try {
      await unlockVobiVault(accessKey);
      setUnlocked(true);
      setAccessKey('');
    } catch (err) {
      setGateError(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setGateBusy(false);
    }
  };

  const lockVault = () => {
    clearVaultToken();
    setUnlocked(false);
    setMessages([]);
    setThreads([]);
    setStats(null);
  };

  if (statusLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[var(--content-bg)]">
        <RefreshCw className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[var(--content-bg)] px-4 py-8">
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <div className="bg-[var(--sidebar-bg,#0f172a)] px-6 py-5 text-white">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <Shield className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">Vobi Vault</h1>
            <p className="mt-1.5 text-xs leading-relaxed text-white/65">
              Restricted System Admin area.
              {configured
                ? ' Enter your access key to continue.'
                : ' First open — set an access key (stored hashed; cannot be recovered).'}
            </p>
          </div>

          <form onSubmit={configured ? handleUnlock : handleSetup} className="space-y-3 p-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                {configured ? 'Access key' : 'Create access key'}
              </label>
              <div className="relative">
                <KeyRound className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type={showKey ? 'text' : 'password'}
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  autoComplete="off"
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-8 pr-9 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                  placeholder={configured ? 'Enter key' : 'Min. 8 characters'}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {!configured && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Confirm access key</label>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={confirmKey}
                  onChange={(e) => setConfirmKey(e.target.value)}
                  autoComplete="off"
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                  placeholder="Type the same key again"
                />
              </div>
            )}

            {gateError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {gateError}
              </div>
            )}

            <button
              type="submit"
              disabled={gateBusy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {gateBusy ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : configured ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
              {configured ? 'Unlock' : 'Save key & open'}
            </button>

            <p className="text-center text-[10px] text-[var(--text-muted)]">
              {user?.username || 'System Admin'} only
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[480px] flex-col bg-[var(--content-bg)]">
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 md:px-4">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-green-light)]">
              <Shield className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight text-[var(--text-primary)]">Vobi Vault</h1>
              <p className="truncate text-[10px] text-[var(--text-muted)]">System Admin · secured</p>
            </div>
            {stats && (
              <div className="ml-2 hidden flex-wrap items-center gap-1.5 sm:flex">
                {[
                  { label: 'Threads', value: stats.threads },
                  { label: 'Msgs', value: stats.messages },
                  { label: 'User', value: stats.user_messages },
                  { label: 'Vobi', value: stats.vobi_replies },
                ].map((s) => (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
                  >
                    {s.label}
                    <strong className="font-semibold text-[var(--text-primary)]">{s.value}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => loadVaultData()}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            >
              <RefreshCw className={cn('h-3 w-3', listLoading && 'animate-spin')} />
              Refresh
            </button>
            <button
              type="button"
              onClick={lockVault}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
            >
              <LogOut className="h-3 w-3" />
              Lock
            </button>
          </div>
        </div>
      </header>

      {pageError && (
        <div className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {pageError}
        </div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden md:flex-row md:gap-2 md:p-2">
        <aside
          className={cn(
            'flex w-full flex-col border-[var(--border)] bg-[var(--surface)] md:w-[280px] md:rounded-xl md:border lg:w-[300px]',
            selectedUserId ? 'hidden md:flex' : 'flex',
            'min-h-0 flex-1 md:flex-none'
          )}
        >
          <div className="border-b border-[var(--border)] p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void loadVaultData(search);
                }}
                placeholder="Search…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--content-bg)] py-1.5 pl-7 pr-2 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]/30"
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              {total} thread{total === 1 ? '' : 's'}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listLoading && !threads.length ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-[var(--primary)]" />
              </div>
            ) : threads.length === 0 ? (
              <p className="p-4 text-center text-xs text-[var(--text-muted)]">No threads yet.</p>
            ) : (
              threads.map((t) => (
                <button
                  key={t.channel_id}
                  type="button"
                  onClick={() => setSelectedUserId(t.user_id)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-[var(--border)] px-2.5 py-1.5 text-left transition',
                    selectedUserId === t.user_id
                      ? 'bg-[var(--accent-green-light)]'
                      : 'hover:bg-[var(--surface-hover)]'
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{t.display_name}</span>
                    <span className="shrink-0 text-[9px] text-[var(--text-muted)]">{t.message_count}</span>
                  </div>
                  <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">@{t.username}</span>
                  <span className="line-clamp-1 text-[10px] text-[var(--text-secondary)]">
                    {t.last_preview || '—'}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main
          className={cn(
            'min-w-0 flex-1 flex-col overflow-hidden border-[var(--border)] bg-[var(--surface)] md:rounded-xl md:border',
            selectedUserId ? 'flex' : 'hidden md:flex'
          )}
        >
          {selectedThread || threadMeta ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="mb-0.5 text-[10px] font-medium text-[var(--primary)] md:hidden"
                    onClick={() => setSelectedUserId(null)}
                  >
                    ← Back
                  </button>
                  <h2 className="truncate text-sm font-bold text-[var(--text-primary)]">
                    {threadMeta?.display_name || selectedThread?.display_name}
                  </h2>
                  <p className="truncate text-[10px] text-[var(--text-muted)]">
                    @{threadMeta?.username || selectedThread?.username}
                    {(threadMeta?.role || selectedThread?.role) &&
                      ` · ${threadMeta?.role || selectedThread?.main_role || selectedThread?.role}`}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                  {messages.length}
                </span>
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5 md:p-3">
                {msgLoading ? (
                  <div className="flex justify-center py-10">
                    <RefreshCw className="h-5 w-5 animate-spin text-[var(--primary)]" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-xs text-[var(--text-muted)]">Empty.</p>
                ) : (
                  messages.map((m) => {
                    const isVobi = m.role === 'assistant';
                    return (
                      <div
                        key={m.id}
                        className={cn('flex', isVobi ? 'justify-start' : 'justify-end')}
                      >
                        <div
                          className={cn(
                            'max-w-[90%] rounded-xl px-2.5 py-1.5 text-xs shadow-sm md:max-w-[80%]',
                            isVobi
                              ? 'rounded-tl border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)]'
                              : 'rounded-tr bg-[var(--primary)] text-white'
                          )}
                        >
                          <div
                            className={cn(
                              'mb-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide',
                              isVobi ? 'text-[var(--primary)]' : 'text-white/80'
                            )}
                          >
                            {isVobi ? <Bot className="h-2.5 w-2.5" /> : <Users className="h-2.5 w-2.5" />}
                            {isVobi ? 'Vobi' : 'User'}
                            <span className={cn('font-normal normal-case', isVobi ? 'text-[var(--text-muted)]' : 'text-white/70')}>
                              · {formatWhen(m.created_at)}
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap break-words leading-snug">{m.body}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
              <MessageSquare className="h-7 w-7 opacity-40" />
              <p className="text-xs">Select a thread.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default VobiChatVault;
