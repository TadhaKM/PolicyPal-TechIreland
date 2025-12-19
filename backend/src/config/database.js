/**
 * Database Configuration
 * Prisma client singleton
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error', 'warn'],
  });
} else {
  // In development, reuse the client across hot reloads
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = global.__prisma;
}

// Connection handling
async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}

async function disconnectDatabase() {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase,
};
