import puppeteer from 'puppeteer';
import { buildLeaveRequestHtml } from './leaveHtml.js';

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  try {
    const browser = await browserPromise;
    if (!browser.connected) throw new Error('browser disconnected');
    return browser;
  } catch {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    return browserPromise;
  }
}

/**
 * @param {object} request — result of leave.js's getLeaveRequestDetail()
 * @returns {Promise<Buffer>}
 */
export async function renderLeaveRequestPdf(request) {
  const html = buildLeaveRequestHtml(request);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
