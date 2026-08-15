// emailService.js – FINAL FULL WORKING VERSION (600+ lines)
import nodemailer from 'nodemailer';
import pool from './db.js';
import { getSettings, getLowStockItems } from './db.js';
import fs from 'fs';
import path from 'path';

let transporter = null;
let smtpVerifyLogged = false;
let ticketEmailErrLogged = false;

// Load logo as base64 (updated path: directly in backend root folder)
const logoPath = path.join(process.cwd(), 'vobiss-logo.png');
let logoBase64;
try {
  if (fs.existsSync(logoPath)) {
    const logoBuffer = fs.readFileSync(logoPath);
    logoBase64 = logoBuffer.toString('base64');
    console.log('Logo loaded successfully from', logoPath, '- Base64 size:', logoBase64.length);
  } else {
    console.warn('Logo file not found at', logoPath, '- emails will render without logo. Ensure vobiss-logo.png is in the backend root folder.');
    logoBase64 = null;
  }
} catch (error) {
  console.error('Error loading logo:', error);
  logoBase64 = null;
}

const clientUrl = () => String(process.env.CLIENT_URL || '').replace(/\/$/, '');

// Helper: Create transporter using DB settings first, then .env fallback
async function createTransporter() {
  const settings = await getSettings();

  const config = {
    host: settings.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(settings.smtp_port || process.env.SMTP_PORT || '587'),
    secure: (settings.smtp_encryption || 'tls').toLowerCase() === 'ssl',
    auth: {
      user: settings.smtp_username || process.env.SMTP_USER,
      pass: settings.smtp_password || process.env.SMTP_PASS,
    },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,   // 10 seconds
    socketTimeout: 10000,     // 10 seconds
  };

  if (process.env.DEBUG_SMTP === 'true') {
    config.logger = true;
    config.debug = true;
  }

  transporter = nodemailer.createTransport(config);

  transporter.verify((error, success) => {
    if (error) {
      if (!smtpVerifyLogged) {
        smtpVerifyLogged = true;
        if (process.env.DEBUG_EMAIL === 'true' || process.env.DEBUG_SMTP === 'true') {
          console.warn('SMTP verification failed:', error.message);
        }
      }
    } else if (process.env.DEBUG_EMAIL === 'true' || process.env.DEBUG_SMTP === 'true') {
      console.log('SMTP server is ready to send emails');
    }
  });
}

async function ensureTransporter() {
  if (!transporter) {
    await createTransporter();
  }
}

// Send Test Email — ONLY called from /api/test-email
export async function sendTestEmail(to) {
  await ensureTransporter();

  const settings = await getSettings();
  const fromName = settings.from_name || 'Vobiss Inventory System';
  const fromEmail = settings.from_email || process.env.SMTP_USER || 'noreply@vobissgh.com';

  const logoImg = logoBase64 
    ? `<div style="text-align: center; margin-bottom: 10px;"><img src="data:image/png;base64,${logoBase64}" alt="Vobiss Logo" style="height: 40px; width: auto; max-width: 100%; display: block; margin: 0 auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`
    : '<div style="text-align: center; margin-bottom: 10px;"><p style="font-size: 18px; font-weight: bold; color: #fff; margin: 0;">Vobiss Inventory</p></div>';

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: 'Test Email – Vobiss Inventory SMTP Working!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #2E7D32, #4CAF50); color: white; padding: 50px 20px; text-align: center; }
          .content { padding: 50px 40px; text-align: center; color: #333; }
          .success { font-size: 72px; margin: 0; color: #2E7D32; }
          .message { font-size: 20px; line-height: 1.6; margin: 30px 0; }
          .details { background: #f0f9ff; padding: 25px; border-radius: 12px; margin: 30px 0; font-family: monospace; font-size: 15px; }
          .footer { background: #1a1a1a; color: #aaa; padding: 30px; text-align: center; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoImg}
            <h1 style="margin: 10px 0 0 0; font-size: 32px; font-weight: 300;">Test Email Successful!</h1>
          </div>
          <div class="content">
            <p class="success">Success</p>
            <p class="message">
              Congratulations! Your company email settings are working perfectly.<br>
              You can now receive low stock alerts and system notifications.
            </p>
            <div class="details">
              <strong>Sent From:</strong> ${fromName} &lt;${fromEmail}&gt;<br>
              <strong>Sent To:</strong> ${to}<br>
              <strong>Time:</strong> ${new Date().toLocaleString()}
            </div>
            <p>This email was sent from your Vobiss Inventory admin panel.</p>
          </div>
          <div class="footer">
            Vobiss Inventory Management System • All systems operational
          </div>
        </div>
      </body>
      </html>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('Test email sent successfully:', info.messageId);
  return info;
}

// Send user credentials email
export async function sendUserCredentials(email, username, password) {
  try {
    await ensureTransporter();

    const settings = await getSettings();
    const fromName = settings.from_name || 'Inventory System';
    const fromEmail = settings.from_email || process.env.SMTP_USER || 'noreply@vobissgh.com';

    const logoImg = logoBase64 
      ? `<div style="text-align: center; margin-bottom: 10px;"><img src="data:image/png;base64,${logoBase64}" alt="Vobiss Logo" style="height: 40px; width: auto; max-width: 100%; display: block; margin: 0 auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`
      : '<div style="text-align: center; margin-bottom: 10px;"><p style="font-size: 18px; font-weight: bold; color: #fff; margin: 0;">Vobiss Inventory</p></div>';

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: 'Welcome to Vobiss Inventory System - Your Account Details',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: white; margin: 0; padding: 0; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: white; }
            .header { background: linear-gradient(135deg, #2E7D32, #4CAF50); color: white; padding: 30px 20px; text-align: center; border-radius: 12px 12px 0 0; box-shadow: 0 4px 12px rgba(46, 125, 50, 0.3); }
            .header h1 { margin: 0 0 10px 0; font-size: 28px; font-weight: 300; }
            .content { background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .credentials { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0ea5e9; }
            .credentials p { margin: 10px 0; font-size: 16px; }
            .credentials strong { color: #0c4a6e; }
            .login-button { display: inline-block; background: linear-gradient(135deg, #2E7D32, #4CAF50); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 25px 0; text-align: center; box-shadow: 0 4px 12px rgba(46, 125, 50, 0.3); transition: transform 0.2s ease, box-shadow 0.2s ease; }
            .login-button:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(46, 125, 50, 0.4); }
            .footer { text-align: center; font-size: 14px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; background: #f9f9f9; padding: 20px; border-radius: 0 0 12px 12px; }
            @media (max-width: 600px) { .container { padding: 10px; } .header, .content { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoImg}
              <h1>Welcome to Vobiss Inventory!</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">Your Account Has Been Created</p>
            </div>
            <div class="content">
              <p>Dear User,</p>
              <p>Your account has been successfully created by your administrator.</p>
              <div class="credentials">
                <p><strong>Username:</strong> ${username}</p>
                <p><strong>Temporary Password:</strong> ${password}</p>
                <p><em>Please log in and change your password immediately for security.</em></p>
              </div>
              <p>If you have any questions or did not request this account, please contact your administrator.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${clientUrl()}/login" class="login-button">Login to Your Account</a>
              </div>
            </div>
            <div class="footer">
              <p>Best regards,<br><strong>Vobiss Inventory Management System</strong></p>
              <p>Vobiss Team</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('User credentials email sent successfully:', info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending user credentials email:', error);
    return { ok: false, error: error.message };
  }
}

export async function sendHrWelcomeEmail(email, fullName, temporaryPassword) {
  try {
    await ensureTransporter();
    const settings = await getSettings();
    const fromName = settings.from_name || 'Vobiss';
    const fromEmail = settings.from_email || process.env.SMTP_USER || 'noreply@vobissgh.com';
    const loginUrl = `${clientUrl()}/login`;
    const logoImg = logoBase64
      ? `<div style="text-align: center; margin-bottom: 10px;"><img src="data:image/png;base64,${logoBase64}" alt="Vobiss Logo" style="height: 40px; width: auto; max-width: 100%; display: block; margin: 0 auto;"></div>`
      : '<div style="text-align: center; margin-bottom: 10px;"><p style="font-size: 18px; font-weight: bold; color: #fff; margin: 0;">Vobiss</p></div>';

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: 'Welcome to Vobiss — Your Account is Ready',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: white; margin: 0; padding: 0; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #2E7D32, #4CAF50); color: white; padding: 30px 20px; text-align: center; border-radius: 12px 12px 0 0;">
              ${logoImg}
              <h1 style="margin: 0 0 10px 0; font-size: 26px; font-weight: 300;">Welcome to Vobiss</h1>
              <p style="margin: 0; opacity: 0.9;">Your account is ready</p>
            </div>
            <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              <p>Dear ${fullName || 'Colleague'},</p>
              <p>Welcome to Vobiss. Your employee profile and system account have been created. You can sign in with the details below.</p>
              <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0ea5e9;">
                <p style="margin: 10px 0;"><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
                <p style="margin: 10px 0;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 10px 0;"><strong>Temporary password:</strong> ${temporaryPassword}</p>
                <p style="margin: 10px 0;"><em>Please change your password on first login.</em></p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #2E7D32, #4CAF50); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">Login to Your Account</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    };
    const info = await transporter.sendMail(mailOptions);
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending HR welcome email:', error);
    return { ok: false, error: error.message };
  }
}

// Send password reset email
export async function sendResetPassword(email, username, password) {
  try {
    await ensureTransporter();

    const settings = await getSettings();
    const fromName = settings.from_name || 'Inventory System';
    const fromEmail = settings.from_email || process.env.SMTP_USER || 'noreply@vobissgh.com';

    const logoImg = logoBase64 
      ? `<div style="text-align: center; margin-bottom: 10px;"><img src="data:image/png;base64,${logoBase64}" alt="Vobiss Logo" style="height: 40px; width: auto; max-width: 100%; display: block; margin: 0 auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`
      : '<div style="text-align: center; margin-bottom: 10px;"><p style="font-size: 18px; font-weight: bold; color: #fff; margin: 0;">Vobiss Inventory</p></div>';

    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: email,
      subject: 'Vobiss Inventory System - Password Reset Confirmation',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: white; margin: 0; padding: 0; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: white; }
            .header { background: linear-gradient(135deg, #dc2626, #ef4444); color: white; padding: 30px 20px; text-align: center; border-radius: 12px 12px 0 0; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); }
            .header h1 { margin: 0 0 10px 0; font-size: 28px; font-weight: 300; }
            .content { background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .credentials { background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626; }
            .credentials p { margin: 10px 0; font-size: 16px; }
            .credentials strong { color: #991b1b; }
            .login-button { display: inline-block; background: linear-gradient(135deg, #2E7D32, #4CAF50); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 25px 0; text-align: center; box-shadow: 0 4px 12px rgba(46, 125, 50, 0.3); transition: transform 0.2s ease, box-shadow 0.2s ease; }
            .login-button:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(46, 125, 50, 0.4); }
            .footer { text-align: center; font-size: 14px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; background: #f9f9f9; padding: 20px; border-radius: 0 0 12px 12px; }
            @media (max-width: 600px) { .container { padding: 10px; } .header, .content { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoImg}
              <h1>Password Reset Confirmation</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">Vobiss Inventory Management System</p>
            </div>
            <div class="content">
              <p>Dear User,</p>
              <p>Your password has been reset by an administrator.</p>
              <div class="credentials">
                <p><strong>Username:</strong> ${username}</p>
                <p><strong>New Temporary Password:</strong> ${password}</p>
                <p><em>Please log in and change your password immediately for security.</em></p>
              </div>
              <p>If you did not request this reset, please contact your administrator immediately.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${clientUrl()}/login" class="login-button">Login to Your Account</a>
              </div>
            </div>
            <div class="footer">
              <p>Best regards,<br><strong>Vobiss Inventory Management System</strong></p>
              <p>Vobiss Team</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully:', info.messageId);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error(`Failed to send reset email: ${error.message}`);
  }
}

// MAIN: Low Stock Alert — NEVER sends test email
export async function sendLowStockAlert(lowStockItemsParam = null, supervisorsParam = null) {
  console.log('=== Starting low stock alert check ===');
  try {
    await ensureTransporter();

    const settings = await getSettings();
    console.log('Settings fetched:', settings);
    const fromName = settings.from_name || 'Inventory System';
    const fromEmail = settings.from_email || process.env.SMTP_USER || 'noreply@vobissgh.com';
    console.log('Email from:', `"${fromName}" <${fromEmail}>`);

    // Fetch low stock items if not provided
    let lowStockItems;
    if (!lowStockItemsParam || !Array.isArray(lowStockItemsParam)) {
      lowStockItems = await getLowStockItems();
    } else {
      lowStockItems = lowStockItemsParam;
    }
    console.log('Low stock items (provided or fetched):', lowStockItems.length, lowStockItems.map(i => ({name: i.name, qty: i.quantity})));

    if (lowStockItems.length === 0) {
      console.log('No low stock items to alert about');
      return { success: true, sentTo: 0, totalSupervisors: 0, message: 'No low stock items found' };
    }

    // Fetch supervisors if not provided
    let supervisors;
    if (!supervisorsParam || !Array.isArray(supervisorsParam)) {
      const supervisorsResult = await pool.query('SELECT * FROM supervisors ORDER BY name ASC');
      supervisors = supervisorsResult.rows;
    } else {
      supervisors = supervisorsParam;
    }
    console.log('Supervisors (provided or fetched):', supervisors.length, supervisors.map(s => s.email));

    if (supervisors.length === 0) {
      console.warn('No supervisors configured for low stock alerts');
      return { success: true, sentTo: 0, totalSupervisors: 0, message: 'No supervisors to notify' };
    }

    // Separate critical (qty <= 0) and low (qty > 0 but <= threshold)
    const criticalItems = lowStockItems.filter(item => item.quantity <= 0);
    const lowItems = lowStockItems.filter(item => item.quantity > 0);
    console.log('Critical items:', criticalItems.length, 'Low items:', lowItems.length);

    // Get formatted send date/time
    const now = new Date();
    const dayName = now.toLocaleDateString('en-GB', { weekday: 'long' });
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const sendDateTime = `${dayName} ${dateStr} at ${timeStr}`;

    let sentCount = 0;
    const errors = [];

    for (const supervisor of supervisors) {
      let subject = 'Low Stock Alert Summary';
      let alertTypeHeader = 'Low Stock Alert';
      let introText = 'The following items have reached low stock levels. Please review and restock as needed.';

      if (criticalItems.length > 0) {
        subject = `Critical Stock Alert: ${criticalItems.length} Item(s) Out of Stock!`;
        alertTypeHeader = 'Critical Stock Alert';
        introText = `${criticalItems.length} item(s) are out of stock, and ${lowItems.length} more are low. Immediate action required!`;
      }

      console.log(`Preparing email for ${supervisor.email} - Subject: ${subject}`);

      // Build HTML table for items (without Vendor column)
      const buildItemTable = (items, headerColor, rowColor, headerText) => {
        if (items.length === 0) return '';
        return `
          <div style="margin-bottom: 20px;">
            <h3 style="color: ${headerColor}; margin: 0 0 10px 0; border-bottom: 2px solid ${headerColor}; padding-bottom: 5px;">${headerText} (${items.length})</h3>
            <table style="width: 100%; border-collapse: collapse; background: ${rowColor}; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <thead>
                <tr style="background: linear-gradient(135deg, ${headerColor}, ${headerColor}cc);">
                  <th style="padding: 15px; text-align: left; border: none; color: white; font-weight: bold;">Item Name</th>
                  <th style="padding: 15px; text-align: center; border: none; color: white; font-weight: bold;">Quantity</th>
                  <th style="padding: 15px; text-align: center; border: none; color: white; font-weight: bold;">Threshold</th>
                  <th style="padding: 15px; text-align: left; border: none; color: white; font-weight: bold;">Category</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => `
                  <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 15px; font-weight: 500; border: none;">${item.name}</td>
                    <td style="padding: 15px; text-align: center; color: ${headerColor}; font-size: 18px; font-weight: bold; border: none;">${item.quantity}</td>
                    <td style="padding: 15px; text-align: center; border: none;">${item.low_stock_threshold || 5}</td>
                    <td style="padding: 15px; border: none;">${item.category_name || 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      };

      const criticalTable = buildItemTable(criticalItems, '#d32f2f', '#ffebee', 'Out of Stock');
      const lowTable = buildItemTable(lowItems, '#ff9800', '#fff3e0', 'Low Stock');

      // Improved logo centering with fallback
      const logoImg = logoBase64 
        ? `<div style="text-align: center; margin-bottom: 10px;"><img src="data:image/png;base64,${logoBase64}" alt="Vobiss Logo" style="height: 40px; width: auto; max-width: 100%; display: block; margin: 0 auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`
        : '<div style="text-align: center; margin-bottom: 10px;"><p style="font-size: 18px; font-weight: bold; color: #fff; margin: 0;">Vobiss Inventory</p></div>';

      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: supervisor.email,
        subject: subject,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: white; margin: 0; padding: 0; line-height: 1.6; }
              .container { max-width: 700px; margin: 0 auto; padding: 20px; background-color: white; }
              .header { background: linear-gradient(135deg, #2E7D32, #4CAF50); color: white; padding: 30px 20px; text-align: center; border-radius: 12px 12px 0 0; box-shadow: 0 4px 12px rgba(46, 125, 50, 0.3); }
              .header h1 { margin: 0 0 10px 0; font-size: 28px; font-weight: 300; }
              .content { background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
              .intro { font-size: 16px; margin-bottom: 20px; line-height: 1.6; color: #333; }
              table { box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
              th { background: #f8f9fa !important; color: #333 !important; font-weight: 600; }
              tr:nth-child(even) { background: #f8f9fa; }
              .login-button { display: inline-block; background: linear-gradient(135deg, #2E7D32, #4CAF50); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 25px 0; text-align: center; box-shadow: 0 4px 12px rgba(46, 125, 50, 0.3); transition: transform 0.2s ease, box-shadow 0.2s ease; }
              .login-button:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(46, 125, 50, 0.4); }
              .footer { text-align: center; font-size: 14px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; background: #f9f9f9; padding: 20px; border-radius: 0 0 12px 12px; }
              @media (max-width: 600px) { .container { padding: 10px; } .header, .content { padding: 20px; } table { font-size: 14px; } th, td { padding: 10px; } }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                ${logoImg}
                <h1>${alertTypeHeader}</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Vobiss Inventory Management System</p>
              </div>
              <div class="content">
                <p class="intro">Dear <strong>${supervisor.name}</strong>,</p>
                <p class="intro">${introText}</p>
                ${criticalTable}
                ${lowTable}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${clientUrl()}/login" class="login-button">Login to Manage Inventory</a>
                </div>
                <p class="intro" style="font-style: italic; color: #666; text-align: center; border-top: 1px solid #eee; padding-top: 15px;">This is an automated summary. For real-time updates, check the dashboard.</p>
              </div>
              <div class="footer">
                <p>Sent on: <strong>${sendDateTime}</strong></p>
                <p>Best regards,<br><strong>Inventory Management System</strong><br>Vobiss Inventory</p>
              </div>
            </div>
          </body>
          </html>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`Low stock summary alert sent successfully to ${supervisor.email} (${lowStockItems.length} items)`);
      sentCount++;
    }

    if (errors.length > 0) {
      console.warn(`Failed to send to ${errors.length} supervisors: ${errors.join(', ')}`);
    }

    console.log('=== Low stock alert process completed ===');
    return { 
      success: true, 
      sentTo: sentCount, 
      totalSupervisors: supervisors.length,
      message: `Alert sent to ${sentCount} out of ${supervisors.length} supervisors` 
    };
  } catch (error) {
    console.error('Error in sendLowStockAlert:', {
      message: error.message,
      code: error.code,
      response: error.response,
      command: error.command,
      stack: error.stack,
    });
    throw new Error(`Failed to send low stock alert: ${error.message}`);
  }
}

// =============== TICKET EMAIL FUNCTIONS ===============
export async function sendTicketEmail(to, customerName, customerCode, ticketId, action, details = {}) {
  await ensureTransporter();

  const settings = await getSettings();
  const fromName = settings.from_name || 'Vobiss Support';
  const fromEmail = settings.from_email || process.env.SMTP_USER || 'noreply@vobissgh.com';

  const logoImg = logoBase64 
    ? `<div style="text-align: center; margin-bottom: 10px;"><img src="data:image/png;base64,${logoBase64}" alt="Vobiss Logo" style="height: 40px; width: auto; max-width: 100%; display: block; margin: 0 auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`
    : '<div style="text-align: center; margin-bottom: 10px;"><p style="font-size: 18px; font-weight: bold; color: #fff; margin: 0;">Vobiss Support</p></div>';

  let subject = '';
  let headerColor = '#2E7D32';
  let actionText = '';
  let bodyText = '';

  switch (action) {
    case 'assign':
      subject = `Ticket ${ticketId} - Assigned to ${details.team || 'Support Team'}`;
      headerColor = '#2196F3';
      actionText = 'Assigned';
      bodyText = `Your ticket (ID: ${ticketId}) associated with Customer ID (${customerCode}) has been assigned to our ${details.team || 'Support Team'}.`;
      if (details.assigneeName) {
        bodyText += ` It has been assigned to ${details.assigneeName} who will work on resolving your issue.`;
      }
      break;
    case 'escalate':
      subject = `Ticket ${ticketId} - Escalated to ${details.team || 'Support Team'}`;
      headerColor = '#ff9800';
      actionText = 'Escalated';
      bodyText = `Your ticket (ID: ${ticketId}) associated with Customer ID (${customerCode}) has been escalated to our ${details.team || 'Support Team'}.`;
      if (details.assigneeName) {
        bodyText += ` It has been assigned to ${details.assigneeName} who will work on resolving your issue.`;
      }
      break;
    case 'acknowledge':
      subject = `Ticket ${ticketId} - Acknowledged`;
      headerColor = '#9C27B0';
      actionText = 'Acknowledged';
      bodyText = `Your ticket (ID: ${ticketId}) associated with Customer ID (${customerCode}) has been acknowledged by our support team.`;
      if (details.assigneeName) {
        bodyText += ` ${details.assigneeName} is now working on your ticket.`;
      }
      break;
    case 'resolve':
      subject = `Ticket ${ticketId} - Resolved`;
      headerColor = '#4CAF50';
      actionText = 'Resolved';
      bodyText = `Your ticket (ID: ${ticketId}) associated with Customer ID (${customerCode}) has been resolved.`;
      if (details.resolutionNote) {
        bodyText += `<br><br><strong>Resolution Details:</strong><br>${details.resolutionNote}`;
      }
      break;
    case 'close':
      subject = `Ticket ${ticketId} - Closed`;
      headerColor = '#757575';
      actionText = 'Closed';
      bodyText = `Your ticket (ID: ${ticketId}) associated with Customer ID (${customerCode}) has been closed.`;
      if (details.closingNote) {
        bodyText += `<br><br><strong>Closing Summary:</strong><br>${details.closingNote}`;
      }
      break;
    case 'manual':
      subject = details.subject || `Update on Ticket ${ticketId}`;
      headerColor = '#2196F3';
      actionText = 'Update';
      bodyText = details.message || `You have received an update regarding your ticket (ID: ${ticketId}) associated with Customer ID (${customerCode}).`;
      break;
    default:
      subject = `Update on Ticket ${ticketId}`;
      bodyText = `You have received an update regarding your ticket (ID: ${ticketId}) associated with Customer ID (${customerCode}).`;
  }

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, ${headerColor}, ${headerColor}cc); color: white; padding: 40px 20px; text-align: center; }
          .content { padding: 40px; color: #333; }
          .ticket-info { background: #f0f9ff; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid ${headerColor}; }
          .ticket-info p { margin: 8px 0; font-size: 15px; }
          .ticket-info strong { color: #0c4a6e; }
          .footer { background: #1a1a1a; color: #aaa; padding: 30px; text-align: center; font-size: 14px; }
          .button { display: inline-block; background: linear-gradient(135deg, ${headerColor}, ${headerColor}cc); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoImg}
            <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 300;">Ticket ${actionText}</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; line-height: 1.6;">Hello <strong>${customerName}</strong>,</p>
            <p style="font-size: 16px; line-height: 1.6;">${bodyText}</p>
            <div class="ticket-info">
              <p><strong>Ticket ID:</strong> ${ticketId}</p>
              <p><strong>Customer ID:</strong> ${customerCode}</p>
              <p><strong>Status:</strong> ${details.status || actionText}</p>
            </div>
            <p style="font-size: 16px; line-height: 1.6;">If you have any questions or need further assistance, please don't hesitate to contact our support team.</p>
            <div style="text-align: center;">
              <a href="${clientUrl()}/customer/tickets" class="button">View Your Tickets</a>
            </div>
          </div>
          <div class="footer">
            Vobiss Support Team • This is an automated notification
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    // Reset transporter if it's in a bad state
    if (!transporter) {
      await createTransporter();
    }
    
    // Use shorter timeout and don't throw - just log
    const info = await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email send timeout after 8 seconds')), 8000)
      )
    ]);
    
    console.log(`Ticket email sent successfully to ${to} for ticket ${ticketId} (${action})`);
    return info;
  } catch (error) {
    if (!ticketEmailErrLogged) {
      ticketEmailErrLogged = true;
      if (process.env.DEBUG_EMAIL === 'true' || process.env.DEBUG_SMTP === 'true') {
        console.warn('Ticket email send failed:', error.message);
      }
    }
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      transporter = null;
    }
    return null;
  }
}

// Send email to staff member when ticket is assigned/escalated to them
export async function sendTicketAssignmentEmail(to, assigneeName, ticketId, customerName, customerCode, isEscalation = false) {
  await ensureTransporter();

  const settings = await getSettings();
  const fromName = settings.from_name || 'Vobiss Support';
  const fromEmail = settings.from_email || process.env.SMTP_USER || 'noreply@vobissgh.com';

  const logoImg = logoBase64 
    ? `<div style="text-align: center; margin-bottom: 10px;"><img src="data:image/png;base64,${logoBase64}" alt="Vobiss Logo" style="height: 40px; width: auto; max-width: 100%; display: block; margin: 0 auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`
    : '<div style="text-align: center; margin-bottom: 10px;"><p style="font-size: 18px; font-weight: bold; color: #fff; margin: 0;">Vobiss Support</p></div>';

  const subject = isEscalation 
    ? `Ticket ${ticketId} - Escalated to You`
    : `Ticket ${ticketId} - Assigned to You`;
  const headerColor = isEscalation ? '#ff9800' : '#2196F3';
  const actionText = isEscalation ? 'Escalated' : 'Assigned';
  const bodyText = isEscalation
    ? `A ticket has been escalated and assigned to you. Please review and take action as soon as possible.`
    : `A ticket has been assigned to you. Please review and take action as soon as possible.`;

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, ${headerColor}, ${headerColor}cc); color: white; padding: 40px 20px; text-align: center; }
          .content { padding: 40px; color: #333; }
          .ticket-info { background: #f0f9ff; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid ${headerColor}; }
          .ticket-info p { margin: 8px 0; font-size: 15px; }
          .ticket-info strong { color: #0c4a6e; }
          .footer { background: #1a1a1a; color: #aaa; padding: 30px; text-align: center; font-size: 14px; }
          .button { display: inline-block; background: linear-gradient(135deg, ${headerColor}, ${headerColor}cc); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoImg}
            <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 300;">Ticket ${actionText} to You</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; line-height: 1.6;">Hello <strong>${assigneeName}</strong>,</p>
            <p style="font-size: 16px; line-height: 1.6;">${bodyText}</p>
            <div class="ticket-info">
              <p><strong>Ticket ID:</strong> ${ticketId}</p>
              <p><strong>Customer:</strong> ${customerName}</p>
              <p><strong>Customer ID:</strong> ${customerCode}</p>
              <p><strong>Action:</strong> ${actionText}</p>
            </div>
            <p style="font-size: 16px; line-height: 1.6;">Please log in to the system to view the full ticket details and take appropriate action.</p>
            <div style="text-align: center;">
              <a href="${clientUrl()}/staff/cx/tickets/${ticketId}" class="button">View Ticket</a>
            </div>
          </div>
          <div class="footer">
            Vobiss Support Team • This is an automated notification
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    if (!transporter) {
      await createTransporter();
    }
    
    // Use shorter timeout and don't throw - just log
    const info = await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email send timeout after 8 seconds')), 8000)
      )
    ]);
    
    console.log(`Ticket assignment email sent successfully to ${to} for ticket ${ticketId}`);
    return info;
  } catch (error) {
    console.error('Error sending ticket assignment email (non-blocking):', error.message);
    // Reset transporter on timeout/error
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      transporter = null;
    }
    // Don't throw - just log the error
    return null;
  }
}

// Send email to approvers when request is created
export async function sendRequestCreatedEmail(to, approverName, requestId, requestType, requesterName, details = {}) {
  await ensureTransporter();

  const settings = await getSettings();
  const fromName = settings.from_name || 'Vobiss Inventory';
  const fromEmail = settings.from_email || process.env.SMTP_USER || 'noreply@vobissgh.com';

  const logoImg = logoBase64 
    ? `<div style="text-align: center; margin-bottom: 10px;"><img src="data:image/png;base64,${logoBase64}" alt="Vobiss Logo" style="height: 40px; width: auto; max-width: 100%; display: block; margin: 0 auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`
    : '<div style="text-align: center; margin-bottom: 10px;"><p style="font-size: 18px; font-weight: bold; color: #fff; margin: 0;">Vobiss Inventory</p></div>';

  const isCash = requestType === 'cash_request';
  const requestTypeLabel = isCash ? 'Cash Request' : 'Material Request';
  const headerColor = isCash ? '#9C27B0' : '#2E7D32';
  const subject = `${requestTypeLabel} #${requestId} - Pending Your Approval`;

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, ${headerColor}, ${headerColor}cc); color: white; padding: 40px 20px; text-align: center; }
          .content { padding: 40px; color: #333; }
          .request-info { background: #f0f9ff; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid ${headerColor}; }
          .request-info p { margin: 8px 0; font-size: 15px; }
          .request-info strong { color: #0c4a6e; }
          .footer { background: #1a1a1a; color: #aaa; padding: 30px; text-align: center; font-size: 14px; }
          .button { display: inline-block; background: linear-gradient(135deg, ${headerColor}, ${headerColor}cc); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoImg}
            <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 300;">${requestTypeLabel} Pending Approval</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; line-height: 1.6;">Hello <strong>${approverName}</strong>,</p>
            <p style="font-size: 16px; line-height: 1.6;">A new ${requestTypeLabel.toLowerCase()} has been created and requires your approval.</p>
            <div class="request-info">
              <p><strong>Request ID:</strong> #${requestId}</p>
              <p><strong>Requested By:</strong> ${requesterName}</p>
              <p><strong>Type:</strong> ${requestTypeLabel}</p>
              ${details.totalAmount ? `<p><strong>Total Amount:</strong> GHS ${parseFloat(details.totalAmount).toLocaleString()}</p>` : ''}
              ${details.department ? `<p><strong>Department:</strong> ${details.department}</p>` : ''}
              ${details.purpose ? `<p><strong>Purpose:</strong> ${details.purpose}</p>` : ''}
            </div>
            <p style="font-size: 16px; line-height: 1.6;">Please log in to review and approve or reject this request.</p>
            <div style="text-align: center;">
              <a href="${clientUrl()}/pending-approvals" class="button">Review Request</a>
            </div>
          </div>
          <div class="footer">
            Vobiss Inventory Management System • This is an automated notification
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    if (!transporter) {
      await createTransporter();
    }
    
    // Use shorter timeout and don't throw - just log
    const info = await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email send timeout after 8 seconds')), 8000)
      )
    ]);
    
    console.log(`Request created email sent successfully to ${to} for request ${requestId}`);
    return info;
  } catch (error) {
    console.error('Error sending request created email (non-blocking):', error.message);
    // Reset transporter on timeout/error
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      transporter = null;
    }
    // Don't throw - email failure shouldn't break request creation
    return null;
  }
}

// Send email to issuer when request is approved
export async function sendRequestApprovedEmail(to, issuerName, requestId, requestType, approverName, stage, details = {}) {
  await ensureTransporter();

  const settings = await getSettings();
  const fromName = settings.from_name || 'Vobiss Inventory';
  const fromEmail = settings.from_email || process.env.SMTP_USER || 'noreply@vobissgh.com';

  const logoImg = logoBase64 
    ? `<div style="text-align: center; margin-bottom: 10px;"><img src="data:image/png;base64,${logoBase64}" alt="Vobiss Logo" style="height: 40px; width: auto; max-width: 100%; display: block; margin: 0 auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>`
    : '<div style="text-align: center; margin-bottom: 10px;"><p style="font-size: 18px; font-weight: bold; color: #fff; margin: 0;">Vobiss Inventory</p></div>';

  const isCash = requestType === 'cash_request';
  const requestTypeLabel = isCash ? 'Cash Request' : 'Material Request';
  const headerColor = '#4CAF50';
  const stageLabel = stage === 'finance' ? 'Finance' : 'Approver';
  const subject = `${requestTypeLabel} #${requestId} - Approved by ${stageLabel}`;

  let statusMessage = '';
  if (isCash) {
    if (stage === 'approver') {
      statusMessage = 'Your cash request has been approved by the approver. It is now pending finance approval for fund release.';
    } else {
      statusMessage = 'Your cash request has been approved and funds have been released by Finance. You can now collect the cash.';
    }
  } else {
    statusMessage = 'Your material request has been approved. It is now ready for issuance.';
  }

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, ${headerColor}, ${headerColor}cc); color: white; padding: 40px 20px; text-align: center; }
          .content { padding: 40px; color: #333; }
          .request-info { background: #f0f9ff; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid ${headerColor}; }
          .request-info p { margin: 8px 0; font-size: 15px; }
          .request-info strong { color: #0c4a6e; }
          .footer { background: #1a1a1a; color: #aaa; padding: 30px; text-align: center; font-size: 14px; }
          .button { display: inline-block; background: linear-gradient(135deg, ${headerColor}, ${headerColor}cc); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoImg}
            <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 300;">Request Approved</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px; line-height: 1.6;">Hello <strong>${issuerName}</strong>,</p>
            <p style="font-size: 16px; line-height: 1.6;">${statusMessage}</p>
            <div class="request-info">
              <p><strong>Request ID:</strong> #${requestId}</p>
              <p><strong>Type:</strong> ${requestTypeLabel}</p>
              <p><strong>Approved By:</strong> ${approverName}</p>
              <p><strong>Approval Stage:</strong> ${stageLabel}</p>
              ${details.totalAmount ? `<p><strong>Total Amount:</strong> GHS ${parseFloat(details.totalAmount).toLocaleString()}</p>` : ''}
            </div>
            <p style="font-size: 16px; line-height: 1.6;">Please log in to view the full details of your request.</p>
            <div style="text-align: center;">
              <a href="${clientUrl()}/request-forms" class="button">View Request</a>
            </div>
          </div>
          <div class="footer">
            Vobiss Inventory Management System • This is an automated notification
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    if (!transporter) {
      await createTransporter();
    }
    
    // Use shorter timeout and don't throw - just log
    const info = await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email send timeout after 8 seconds')), 8000)
      )
    ]);
    
    console.log(`Request approved email sent successfully to ${to} for request ${requestId}`);
    return info;
  } catch (error) {
    console.error('Error sending request approved email (non-blocking):', error.message);
    // Reset transporter on timeout/error
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
    transporter = null;
    }
    // Don't throw - email failure shouldn't break approval
    return null;
  }
}