import Imap from 'node-imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import pool from './db.js'; // Assuming db.js is in the same directory
import { getSettings } from './db.js'; // Assuming getSettings is exported from db.js
import { createTicket, getCustomers, getOrCreateEmailSupportCustomer } from './db.ticketing.cjs';

dotenv.config();

let imap;
let isImapConnected = false;
let imapConfig = {};

async function initializeImapConfig() {
    const settings = await getSettings();

    imapConfig = {
        user: settings.imap_user || process.env.IMAP_USER,
        password: settings.imap_password || process.env.IMAP_PASS,
        host: settings.imap_host || process.env.IMAP_HOST,
        port: parseInt(settings.imap_port || process.env.IMAP_PORT || '993'),
        tls: (settings.imap_tls || 'true').toLowerCase() === 'true',
        autotls: 'never',
        // debug: console.log, // Uncomment for IMAP debugging
    };

    // Ensure all critical configurations are present
    if (!imapConfig.user || !imapConfig.password || !imapConfig.host || !imapConfig.port) {
        if (process.env.DEBUG_EMAIL === 'true' || process.env.DEBUG_IMAP === 'true') {
            console.warn('IMAP configuration is incomplete. Check IMAP_USER, IMAP_PASS, IMAP_HOST, IMAP_PORT in .env or settings.');
        }
        return false;
    }
    return true;
}

async function connectToImap() {
    if (isImapConnected) return;

    if (!(await initializeImapConfig())) {
        if (process.env.DEBUG_EMAIL === 'true' || process.env.DEBUG_IMAP === 'true') {
            console.warn('IMAP not configured. Not connecting.');
        }
        return;
    }

    if (process.env.DEBUG_EMAIL === 'true' || process.env.DEBUG_IMAP === 'true') {
        console.log('Attempting to connect to IMAP server...');
    }
    imap = new Imap(imapConfig);

    imap.once('ready', () => {
        console.log('IMAP connected. Opening INBOX...');
        isImapConnected = true;
        imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                console.error('Error opening INBOX:', err);
                isImapConnected = false;
                imap.end();
                return;
            }
            console.log('INBOX opened. Box details:', {
                name: box.name,
                messages: box.messages.total,
                newMessages: box.messages.new
            });
            // Start fetching emails after connecting
            fetchNewEmails();
        });
    });

    imap.once('error', (err) => {
        console.error('IMAP error:', err);
        isImapConnected = false;
        imap.end(); // End connection on error
        // Attempt to reconnect after a delay
        setTimeout(connectToImap, 30000); // Reconnect after 30 seconds
    });

    imap.once('end', () => {
        console.log('IMAP connection ended.');
        isImapConnected = false;
        // Attempt to reconnect after a delay if it wasn't an explicit end
        if (!imap.endedByUser) { // Assuming a flag can be set if user explicitly ends
            setTimeout(connectToImap, 30000); // Reconnect after 30 seconds
        }
    });

    imap.connect();
}

async function fetchNewEmails() {
    if (!isImapConnected || !imap) {
        console.log('IMAP not connected. Skipping email fetch.');
        // Attempt to reconnect if not connected
        if (!isImapConnected) setTimeout(connectToImap, 15000); // Try to reconnect after 15 seconds
        return;
    }

    console.log('Fetching new emails...');
    imap.search(['UNSEEN'], (err, uids) => {
        if (err) {
            console.error('IMAP search error:', err);
            // If search fails, try again later
            setTimeout(fetchNewEmails, 60000);
            return;
        }

        if (!uids || uids.length === 0) {
            console.log('No new emails found. Checking again in 1 minute.');
            // No new emails, check again after a delay
            setTimeout(fetchNewEmails, 60000);
            return;
        }

        console.log(`Found ${uids.length} new emails. Processing...`);

        const f = imap.fetch(uids, { bodies: '' });

        f.on('message', (msg, seqno) => {
            let buffer = '';
            msg.on('body', (stream, info) => {
                stream.on('data', (chunk) => {
                    buffer += chunk.toString('utf8');
                });
                stream.once('end', async () => {
                    console.log(`Finished loading message #${seqno}`);
                    try {
                        const parsed = await simpleParser(buffer);
                        console.log('Parsed email:', {
                            from: parsed.from.text,
                            to: parsed.to.text,
                            subject: parsed.subject,
                            text: parsed.text?.substring(0, 50) + '...', // Log first 50 chars of text
                            html: parsed.html ? 'HTML content present' : 'No HTML content',
                        });

                        await createTicketFromEmail(parsed);
                        
                        // Mark email as SEEN after successful processing
                        imap.addFlags(uids[seqno - 1], ['\Seen'], (err) => {
                            if (err) {
                                console.error(`Error marking email ${uids[seqno - 1]} as seen:`, err);
                            }
                            else {
                                console.log(`Email ${uids[seqno - 1]} marked as seen.`);
                            }
                        });

                        // Optionally move to a processed folder. Ensure 'Processed' folder exists.
                        // imap.move(uids[seqno - 1], 'Processed', (err) => {
                        //     if (err) console.error('Error moving email:', err);
                        //     else console.log(`Email ${uids[seqno - 1]} moved to Processed.`);
                        // });

                    } catch (parserErr) {
                        console.error('Error parsing or processing email:', parserErr);
                    }
                });
            });
            msg.once('attributes', () => {
                // console.log(`Attributes for message #${seqno}:`, attrs);
            });
            msg.once('end', () => {
                console.log(`Finished message #${seqno}`);
            });
        });

        f.once('error', (fetchErr) => {
            console.error('Fetch error:', fetchErr);
        });

        f.once('end', () => {
            console.log('Done fetching all messages in this batch!');
            // After processing, set a timeout to check again
            setTimeout(fetchNewEmails, 60000); // Check every minute
        });
    });
}


async function createTicketFromEmail(email) {
    const senderEmail = email.from && email.from.value && email.from.value[0] ? email.from.value[0].address : null;

    if (!senderEmail) {
        console.error('No sender email found. Cannot create ticket.');
        return;
    }

    console.log(`Attempting to create ticket from email from: ${senderEmail}`);

    const senderName = email.from && email.from.value && email.from.value[0] ? (email.from.value[0].name || null) : null;

    let customerId;
    let projectId;
    let customerName = 'Guest Customer';

    try {
        const customers = await getCustomers();
        const foundCustomer = customers.find(cust => cust.contact_email && cust.contact_email.toLowerCase() === senderEmail.toLowerCase());

        if (foundCustomer) {
            customerId = foundCustomer.id;
            projectId = foundCustomer.project_id;
            customerName = foundCustomer.customer_name;
            if (process.env.DEBUG_EMAIL === 'true' || process.env.DEBUG_IMAP === 'true') {
                console.log(`Found existing customer: ${customerName} (ID: ${customerId}) for email ${senderEmail}`);
            }
        } else {
            const emailSupport = await getOrCreateEmailSupportCustomer(senderEmail, senderName);
            customerId = emailSupport.customerId;
            projectId = emailSupport.projectId;
            customerName = emailSupport.customerName;
            if (process.env.DEBUG_EMAIL === 'true' || process.env.DEBUG_IMAP === 'true') {
                console.log(`Created/found email-support customer: ${customerName} (ID: ${customerId}) for ${senderEmail}`);
            }
        }
    } catch (err) {
        console.error('Error resolving customer for email:', err);
        return;
    }

    const ticketData = {
        project_id: projectId,
        customer_id: customerId,
        title: email.subject || 'Email Ticket - No Subject',
        description: email.text || email.html || 'No content provided in email.',
        status: 'NEW',
        source: 'email', // Explicitly set source to 'email'
        created_by_id: customerId, // Assuming customerId as creator for email tickets
        created_by_type: 'customer',
        // Attachments are more complex; for now, we'll omit or parse minimally
        attachments: email.attachments ? JSON.stringify(email.attachments.map(a => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
            // Don't store content directly in JSONB without careful consideration of size
        }))) : null
    };

    try {
        // created_by_id in db.ticketing.createTicket is for audit logging. 
        // For email-originated tickets, the customer is the "creator"
        const newTicket = await createTicket(ticketData, null, customerId, 'IMAP_Service', 'customer', customerName);
        console.log(`Successfully created ticket ${newTicket.ticket_id} from email.`);
    } catch (error) {
        console.error('Error creating ticket in database from email:', error);
    }
}


export async function startInboundEmailService() {
    console.log('Starting inbound email service...');
    await connectToImap();
}

// Export a stop function for graceful shutdown (optional)
export function stopInboundEmailService() {
    if (imap && isImapConnected) {
        imap.endedByUser = true; // Set flag to prevent auto-reconnect
        imap.end();
        console.log('Inbound email service stopped.');
    }
}
