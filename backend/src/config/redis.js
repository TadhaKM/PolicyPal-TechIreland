/**
 * Redis Configuration
 * For BullMQ job queue and caching
 */

const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

let redisClient = null;
let redisSubscriber = null;

function createRedisClient(options = {}) {
  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...options,
  });

  client.on('connect', () => {
    logger.info('Redis connected');
  });

  client.on('error', (error) => {
    logger.error('Redis error:', error);
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return client;
}

function getRedisClient() {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

function getRedisSubscriber() {
  if (!redisSubscriber) {
    redisSubscriber = createRedisClient();
  }
  return redisSubscriber;
}

// BullMQ connection options
function getBullMQConnection() {
  return {
    connection: {
      host: new URL(config.redisUrl).hostname || 'localhost',
      port: parseInt(new URL(config.redisUrl).port, 10) || 6379,
    },
  };
}

async function closeRedisConnections() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
  if (redisSubscriber) {
    await redisSubscriber.quit();
    redisSubscriber = null;
  }
  logger.info('Redis connections closed');
}

module.exports = {
  createRedisClient,
  getRedisClient,
  getRedisSubscriber,
  getBullMQConnection,
  closeRedisConnections,
};
