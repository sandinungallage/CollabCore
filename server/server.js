require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security middleware
app.use(helmet());
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5000'
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.some(o => o === '*' || o === origin) || 
                        origin.endsWith('.vercel.app');
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);


// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 100, // Allow high request volume in dev mode
  message: {
    success: false,
    message: 'Too many requests, please try again after 15 minutes',
  },
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Static uploads
app.use('/uploads', express.static('uploads'));

// Mount routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/users', require('./routes/users'));
app.use('/api/v1/mentors', require('./routes/mentors'));
app.use('/api/v1/teams', require('./routes/teams'));
app.use('/api/v1/projects', require('./routes/projects'));
app.use('/api/v1/tasks', require('./routes/tasks'));
app.use('/api/v1/milestones', require('./routes/milestones'));
app.use('/api/v1/evaluations', require('./routes/evaluations'));
app.use('/api/v1/conflicts', require('./routes/conflicts'));
app.use('/api/v1/notifications', require('./routes/notifications'));
app.use('/api/v1/analytics', require('./routes/analytics'));

// Health check
app.get('/api/v1/health', async (req, res) => {
  const mongoose = require('mongoose');
  const { isMlServiceHealthy } = require('./utils/mlClient');

  const dbOk = mongoose.connection.readyState === 1;
  let mlOk = false;
  try {
    mlOk = await isMlServiceHealthy();
  } catch (_) {
    mlOk = false;
  }

  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    status,
    services: {
      api:      'ok',
      database: dbOk ? 'ok' : 'disconnected',
      ml:       mlOk ? 'ok' : 'degraded',
    },
    message: 'CollabCore API health check',
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  connectDB();
});


module.exports = app;
