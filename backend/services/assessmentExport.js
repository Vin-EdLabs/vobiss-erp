import ExcelJS from 'exceljs';

function fmtDate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

const HEADER_STYLE = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } } };

/** One workbook for a single person's full assessment. */
export function buildStaffAssessmentWorkbook(assessment) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vobiss ERP';
  wb.created = new Date();

  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ width: 28 }, { width: 34 }];
  summary.addRow(['My Assessment', assessment.user.name]).font = { bold: true, size: 14 };
  summary.addRow(['Unit', assessment.user.unit || '—']);
  summary.addRow(['Role', assessment.user.role || '—']);
  summary.addRow(['Period', `${fmtDate(assessment.period.from)} to ${fmtDate(assessment.period.to)}`]);
  summary.addRow([]);
  summary.addRow(['Overall Score', assessment.score.overall ?? 'Insufficient data']);
  summary.addRow(['Label', assessment.score.label]);
  summary.addRow(['Compliance %', assessment.score.compliancePct ?? '—']);
  summary.addRow(['Avg Minutes', assessment.score.avgMinutes ?? '—']);
  summary.addRow(['Median Minutes', assessment.score.medianMinutes ?? '—']);
  summary.addRow(['Segments Completed', assessment.score.segmentsCompleted]);
  summary.addRow(['Records Handled', assessment.score.recordsHandled]);
  summary.addRow(['Critical Breaches', assessment.score.criticalBreaches]);
  summary.addRow(['Total Active Hours', assessment.score.totalActiveHours]);
  if (assessment.vsUnit) {
    summary.addRow([]);
    summary.addRow(['Unit Avg Minutes', assessment.vsUnit.unitAvgMinutes ?? '—']);
    summary.addRow(['Unit Compliance %', assessment.vsUnit.unitCompliancePct ?? '—']);
    summary.addRow(['Rank by Compliance', assessment.vsUnit.rankByCompliance != null ? `#${assessment.vsUnit.rankByCompliance} of ${assessment.vsUnit.membersInUnit}` : '—']);
    summary.addRow(['Rank by Volume', assessment.vsUnit.rankByVolume != null ? `#${assessment.vsUnit.rankByVolume} of ${assessment.vsUnit.membersInUnit}` : '—']);
  }

  const byWf = wb.addWorksheet('By Workflow');
  byWf.columns = [
    { header: 'Workflow', key: 'workflowType', width: 22 },
    { header: 'Segments', key: 'segments', width: 12 },
    { header: 'Avg Minutes', key: 'avgMinutes', width: 14 },
    { header: 'Median Minutes', key: 'medianMinutes', width: 16 },
    { header: 'Compliance %', key: 'compliancePct', width: 14 },
    { header: 'Breaches', key: 'breaches', width: 12 },
  ];
  byWf.getRow(1).eachCell((cell) => Object.assign(cell, HEADER_STYLE));
  assessment.byWorkflow.forEach((r) => byWf.addRow(r));

  const breaches = wb.addWorksheet('Breaches');
  breaches.columns = [
    { header: 'Workflow', key: 'workflowType', width: 22 },
    { header: 'Reference', key: 'reference', width: 20 },
    { header: 'Stage', key: 'stage', width: 20 },
    { header: 'Expected (min)', key: 'expectedMinutes', width: 16 },
    { header: 'Actual (min)', key: 'actualMinutes', width: 14 },
    { header: 'Exceeded By (min)', key: 'exceededBy', width: 18 },
  ];
  breaches.getRow(1).eachCell((cell) => Object.assign(cell, HEADER_STYLE));
  assessment.breaches.forEach((r) => breaches.addRow(r));

  if (assessment.unitPerformance) {
    const unit = wb.addWorksheet('Unit Ranking');
    unit.columns = [
      { header: 'Name', key: 'fullName', width: 24 },
      { header: 'Segments', key: 'segments', width: 12 },
      { header: 'Avg Minutes', key: 'avgMinutes', width: 14 },
      { header: 'Compliance %', key: 'compliancePct', width: 14 },
      { header: 'Breaches', key: 'breaches', width: 12 },
      { header: 'Score', key: 'score', width: 10 },
    ];
    unit.getRow(1).eachCell((cell) => Object.assign(cell, HEADER_STYLE));
    assessment.unitPerformance.ranking.forEach((r) => unit.addRow({ ...r, score: r.score ?? 'Insufficient data' }));
  }

  return wb;
}

/** One workbook covering a filtered team/staff list — columns per task spec. */
export function buildTeamAssessmentWorkbook(rows, { periodFrom, periodTo } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vobiss ERP';
  wb.created = new Date();

  const byUnit = new Map();
  for (const r of rows) {
    const key = r.unitSlug || '';
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key).push(r);
  }
  const rankByUnit = new Map();
  for (const [, members] of byUnit) {
    const sorted = [...members].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    sorted.forEach((m, i) => rankByUnit.set(m.userId, i + 1));
  }

  const sheet = wb.addWorksheet('Team Assessments');
  sheet.columns = [
    { header: 'Name', key: 'fullName', width: 24 },
    { header: 'Unit', key: 'unitSlug', width: 14 },
    { header: 'Period', key: 'period', width: 24 },
    { header: 'Segments', key: 'segments', width: 12 },
    { header: 'Records', key: 'records', width: 12 },
    { header: 'Avg Minutes', key: 'avgMinutes', width: 14 },
    { header: 'Median Minutes', key: 'medianMinutes', width: 16 },
    { header: 'Compliance %', key: 'compliancePct', width: 14 },
    { header: 'Breaches', key: 'breaches', width: 12 },
    { header: 'Score', key: 'score', width: 10 },
    { header: 'Rank in Unit', key: 'rankInUnit', width: 14 },
  ];
  sheet.getRow(1).eachCell((cell) => Object.assign(cell, HEADER_STYLE));
  const period = `${fmtDate(periodFrom)} to ${fmtDate(periodTo)}`;
  rows.forEach((r) => sheet.addRow({ ...r, period, score: r.score ?? 'Insufficient data', rankInUnit: rankByUnit.get(r.userId) || '' }));

  return wb;
}

export async function sendWorkbook(res, workbook, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}
