/**
 * Finish demo: director approval for cash #19 + ticket TCK-000022 chat thread
 */
import dotenv from 'dotenv';
dotenv.config();

import pool from '../db.js';
import { approveRequest } from '../db.js';
import { updateTicketStaff } from '../db.ticketing.cjs';
import { ensureTicketThread } from '../services/chatRecordThreads.js';
import { postRequestSystemMessage, postTicketSystemMessage } from '../services/chatSystemMessage.js';
import { getRealtimeIo } from '../realtime/channels.js';

const IDS = { superadmin: 54, cto: 64, requester: 58 };
const CASH_REQUEST_ID = 19;
const TICKET_ID = 'TCK-000022';
const ip = '127.0.0.1';
const io = getRealtimeIo();

async function actorName(userId) {
  const { rows } = await pool.query(
    'SELECT first_name, last_name, username FROM users WHERE id = $1',
    [userId]
  );
  const u = rows[0];
  return `${u?.first_name || ''} ${u?.last_name || ''}`.trim() || u?.username || 'User';
}

async function main() {
  console.log('=== Finish chat demo ===\n');

  // Director approval for cash (amount >= 1500 threshold)
  console.log('Director approval for cash request #19...');
  const ctoName = await actorName(IDS.cto);
  const result = await approveRequest(
    CASH_REQUEST_ID,
    { approverName: ctoName, signature: 'demo-director', stage: 'director' },
    IDS.cto,
    ip
  );
  await postRequestSystemMessage({
    requestId: CASH_REQUEST_ID,
    requestType: 'cash_request',
    action: 'approved',
    actorName: ctoName,
    io,
  });
  const st = await pool.query('SELECT status FROM requests WHERE id = $1', [CASH_REQUEST_ID]);
  console.log(`   Status: ${st.rows[0]?.status} (newStatus: ${result?.newStatus})`);

  // Ticket thread + assign
  const tRes = await pool.query(
    `SELECT id, ticket_id, title, assigned_to, created_by_id, chat_channel_id FROM tickets WHERE ticket_id = $1`,
    [TICKET_ID]
  );
  const ticket = tRes.rows[0];
  if (!ticket) throw new Error(`Ticket ${TICKET_ID} not found`);

  console.log(`\nTicket ${TICKET_ID}...`);
  let channelId = ticket.chat_channel_id;
  if (!channelId) {
    channelId = await ensureTicketThread(ticket, io);
    await postTicketSystemMessage({
      ticketId: ticket.ticket_id,
      title: ticket.title,
      actorName: await actorName(IDS.requester),
      io,
      recordChannelId: channelId,
    });
    console.log(`   Created thread ${channelId}`);
  }

  if (ticket.assigned_to !== IDS.superadmin) {
    const adminName = await actorName(IDS.superadmin);
    await updateTicketStaff(
      ticket.ticket_id,
      { assigned_to: IDS.superadmin, comment: 'Assigned for chat demo' },
      IDS.requester,
      'REQUESTER',
      ip
    );
    await postTicketSystemMessage({
      ticketId: ticket.ticket_id,
      title: ticket.title,
      actorName: adminName,
      action: 'assigned',
      assigneeId: IDS.superadmin,
      io,
    });
    console.log(`   Assigned to Admin Super`);
  } else {
    console.log('   Already assigned to superadmin');
  }

  const chCash = await pool.query(
    'SELECT id, name FROM chat_channels WHERE record_type = $1 AND record_id = $2',
    ['cash_request', String(CASH_REQUEST_ID)]
  );
  const chTicket = await pool.query(
    'SELECT id, name FROM chat_channels WHERE record_type = $1 AND record_id = $2',
    ['ticket', TICKET_ID]
  );

  console.log('\n=== Open in chat ===');
  console.log(`Cash #${CASH_REQUEST_ID}: /chat?channel=${chCash.rows[0]?.id}`);
  console.log(`Ticket ${TICKET_ID}: /chat?channel=${chTicket.rows[0]?.id}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => pool.end());
