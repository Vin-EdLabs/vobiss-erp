// src/routes/customer.routes.js
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticateCustomer as dbAuthenticate, getCustomerById } from '../db.ticketing.cjs';
import { authenticateCustomer } from '../middleware/customerAuth.js'; // ← shared middleware

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const CUSTOMER_TOKEN_EXPIRY = '30d';

// POST /api/customer/login
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

    // ✅ Include `role: 'customer'` explicitly
    const token = jwt.sign(
      {
        id: customer.id,
        customer_code: customer.customer_code,
        project_id: customer.project_id,
        role: 'customer', // 👈 enforced by middleware
      },
      JWT_SECRET,
      { expiresIn: CUSTOMER_TOKEN_EXPIRY }
    );

    res.json({
      token,
      profile: {
        id: customer.id,
        customer_code: customer.customer_code,
        name: customer.customer_name,
        email: customer.contact_email || null,
        phone: customer.contact_phone || null,
        project: {
          id: customer.project_id,
          code: customer.project_code,
          name: customer.project_name,
        },
        created_at: customer.created_at,
      },
    });
  } catch (err) {
    console.error('Customer login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /api/customer/profile — uses shared middleware
router.get('/profile', authenticateCustomer, async (req, res) => {
  try {
    const customer = await getCustomerById(req.customer.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer profile not found.' });
    }

    res.json({
      customer: {
        id: customer.id,
        customer_code: customer.customer_code,
        name: customer.customer_name,
        email: customer.contact_email || null,
        phone: customer.contact_phone || null,
        project: {
          id: customer.project_id,
          code: customer.project_code,
          name: customer.project_name,
        },
        created_at: customer.created_at,
      },
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

export default router;