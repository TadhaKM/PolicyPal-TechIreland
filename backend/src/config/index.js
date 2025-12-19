/**
 * Application Configuration
 * Centralizes all environment variables and configuration settings
 */

require('dotenv').config();

const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiUrl: process.env.API_URL || 'http://localhost:3000',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'development-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // AWS S3
  s3: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'eu-west-1',
    bucket: process.env.S3_BUCKET || 'policypal-documents',
    endpoint: process.env.S3_ENDPOINT,
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    extractionModel: process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4-1106-preview',
    validationModel: process.env.OPENAI_VALIDATION_MODEL || 'gpt-3.5-turbo-1106',
  },

  // Government Data APIs
  externalData: {
    floodDataUrl: process.env.FLOOD_DATA_URL,
    crimeStatsUrl: process.env.CRIME_STATS_URL,
    eircodeApiKey: process.env.EIRCODE_API_KEY,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 min
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },

  // CORS
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  },

  // Feature Flags
  features: {
    enableOcr: process.env.ENABLE_OCR === 'true',
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 50,
    pdfRetentionDays: parseInt(process.env.PDF_RETENTION_DAYS, 10) || 30,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
  },

  // Plan Limits
  planLimits: {
    FREE: {
      maxPolicies: 1,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      features: ['basic_dashboard', 'basic_claims_assistant'],
    },
    PREMIUM: {
      maxPolicies: -1, // unlimited
      maxFileSize: 50 * 1024 * 1024, // 50MB
      features: [
        'basic_dashboard',
        'advanced_dashboard',
        'basic_claims_assistant',
        'advanced_claims_assistant',
        'risk_radar',
        'action_plan',
        'multi_policy',
        'priority_support',
      ],
    },
    ENTERPRISE: {
      maxPolicies: -1,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      features: ['*'], // all features
    },
  },
};

// Validate required configuration
const requiredEnvVars = ['DATABASE_URL'];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0 && config.env !== 'test') {
  console.warn(`Warning: Missing environment variables: ${missingEnvVars.join(', ')}`);
}

module.exports = config;
