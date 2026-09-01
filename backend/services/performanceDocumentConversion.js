/**
 * RESERVED — not currently called from anywhere in the app.
 *
 * Converts uploaded DOCX/PPTX report documents to PDF so they can open through the same
 * inline viewer as native PDFs (client-side rendering of docx/pptx has no good free option
 * with real fidelity). Runs LibreOffice headless via the libreoffice-convert npm wrapper.
 *
 * LibreOffice is not installed on this machine and the app must not depend on it: Performance
 * Reports currently uses the app's existing document preview/fallback behavior instead (PDF
 * renders inline via the original file; DOCX/PPT/PPTX show a "preview unavailable, download"
 * fallback, same as every other module). This file is left in place, isolated and unused, so a
 * future unified DOCX/PPTX -> LibreOffice -> PDF -> viewer upgrade can wire it back in (call
 * convertDocumentToPdf(doc.id) after upload, resume writing 'pending' in addDocument()) without
 * rebuilding the conversion pipeline from scratch.
 */
import fs from 'fs';
import path from 'path';
import pool from '../db.js';

let libreConvertFn = null;
async function loadConverter() {
  if (libreConvertFn !== null) return libreConvertFn;
  try {
    const mod = await import('libreoffice-convert');
    libreConvertFn = mod.convert || mod.default?.convert || null;
  } catch {
    libreConvertFn = false; // package not installed
  }
  return libreConvertFn;
}

const CONVERTED_DIR = path.join(process.cwd(), 'performance-report-storage', 'converted');
if (!fs.existsSync(CONVERTED_DIR)) fs.mkdirSync(CONVERTED_DIR, { recursive: true });

export async function convertDocumentToPdf(documentId) {
  const { rows } = await pool.query(`SELECT * FROM performance_report_documents WHERE id = $1`, [documentId]);
  const doc = rows[0];
  if (!doc || doc.conversion_status === 'not_needed') return doc;

  const convert = await loadConverter();
  if (!convert) {
    await pool.query(`UPDATE performance_report_documents SET conversion_status = 'failed' WHERE id = $1`, [documentId]);
    console.error(`[performance-docs] Cannot convert document ${documentId} — libreoffice-convert is not installed / LibreOffice not available on this machine.`);
    return null;
  }

  try {
    const input = fs.readFileSync(doc.file_path);
    const outputPath = path.join(CONVERTED_DIR, `report-doc-${documentId}.pdf`);
    const pdfBuf = await new Promise((resolve, reject) => {
      convert(input, '.pdf', undefined, (err, result) => (err ? reject(err) : resolve(result)));
    });
    fs.writeFileSync(outputPath, pdfBuf);
    await pool.query(
      `UPDATE performance_report_documents SET conversion_status = 'done', converted_pdf_path = $2 WHERE id = $1`,
      [documentId, outputPath]
    );
    return outputPath;
  } catch (e) {
    console.error(`[performance-docs] Conversion failed for document ${documentId}:`, e.message);
    await pool.query(`UPDATE performance_report_documents SET conversion_status = 'failed' WHERE id = $1`, [documentId]);
    return null;
  }
}
