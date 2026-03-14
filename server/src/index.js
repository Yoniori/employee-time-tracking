require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');

const app = express();
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://employee-time-tracking-tau.vercel.app',
  ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
];
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// Rate limit: employee ID lookup — prevents enumeration attacks
const lookupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות - נסה שוב בעוד דקה' },
});
app.use('/api/auth/lookup-employee', lookupLimiter);

// Routes
app.use('/api/employees', require('./routes/employees'));
app.use('/api/time-records', require('./routes/timeRecords'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sheets', require('./routes/sheets'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
