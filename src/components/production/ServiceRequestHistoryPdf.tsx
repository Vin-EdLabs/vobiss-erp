import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { ServiceRequestReportData } from '@/lib/serviceRequestReport';
import { formatMinutes } from '@/lib/serviceRequestReport';

const INDIGO = '#4338ca';
const INDIGO_DARK = '#1e2a6e';
const CYAN_TINT = '#e0f2fe';
const MUTED = '#6b7280';

const styles = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40,
    fontSize: 10, fontFamily: 'Helvetica', color: '#1f2937', lineHeight: 1.45,
  },
  headerBar: {
    backgroundColor: INDIGO_DARK, marginHorizontal: -40, marginTop: -36, marginBottom: 18,
    paddingVertical: 18, paddingHorizontal: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  logo: { width: 52, height: 'auto' },
  headerRight: { alignItems: 'flex-end' },
  brand: { color: CYAN_TINT, fontSize: 11, fontWeight: 'bold', letterSpacing: 0.6 },
  headerSub: { color: '#c7d2fe', fontSize: 8, marginTop: 3 },
  refId: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 2 },
  title: { fontSize: 16, fontWeight: 'bold', color: INDIGO_DARK, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  badge: {
    backgroundColor: CYAN_TINT, color: INDIGO_DARK, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10, fontSize: 8, fontWeight: 'bold', marginRight: 6, marginBottom: 4,
  },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 11, fontWeight: 'bold', color: INDIGO, borderBottomWidth: 1.5, borderBottomColor: CYAN_TINT,
    paddingBottom: 4, marginBottom: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '50%', paddingRight: 10, marginBottom: 7 },
  label: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 10, fontWeight: 'bold', color: '#111827', marginTop: 1 },
  body: { fontSize: 10, color: '#374151' },
  row: { borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', paddingVertical: 6 },
  muted: { fontSize: 8, color: MUTED },
  footer: {
    position: 'absolute', left: 40, right: 40, bottom: 24, flexDirection: 'row',
    justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: CYAN_TINT, paddingTop: 8,
  },
  footerText: { fontSize: 7, color: MUTED },
});

function fmt(v?: string | null) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
}

function money(v?: number | null) {
  return `GHS ${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function ServiceRequestHistoryPdf({
  report,
  generatedAt = new Date(),
}: {
  report: ServiceRequestReportData;
  generatedAt?: Date;
}) {
  const stages = report.stageBreakdown;
  const remarks = report.remarks;
  const attachments = report.attachments;
  const linked = report.linkedReferences;
  const materials = report.designMaterials;

  return (
    <Document title={`${report.reference} — Service Request History`} author="VOBISS ERP">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerBar} fixed>
          <View>
            <Image src="/vobiss-logo.png" style={styles.logo} />
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.brand}>VOBISS ERP</Text>
            <Text style={styles.headerSub}>Service Request — full lifecycle report</Text>
            <Text style={styles.refId}>{report.reference}</Text>
          </View>
        </View>

        <Text style={styles.title}>{report.customer_name} — {report.site_name}</Text>
        <View style={styles.badgeRow}>
          <Text style={styles.badge}>Status: {report.status}</Text>
          <Text style={styles.badge}>Stage: {report.current_stage_label}</Text>
          {report.service_type ? <Text style={styles.badge}>{report.service_type}</Text> : null}
          {report.turnaround.slaStatus ? <Text style={styles.badge}>SLA: {report.turnaround.slaStatus}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.grid}>
            <View style={styles.gridItem}><Text style={styles.label}>Customer</Text><Text style={styles.value}>{report.customer_name || '—'}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>Site</Text><Text style={styles.value}>{report.site_name || '—'}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>Location</Text><Text style={styles.value}>{report.location || '—'}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>Region</Text><Text style={styles.value}>{report.region || '—'}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>Service type</Text><Text style={styles.value}>{report.service_type || '—'}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>Capacity / bandwidth</Text><Text style={styles.value}>{[report.capacity, report.bandwidth].filter(Boolean).join(' / ') || '—'}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>MRC / NRC</Text><Text style={styles.value}>{money(report.mrc)} / {money(report.nrc)}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>Created by</Text><Text style={styles.value}>{report.created_by_name || '—'}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>Submitted</Text><Text style={styles.value}>{fmt(report.created_at)}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>Design confirmed</Text><Text style={styles.value}>{report.design_confirmed_at ? fmt(report.design_confirmed_at) : 'Not yet confirmed'}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>Last updated</Text><Text style={styles.value}>{fmt(report.updated_at)}</Text></View>
            <View style={styles.gridItem}><Text style={styles.label}>Total elapsed</Text><Text style={styles.value}>{formatMinutes(report.turnaround.totalElapsedMinutes)}{report.turnaround.isOpen ? ' (still open)' : ''}</Text></View>
          </View>
          {(report.circuit_id || report.ip_address || report.mac_address) ? (
            <View style={{ marginTop: 6 }}>
              <Text style={styles.label}>IP / integration details</Text>
              <Text style={styles.body}>
                Circuit {report.circuit_id || '—'} · IP {report.ip_address || '—'} · MAC {report.mac_address || '—'}
                {report.integrated_by ? ` · Integrated by ${report.integrated_by}` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stage-by-stage timing ({stages.length})</Text>
          {stages.length === 0 ? (
            <Text style={styles.muted}>No timing data recorded yet.</Text>
          ) : (
            stages.map((s, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.value}>
                  {s.stageLabel}{s.unitSlug ? ` (${s.unitSlug.toUpperCase()})` : ''}
                  {s.userFullName ? ` — ${s.userFullName}` : ''}
                </Text>
                <Text style={styles.muted}>
                  {fmt(s.startedAt)} → {s.endedAt ? fmt(s.endedAt) : 'in progress'} · {formatMinutes(s.minutes)} · SLA: {s.slaStatus}
                </Text>
              </View>
            ))
          )}
        </View>

        {materials.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Design material request ({materials.length})</Text>
            {materials.map((m, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.value}>{m.material_name}</Text>
                <Text style={styles.muted}>{m.quantity} {m.unit} · {money(m.unit_price)} each · {money(m.line_cost ?? m.quantity * m.unit_price)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Linked records ({linked.length})</Text>
          {linked.length === 0 ? (
            <Text style={styles.muted}>No Transport, IP Circuit, or other linked records yet.</Text>
          ) : (
            linked.map((l, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.value}>{l.typeLabel} — {l.referenceNumber || l.title || '—'}</Text>
                <Text style={styles.muted}>{l.title || ''} · Status: {l.status || '—'} · {l.direction} · added by {l.createdByName} on {fmt(l.createdAt)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All attachments ({attachments.length})</Text>
          {attachments.length === 0 ? (
            <Text style={styles.muted}>No attachments uploaded.</Text>
          ) : (
            attachments.map((a, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.value}>{a.file_name}</Text>
                <Text style={styles.muted}>{a.stage_label} · uploaded by {a.uploader_name} on {fmt(a.created_at)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Full cross-unit timeline ({remarks.length})</Text>
          {remarks.length === 0 ? (
            <Text style={styles.muted}>No comments or remarks recorded.</Text>
          ) : (
            remarks.map((m, i) => (
              <View key={i} style={styles.row} wrap={false}>
                <Text style={styles.muted}>{fmt(m.created_at)} · {m.stage_label}</Text>
                <Text style={styles.value}>{m.author_name}</Text>
                <Text style={styles.body}>{m.comment_text}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Confidential — Vobiss Solutions Limited</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Generated ${generatedAt.toLocaleString()} · Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
