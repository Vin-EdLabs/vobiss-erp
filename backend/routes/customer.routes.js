// src/routes/customer.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticateCustomer as dbAuthenticate, getCustomerById } from '../db.ticketing.cjs';
import {
  authenticateClientByEmail,
  changeClientPassword,
  listSitesForClient,
  mapClientRow,
} from '../db.clients.cjs';
import { authenticateCustomer } from '../middleware/customerAuth.js'; // shared JWT guard

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const CUSTOMER_TOKEN_EXPIRY = '30d';

function signCustomerToken(customer) {
  return jwt.sign(
    {
      id: customer.id,
      customer_code: customer.customer_code,
      project_id: customer.project_id,
      role: 'customer',
    },
    JWT_SECRET,
    { expiresIn: CUSTOMER_TOKEN_EXPIRY }
  );
}

function profilePayload(customer, sites = undefined) {
  const mapped = mapClientRow(customer) || {};
  return {
    id: customer.id,
    customer_code: customer.customer_code,
    name: customer.customer_name || mapped.company_name,
    company_name: mapped.company_name || customer.customer_name,
    contact_person: mapped.contact_person || customer.contact_person || null,
    email: customer.contact_email || null,
    phone: customer.contact_phone || null,
    location: customer.location || null,
    status: customer.status || 'Active',
    project: {
      id: customer.project_id,
      code: customer.project_code,
      name: customer.project_name,
    },
    sites: sites,
    created_at: customer.created_at,
  };
}

// POST /api/customer/login — legacy PIN login (kept)
router.post('/login', async (req, res) => {
  const { customer_code, pin } = req.body;

  if (!customer_code || !pin) {
    return res.status(400).json({ error: 'Customer code and PIN are required.' });
  }

  try {
    const customer = await dbAuthenticate(customer_code.trim(), pin.trim());
    if (!customer) {
      return res.status(401).json({ error: 'Invalid customer code or PIN.' });
    }

    const token = signCustomerToken(customer);
    res.json({
      token,
      profile: profilePayload(customer),
    });
  } catch (err) {
    console.error('Customer login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/customer/auth/login — email + password
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  try {
    const customer = await authenticateClientByEmail(email, password);
    if (!customer) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = signCustomerToken(customer);
    const sites = await listSitesForClient(customer.id);
    res.json({
      token,
      profile: profilePayload(customer, sites),
      client: profilePayload(customer, sites),
    });
  } catch (err) {
    if (err.code === 'SUSPENDED') {
      return res.status(403).json({ error: 'Account suspended. Contact support.' });
    }
    console.error('Client email login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/customer/auth/change-password
router.post('/auth/change-password', authenticateCustomer, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  try {
    await changeClientPassword(req.customer.id, current_password, new_password);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    if (err.code === 'BAD_PASSWORD') {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    res.status(400).json({ error: err.message || 'Failed to change password.' });
  }
});

// GET /api/customer/profile
router.get('/profile', authenticateCustomer, async (req, res) => {
  try {
    const customer = await getCustomerById(req.customer.id);

    if (!customer) {
      return res.status(404).json({ error: 'Client profile not found.' });
    }

    const sites = await listSitesForClient(req.customer.id);
    const payload = profilePayload(customer, sites);

    res.json({
      customer: payload,
      client: payload,
      sites,
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// GET /api/customer/sites
router.get('/sites', authenticateCustomer, async (req, res) => {
  try {
    const sites = await listSitesForClient(req.customer.id);
    res.json({ success: true, data: sites });
  } catch (err) {
    console.error('GET /customer/sites error:', err);
    res.status(500).json({ error: 'Failed to load sites.' });
  }
});

export default router;
