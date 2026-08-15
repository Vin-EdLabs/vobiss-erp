// backend/telegramNotifier.js   ← ONLY THIS FILE + 2 LINES IN server.js
import fetch from 'node-fetch';

// === AUTO-INITIALIZATION (runs when file is imported) ===
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || null;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || null;

if (BOT_TOKEN && CHAT_ID) {
  console.log("Telegram Notifier → ACTIVE (new requests will be sent)");
} else {
  console.log("Telegram Notifier → OFF (set TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID in .env)");
}

// === MAIN FUNCTION — CALL THIS WHEN A REQUEST IS CREATED ===
export async function notifyOnNewRequest(requesterUsername, itemsCount = 0, requestId = null) {
  if (!BOT_TOKEN || !CHAT_ID) return;   // disabled if not configured

  const message = `NEW APPROVAL REQUEST

From: <b>${requesterUsername}</b>
Items: ${itemsCount}
${requestId ? `Request ID: <code>${requestId}</code>\n` : ''}Open Vobiss → ${String(process.env.CLIENT_URL || '').replace(/\/$/, '')}/requests`;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
  } catch (err) {
    console.log("Telegram send failed:", err.message);
  }
}