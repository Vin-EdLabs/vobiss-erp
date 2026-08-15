import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, RefreshCw, Ticket } from 'lucide-react';
import { cxApi } from '@/api';
import { RecordChatButton } from '@/components/chat/RecordChatButton';

type TicketRow = {
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  customer_name: string;
  escalation_stage?: string;
  escalation_due_at?: string;
  stage_accepted_at?: string | null;
  assignee_name?: string;
  created_at: string;
};

export default function EscalationQueue({
  stage,
  title,
  subtitle,
  detailBasePath,
}: {
  stage: string;
  title: string;
  subtitle: string;
  detailBasePath: string;
}) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cxApi.getAllTickets({ escalation_stage: stage });
      const rows = res?.data || res?.tickets || (Array.isArray(res) ? res : []);
      setTickets(rows);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [stage]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Escalation queue</p>
            <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
            <p className="mt-1 text-slate-600">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Ticket</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    No tickets in this escalation stage.
                  </td>
                </tr>
              ) : (
                tickets.map((t) => {
                  const overdue =
                    t.escalation_due_at &&
                    !t.stage_accepted_at &&
                    new Date(t.escalation_due_at) < new Date();
                  return (
                    <tr key={t.ticket_id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium text-slate-900">
                          <Ticket className="h-4 w-4 text-indigo-500" />
                          {t.ticket_id}
                        </div>
                        <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{t.title}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{t.customer_name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {t.escalation_due_at && !t.stage_accepted_at ? (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              overdue ? 'text-red-600' : 'text-amber-700'
                            }`}
                          >
                            {overdue ? (
                              <AlertTriangle className="h-3.5 w-3.5" />
                            ) : (
                              <Clock className="h-3.5 w-3.5" />
                            )}
                            {new Date(t.escalation_due_at).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-600">Accepted</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <RecordChatButton
                            recordType="ticket"
                            recordId={t.ticket_id}
                            chatChannelId={t.chat_channel_id}
                            size="sm"
                            variant="ghost"
                          />
                          <Link
                            to={`${detailBasePath}/${t.ticket_id}`}
                            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


