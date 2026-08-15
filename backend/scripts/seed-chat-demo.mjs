/**
 * Demo seed: cash request + ticket with chat system messages.
 * Run: node scripts/seed-chat-demo.mjs
 */
import dotenv from 'dotenv';
dotenv.config();

import pool from '../db.js';
import { createRequest, approveRequest } from '../db.js';
import { createTicket, updateTicketStaff } from '../db.ticketing.cjs';
import { ensureRequestThread, ensureTicketThread } from '../services/chatRecordThreads.js';
import { postRequestSystemMessage, postTicketSystemMessage } from '../services/chatSystemMessage.js';
import { getRealtimeIo } from '../realtime/channels.js';

const IDS = {
  superadmin: 54,
  cto: 64,
  requester: 58, // binary
  customer: 6,
};

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
  console.log('=== Chat demo seed ===\n');

  const cust = await pool.query('SELECT project_id FROM customers WHERE id = $1', [IDS.customer]);
  if (!cust.rows[0]?.project_id) {
    throw new Error('Customer 6 has no project_id');
  }
  const project_id = cust.rows[0].project_id;

  // ─── Cash request ───
  console.log('1. Creating cash request (requester: binary)...');
  const requestData = {
    createdBy: 'Binary Binary',
    department: 'Operations',
    purpose: 'Chat demo — field petty cash',
    deliverTo: 'Binary Binary',
    deliverPhone: '0240000000',
    reason: 'Demo cash request to test chat approval flow',
    dateNeeded: new Date().toISOString().slice(0, 10),
    totalAmount: 1500,
  };
  const lineItems = [
    { description: 'Transport', quantity: 1, unit_price: 800 },
    { description: 'Supplies', quantity: 1, unit_price: 700 },
  ];
  const selectedApproverIds = [IDS.superadmin, IDS.cto];

  const cashRequest = await createRequest(
    requestData,
    selectedApproverIds,
    'cash_request',
    IDS.requester,
    ip,
    lineItems,
    null
  );
  console.log(`   Cash request #${cashRequest.id} created (status: ${cashRequest.status})`);

  const cashChannelId = await ensureRequestThread(cashRequest, selectedApproverIds, io);
  await postRequestSystemMessage({
    requestId: cashRequest.id,
    requestType: 'cash_request',
    action: 'created',
    actorName: await actorName(IDS.requester),
    io,
    recordChannelId: cashChannelId,
  });
  console.log(`   Chat thread + submission message posted (channel: ${cashChannelId})`);

  // Approve as Admin Super
  console.log('\n2. Approving as superadmin (Admin Super)...');
  const adminName = await actorName(IDS.superadmin);
  await approveRequest(
    cashRequest.id,
    { approverName: adminName, signature: 'demo', stage: 'approver' },
    IDS.superadmin,
    ip
  );
  await postRequestSystemMessage({
    requestId: cashRequest.id,
    requestType: 'cash_request',
    action: 'approved',
    actorName: adminName,
    io,
  });
  console.log('   First approval recorded + chat message posted');

  // Approve as CTO (director role — still uses stage approver for small cash)
  console.log('\n3. Approving as CTO (AIDOO CTO)...');
  const ctoName = await actorName(IDS.cto);
  await approveRequest(
    cashRequest.id,
    { approverName: ctoName, signature: 'demo', stage: 'approver' },
    IDS.cto,
    ip
  );
  await postRequestSystemMessage({
    requestId: cashRequest.id,
    requestType: 'cash_request',
    action: 'approved',
    actorName: ctoName,
    io,
  });
  console.log('   Second supervisor approval done');

  // Amount >= 1500 requires director sign-off
  console.log('\n3b. Director approval (CTO) for cash >= 1500...');
  const directorResult = await approveRequest(
    cashRequest.id,
    { approverName: ctoName, signature: 'demo-director', stage: 'director' },
    IDS.cto,
    ip
  );
  await postRequestSystemMessage({
    requestId: cashRequest.id,
    requestType: 'cash_request',
    action: 'approved',
    actorName: ctoName,
    io,
  });
  const statusRow = await pool.query('SELECT status FROM requests WHERE id = $1', [cashRequest.id]);
  console.log(`   Director approval — status: ${statusRow.rows[0]?.status} (${directorResult?.newStatus || 'ok'})`);

  // ─── Ticket ───
  console.log('\n4. Creating ticket (staff: binary)...');
  const ticket = await createTicket(
    {
      project_id,
      customer_id: IDS.customer,
      title: 'Chat demo — connectivity issue',
      category: 'technical',
      description: 'Demo ticket to verify chat thread, assignment, and system messages.',
      priority: 'high',
    },
    null,
    IDS.requester,
    ip,
    'staff',
    'REQUESTER'
  );
  console.log(`   Ticket ${ticket.ticket_id} created`);

  const ticketChannelId = await ensureTicketThread(
    { ...ticket, created_by_id: IDS.requester },
    io
  );
  await postTicketSystemMessage({
    ticketId: ticket.ticket_id,
    title: ticket.title,
    actorName: await actorName(IDS.requester),
    io,
    assigneeId: null,
    recordChannelId: ticketChannelId,
  });
  console.log(`   Chat thread + ticket opened message (channel: ${ticketChannelId})`);

  // Assign to admin
  console.log('\n5. Assigning ticket to Admin Super...');
  await updateTicketStaff(
    ticket.ticket_id,
    { assigned_to: IDS.superadmin, comment: 'Assigned for chat demo review' },
    IDS.requester,
    'REQUESTER',
    ip
  );
  await ensureTicketThread(
    { ...ticket, assigned_to: IDS.superadmin, created_by_id: IDS.requester },
    io
  );
  await postTicketSystemMessage({
    ticketId: ticket.ticket_id,
    title: ticket.title,
    actorName: adminName,
    action: 'assigned',
    assigneeId: IDS.superadmin,
    io,
  });
  console.log(`   Assigned to user ${IDS.superadmin} + chat message posted`);

  // Summary
  const chCash = await pool.query(
    'SELECT id, name FROM chat_channels WHERE record_type = $1 AND record_id = $2',
    ['cash_request', String(cashRequest.id)]
  );
  const chTicket = await pool.query(
    'SELECT id, name FROM chat_channels WHERE record_type = $1 AND record_id = $2',
    ['ticket', ticket.ticket_id]
  );

  console.log('\n=== Done — open in Community Chat ===');
  console.log(`Cash request #${cashRequest.id}: /cash-details/${cashRequest.id}`);
  if (chCash.rows[0]) {
    console.log(`  Thread: /chat?channel=${chCash.rows[0].id}  (#${chCash.rows[0].name})`);
  }
  console.log(`Ticket ${ticket.ticket_id}: /staff/cx/tickets/${ticket.ticket_id}`);
  if (chTicket.rows[0]) {
    console.log(`  Thread: /chat?channel=${chTicket.rows[0].id}  (#${chTicket.rows[0].name})`);
  }
  console.log('\nAlso check category hubs: #cash-requests and #tickets');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e.message);
    console.error(e.stack);
    process.exit(1);
  })
  .finally(() => pool.end());
