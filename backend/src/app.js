/**
 * PolicyPal Backend Application
 * Main Express server entry point
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { closeRedisConnections } = require('./config/redis');
const logger = require('./utils/logger');

// Middleware
const {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  securityHeaders,
  sanitizeRequest,
  validateFile,
  requestLogger,
  errorHandler,
  notFoundHandler,
} = require('./middleware/security');

// Routes
const authRoutes = require('./routes/auth');
const policyRoutes = require('./routes/policies');
const jobRoutes = require('./routes/jobs');
const riskRoutes = require('./routes/risk');

// Create Express app
const app = express();

// Trust proxy (for rate limiting behind load balancer)
app.set('trust proxy', 1);

// Security headers
app.use(securityHeaders);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (config.cors.origins.includes(origin) || config.env === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Compression
app.use(compression());

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request sanitization
app.use(sanitizeRequest);

// Logging
if (config.env !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  }));
  app.use(requestLogger);
}

// General rate limiting
app.use(generalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: require('../package.json').version,
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/auth', authLimiter, authRoutes);
app.use('/me', authRoutes);
app.use('/policies', uploadLimiter, validateFile, policyRoutes);
app.use('/jobs', jobRoutes);
app.use('/risk', riskRoutes);

// Admin routes (could add authentication for admin users)
app.get('/admin/queue/stats', async (req, res) => {
  try {
    const { getQueueStats } = require('./services/queue/analysisQueue');
    const stats = await getQueueStats();
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

// API documentation endpoint
app.get('/api-docs', (req, res) => {
  res.json({
    name: 'PolicyPal API',
    version: '1.0.0',
    description: 'AI-powered insurance policy analysis API',
    endpoints: {
      auth: {
        'POST /auth/signup': 'Register a new user',
        'POST /auth/login': 'Authenticate user',
        'POST /auth/logout': 'Logout user',
        'POST /auth/change-password': 'Change password',
        'GET /me': 'Get current user profile',
        'PATCH /me': 'Update profile',
      },
      policies: {
        'POST /policies/upload': 'Upload a policy PDF',
        'GET /policies': 'List user policies',
        'GET /policies/:id': 'Get policy details',
        'GET /policies/:id/dashboard': 'Get dashboard data',
        'POST /policies/:id/reanalyze': 'Re-run analysis',
        'DELETE /policies/:id': 'Delete policy',
      },
      jobs: {
        'GET /jobs/:id': 'Get job status',
      },
      risk: {
        'GET /risk/flood': 'Get flood risk for coordinates',
        'GET /risk/crime': 'Get crime statistics',
        'GET /risk/all': 'Get all risk data',
        'GET /risk/geocode': 'Geocode an address',
      },
    },
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();

    // Start listening
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.env} mode`);
      logger.info(`API docs available at http://localhost:${config.port}/api-docs`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        await disconnectDatabase();
        await closeRedisConnections();

        logger.info('All connections closed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start if run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
