import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

export type TicketHistoryReportData = {
  ticket_id: string;
  title: string;
  status?: string;
  priority?: string;
  category?: string;
  customer_name?: string;
  customer_code?: string;
  project_name?: string;
  description?: string;
  assignee_name?: string;
  started_at?: string | null;
  ended_at?: string | null;
  resolution_time?: string | null;
  escalation_stage?: string | null;
  workers?: Array<{
    id?: number;
    fullName: string;
    role?: string;
    activityCount?: number;
    firstActivity?: string;
    lastActivity?: string;
  }>;
  timeline?: Array<{
    action?: string;
    message?: string;
    visibility?: string;
    actor_name?: string;
    actor_role?: string;
    created_at?: string;
  }>;
  material_requests?: Array<{
    id: number;
    status?: string;
    purpose?: string;
    items?: Array<{ name?: string; quantity_requested?: number; quantity_received?: number }>;
  }>;
  cash_requests?: Array<{
    id: number;
    status?: string;
    purpose?: string;
    total_amount?: number | string | null;
  }>;
  sla?: {
    response_due_at?: string | null;
    resolution_due_at?: string | null;
    first_response_at?: string | null;
  };
  tags?: Array<{ name: string }>;
};

const BROWN = '#8b5a2b';
const BROWN_DARK = '#5c3a1e';
const CREAM = '#f3e6d4';
const MUTED = '#6b7280';

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f2937',
    lineHeight: 1.45,
  },
  headerBar: {
    backgroundColor: BROWN_DARK,
    marginHorizontal: -40,
    marginTop: -36,
    marginBottom: 18,
    paddingVertical: 18,
    paddingHorizontal: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: { width: 52, height: 'auto' },
  headerRight: { alignItems: 'flex-end' },
  brand: { color: CREAM, fontSize: 11, fontWeight: 'bold', letterSpacing: 0.6 },
  headerSub: { color: '#e8d5bc', fontSize: 8, marginTop: 3 },
  ticketId: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 2 },
  title: { fontSize: 16, fontWeight: 'bold', color: BROWN_DARK, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  badge: {
    backgroundColor: CREAM,
    color: BROWN_DARK,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 8,
    fontWeight: 'bold',
    marginRight: 6,
    marginBottom: 4,
  },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: BROWN,
    borderBottomWidth: 1.5,
    borderBottomColor: CREAM,
    paddingBottom: 4,
    marginBottom: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '50%', paddingRight: 10, marginBottom: 7 },
  label: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 10, fontWeight: 'bold', color: '#111827', marginTop: 1 },
  body: { fontSize: 10, color: '#374151' },
  row: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 6,
  },
  muted: { fontSize: 8, color: MUTED },
  footer: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: CREAM,
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: MUTED },
});

function fmt(v?: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

export function TicketHistoryReportPdf({
  report,
  generatedAt = new Date(),
}: {
  report: TicketHistoryReportData;
  generatedAt?: Date;
}) {
  const workers = report.workers || [];
  const timeline = report.timeline || [];
  const materials = report.material_requests || [];
  const cash = report.cash_requests || [];

  return (
    <Document title={`${report.ticket_id} — Ticket History`} author="VOBISS ERP">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerBar} fixed>
          <View>
            <Image src="/vobiss-logo.png" style={styles.logo} />
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.brand}>VOBISS ERP</Text>
            <Text style={styles.headerSub}>Ticket history report</Text>
            <Text style={styles.ticketId}>{report.ticket_id}</Text>
          </View>
        </View>

        <Text style={styles.title}>{report.title || 'Untitled ticket'}</Text>
        <View style={styles.badgeRow}>
          <Text style={styles.badge}>Status: {report.status || '—'}</Text>
          <Text style={styles.badge}>Priority: {report.priority || '—'}</Text>
          {report.category ? <Text style={styles.badge}>{report.category}</Text> : null}
          {report.escalation_stage ? (
            <Text style={styles.badge}>Stage: {report.escalation_stage}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Customer</Text>
              <Text style={styles.value}>
                {report.customer_name || '—'}
                {report.customer_code ? ` (${report.customer_code})` : ''}
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Project</Text>
              <Text style={styles.value}>{report.project_name || '—'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Started</Text>
              <Text style={styles.value}>{fmt(report.started_at)}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Ended</Text>
              <Text style={styles.value}>{report.ended_at ? fmt(report.ended_at) : 'Still open'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Resolution time</Text>
              <Text style={styles.value}>{report.resolution_time || '—'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.label}>Assignee</Text>
              <Text style={styles.value}>{report.assignee_name || '—'}</Text>
            </View>
          </View>
          {report.description ? (
            <View style={{ marginTop: 6 }}>
              <Text style={styles.label}>Description</Text>
              <Text style={styles.body}>{report.description}</Text>
            </View>
          ) : null}
          {!!report.tags?.length && (
            <Text style={[styles.muted, { marginTop: 6 }]}>
              Tags: {report.tags.map((t) => t.name).join(', ')}
            </Text>
          )}
        </View>

        {report.sla && (report.sla.first_response_at || report.sla.response_due_at || report.sla.resolution_due_at) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SLA</Text>
            <View style={styles.grid}>
              <View style={styles.gridItem}>
                <Text style={styles.label}>First response</Text>
                <Text style={styles.value}>{fmt(report.sla.first_response_at)}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Response due</Text>
                <Text style={styles.value}>{fmt(report.sla.response_due_at)}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.label}>Resolution due</Text>
                <Text style={styles.value}>{fmt(report.sla.resolution_due_at)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>People who worked on it ({workers.length})</Text>
          {workers.length === 0 ? (
            <Text style={styles.muted}>No workers recorded.</Text>
          ) : (
            workers.map((w, i) => (
              <View key={w.id ?? i} style={styles.row} wrap={false}>
                <Text style={styles.value}>
                  {w.fullName}
                  {w.role ? ` · ${w.role}` : ''}
                </Text>
                <Text style={styles.muted}>
                  {w.activityCount ?? 0} actions
                  {w.firstActivity ? ` · first ${fmt(w.firstActivity)}` : ''}
                  {w.lastActivity ? ` · last ${fmt(w.lastActivity)}` : ''}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Material requests ({materials.length})</Text>
          {materials.length === 0 ? (
            <Text style={styles.muted}>None linked.</Text>
          ) : (
            materials.map((r) => (
              <View key={r.id} style={styles.row} wrap={false}>
                <Text style={styles.value}>
                  #{r.id} · {r.status || '—'}
                </Text>
                <Text style={styles.body}>{r.purpose || '—'}</Text>
                {(r.items || []).map((it, idx) => (
                  <Text key={idx} style={styles.muted}>
                    · {it.name} × {it.quantity_requested}
                    {it.quantity_received != null ? ` (received ${it.quantity_received})` : ''}
                  </Text>
                ))}
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cash requests ({cash.length})</Text>
          {cash.length === 0 ? (
            <Text style={styles.muted}>None linked.</Text>
          ) : (
            cash.map((r) => (
              <View key={r.id} style={styles.row} wrap={false}>
                <Text style={styles.value}>
                  #{r.id} · {r.status || '—'}
                  {r.total_amount != null ? ` · GHS ${r.total_amount}` : ''}
                </Text>
                <Text style={styles.body}>{r.purpose || '—'}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Full timeline ({timeline.length})</Text>
          {timeline.length === 0 ? (
            <Text style={styles.muted}>No timeline entries.</Text>
          ) : (
            timeline.map((entry, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.muted}>{fmt(entry.created_at)}</Text>
                <Text style={styles.value}>
                  {entry.action || 'Update'}
                  {entry.actor_name ? ` — ${entry.actor_name}` : ''}
                  {entry.actor_role ? ` (${entry.actor_role})` : ''}
                  {entry.visibility ? ` · ${entry.visibility}` : ''}
                </Text>
                {entry.message ? <Text style={styles.body}>{entry.message}</Text> : null}
              </View>
            ))
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Confidential — Vobiss Solutions Limited</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Generated ${generatedAt.toLocaleString()} · Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
