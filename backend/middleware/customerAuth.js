// src/middleware/customerAuth.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export const authenticateCustomer = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // 🔑 Critical: Enforce role === 'customer'
    if (decoded.role !== 'customer') {
      return res.status(403).json({ error: 'Invalid token type. Customer access only.' });
    }

    req.customer = {
      id: decoded.id,
      customer_code: decoded.customer_code,
      project_id: decoded.project_id,
    };

    next();
  } catch (err) {
    console.error('Customer token verification failed:', err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};