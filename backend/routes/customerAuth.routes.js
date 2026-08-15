// routes/customerAuth.routes.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getCustomerByEmail } from '../db.ticketing.js';
import { insertAuditLog } from '../db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const customer = await getCustomerByEmail(email.trim().toLowerCase());
    if (!customer || !await bcrypt.compare(password, customer.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: customer.id, email: customer.email, project_id: customer.project_id, type: 'customer' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await insertAuditLog(null, 'customer_login', req.ip, { customer_id: customer.id });

    res.json({
      success: true,
      token,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        project_id: customer.project_id,
        project_name: customer.project_name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;