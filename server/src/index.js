require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');

const app = express();
// Ensure NODE_ENV is always set — default to 'production' to fail closed on security checks
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
  console.warn('[startup] NODE_ENV was not set — defaulting to "production"');
}
console.log(`[startup] NODE_ENV=${process.env.NODE_ENV}, PORT=${process.env.PORT || 3001}`);
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  // Use env var in production; fall back to hardcoded domain if not set
  ...(process.env.CORS_ORIGIN
    ? [process.env.CORS_ORIGIN]
    : ['https://employee-time-tracking-tau.vercel.app']),
];
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '2mb' }));

// Rate limit: employee ID lookup — prevents enumeration attacks
const lookupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות - נסה שוב בעוד דקה' },
});
app.use('/api/auth/lookup-employee', lookupLimiter);
app.use('/api/signup', lookupLimiter);

// Routes
app.use('/api/employees', require('./routes/employees'));
app.use('/api/time-records', require('./routes/timeRecords'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sheets', require('./routes/sheets'));
app.use('/api/signup', require('./routes/signup'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
