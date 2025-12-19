/**
 * Analysis Queue Service
 * BullMQ-based job queue for async policy analysis
 */

const { Queue, QueueEvents } = require('bullmq');
const { getBullMQConnection } = require('../../config/redis');
const logger = require('../../utils/logger');

const QUEUE_NAME = 'policy-analysis';

// Create queue instance
const analysisQueue = new Queue(QUEUE_NAME, getBullMQConnection());

// Queue events for monitoring
const queueEvents = new QueueEvents(QUEUE_NAME, getBullMQConnection());

// Event listeners
queueEvents.on('completed', ({ jobId, returnvalue }) => {
  logger.info(`Job ${jobId} completed`, { returnvalue });
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Job ${jobId} failed: ${failedReason}`);
});

queueEvents.on('progress', ({ jobId, data }) => {
  logger.debug(`Job ${jobId} progress: ${data}%`);
});

/**
 * Add an analysis job to the queue
 */
async function addAnalysisJob(policyId, userId, options = {}) {
  const jobData = {
    policyId,
    userId,
    type: options.type || 'ANALYZE',
    priority: options.priority || 'normal',
    createdAt: new Date().toISOString(),
  };

  const jobOptions = {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      count: 50, // Keep last 50 failed jobs
    },
    priority: options.priority === 'high' ? 1 : 10,
  };

  const job = await analysisQueue.add('analyze', jobData, jobOptions);

  logger.info(`Analysis job queued: ${job.id} for policy ${policyId}`);

  return {
    jobId: job.id,
    policyId,
  };
}

/**
 * Add a reanalysis job (uses new rules/model versions)
 */
async function addReanalysisJob(policyId, userId, options = {}) {
  return addAnalysisJob(policyId, userId, {
    ...options,
    type: 'REANALYZE',
  });
}

/**
 * Get job status
 */
async function getJobStatus(jobId) {
  const job = await analysisQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress || 0;

  return {
    id: job.id,
    state,
    progress,
    data: job.data,
    failedReason: job.failedReason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    attemptsMade: job.attemptsMade,
  };
}

/**
 * Cancel a job if it's still waiting
 */
async function cancelJob(jobId) {
  const job = await analysisQueue.getJob(jobId);

  if (!job) {
    return false;
  }

  const state = await job.getState();

  if (state === 'waiting' || state === 'delayed') {
    await job.remove();
    return true;
  }

  return false;
}

/**
 * Get queue statistics
 */
async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    analysisQueue.getWaitingCount(),
    analysisQueue.getActiveCount(),
    analysisQueue.getCompletedCount(),
    analysisQueue.getFailedCount(),
    analysisQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
  };
}

/**
 * Clean up old jobs
 */
async function cleanOldJobs(graceMs = 24 * 60 * 60 * 1000) {
  await analysisQueue.clean(graceMs, 1000, 'completed');
  await analysisQueue.clean(graceMs, 1000, 'failed');
}

/**
 * Close queue connections
 */
async function closeQueue() {
  await analysisQueue.close();
  await queueEvents.close();
  logger.info('Analysis queue closed');
}

module.exports = {
  analysisQueue,
  addAnalysisJob,
  addReanalysisJob,
  getJobStatus,
  cancelJob,
  getQueueStats,
  cleanOldJobs,
  closeQueue,
};
