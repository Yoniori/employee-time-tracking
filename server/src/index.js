require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://employee-time-tracking-tau.vercel.app',
  ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
];
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// Routes
app.use('/api/employees', require('./routes/employees'));
app.use('/api/time-records', require('./routes/timeRecords'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sheets', require('./routes/sheets'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
