/**
 * Analysis Worker
 * Background job processor for policy analysis
 */

const { Worker } = require('bullmq');
const { getBullMQConnection } = require('../config/redis');
const { prisma, connectDatabase } = require('../config/database');
const storage = require('../services/storage');
const { extractFromPdf, chunkDocument, extractMetadataHints } = require('../services/document/pdfExtractor');
const { extractWithGPT4, calculateConfidence } = require('../services/document/llmExtractor');
const { getAllRiskData, geocodeAddress } = require('../services/risk/riskDataService');
const { runRulesEngine } = require('../services/rules/rulesEngine');
const logger = require('../utils/logger');

const QUEUE_NAME = 'policy-analysis';

/**
 * Update job progress in database
 */
async function updateJobProgress(jobId, progress, phase) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      progress,
      phase,
      ...(progress === 0 && { startedAt: new Date() }),
    },
  });
}

/**
 * Mark job as completed
 */
async function completeJob(jobId) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      progress: 100,
      phase: 'Complete',
      completedAt: new Date(),
    },
  });
}

/**
 * Mark job as failed
 */
async function failJob(jobId, error) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'FAILED',
      errorMessage: error.message,
      errorStack: error.stack,
      completedAt: new Date(),
    },
  });
}

/**
 * Main analysis pipeline
 */
async function analyzePolicy(job) {
  const { policyId, userId, type } = job.data;

  logger.info(`Starting analysis for policy ${policyId}`);

  // Find the job record in database
  const dbJob = await prisma.job.findFirst({
    where: {
      policyId,
      type,
      status: 'QUEUED',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!dbJob) {
    throw new Error('Job record not found in database');
  }

  const jobId = dbJob.id;

  try {
    // Mark as running
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    await prisma.policy.update({
      where: { id: policyId },
      data: { status: 'PROCESSING' },
    });

    // Step 1: Get policy and download PDF
    await updateJobProgress(jobId, 5, 'Downloading document');
    job.updateProgress(5);

    const policy = await prisma.policy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      throw new Error('Policy not found');
    }

    const pdfKey = storage.getKeyFromUrl(policy.sourceFileUrl);
    const pdfBuffer = await storage.getFile(pdfKey);

    // Step 2: Extract text from PDF
    await updateJobProgress(jobId, 15, 'Extracting text');
    job.updateProgress(15);

    const pdfExtraction = await extractFromPdf(pdfBuffer);

    // Update policy with page count and scan status
    await prisma.policy.update({
      where: { id: policyId },
      data: {
        pageCount: pdfExtraction.pageCount,
        isScanned: pdfExtraction.isScanned,
        status: 'EXTRACTING',
      },
    });

    // Step 3: Chunk document for LLM processing
    await updateJobProgress(jobId, 25, 'Preparing for analysis');
    job.updateProgress(25);

    const chunks = chunkDocument(pdfExtraction.pages);
    const metadataHints = extractMetadataHints(pdfExtraction.pages);

    // Step 4: LLM extraction
    await updateJobProgress(jobId, 35, 'AI analysis in progress');
    job.updateProgress(35);

    const llmResult = await extractWithGPT4(chunks, metadataHints);
    const confidence = calculateConfidence(llmResult.extraction);

    // Update policy with extracted metadata
    await prisma.policy.update({
      where: { id: policyId },
      data: {
        insurer: llmResult.extraction.metadata?.insurer,
        productName: llmResult.extraction.metadata?.productName,
        policyNumber: llmResult.extraction.metadata?.policyNumber,
        addressRaw: llmResult.extraction.metadata?.propertyAddress,
        eircode: llmResult.extraction.metadata?.eircode,
        periodStart: llmResult.extraction.metadata?.periodStart
          ? new Date(llmResult.extraction.metadata.periodStart)
          : null,
        periodEnd: llmResult.extraction.metadata?.periodEnd
          ? new Date(llmResult.extraction.metadata.periodEnd)
          : null,
        status: 'ANALYZING',
      },
    });

    // Save extraction result
    await prisma.policyExtract.create({
      data: {
        policyId,
        modelVersion: llmResult.modelVersion,
        pipelineVersion: 'v1.0.0',
        extractionJson: llmResult.extraction,
        confidenceScores: confidence,
        needsReview: confidence.needsReview,
        tokensUsed: llmResult.tokensUsed,
        processingTimeMs: llmResult.processingTimeMs,
      },
    });

    // Step 5: Geocode address for risk checks
    await updateJobProgress(jobId, 55, 'Locating property');
    job.updateProgress(55);

    let location = null;
    const address = llmResult.extraction.metadata?.propertyAddress;
    const eircode = llmResult.extraction.metadata?.eircode;

    if (address || eircode) {
      location = await geocodeAddress(address, eircode);

      if (location) {
        await prisma.policy.update({
          where: { id: policyId },
          data: {
            addressNormalized: location.displayName,
            latitude: location.latitude,
            longitude: location.longitude,
          },
        });
      }
    }

    // Step 6: Risk data cross-check
    await updateJobProgress(jobId, 65, 'Checking risk data');
    job.updateProgress(65);

    let riskData = null;
    if (location) {
      riskData = await getAllRiskData(location.latitude, location.longitude, eircode);

      // Save risk assessment
      await prisma.riskAssessment.create({
        data: {
          policyId,
          datasetVersions: {
            flood: riskData.flood?.datasetVersion,
            crime: riskData.crime?.datasetVersion,
            coastal: riskData.coastal?.datasetVersion,
            subsidence: riskData.subsidence?.datasetVersion,
          },
          riskResultsJson: riskData,
          latitude: location.latitude,
          longitude: location.longitude,
          eircode,
        },
      });
    }

    // Step 7: Run rules engine
    await updateJobProgress(jobId, 80, 'Generating recommendations');
    job.updateProgress(80);

    const guidance = await runRulesEngine(llmResult.extraction, riskData || {});

    // Save guidance run
    await prisma.guidanceRun.create({
      data: {
        policyId,
        rulesetVersion: guidance.rulesetVersion,
        inputsHash: guidance.inputsHash,
        guidanceJson: {
          gaps: guidance.gaps,
          actions: guidance.actions,
          questions: guidance.questions,
        },
        gapsCount: guidance.gaps.length,
        actionsCount: guidance.actions.length,
        questionsCount: guidance.questions.length,
      },
    });

    // Step 8: Finalize
    await updateJobProgress(jobId, 95, 'Finalizing');
    job.updateProgress(95);

    await prisma.policy.update({
      where: { id: policyId },
      data: { status: 'READY' },
    });

    await completeJob(jobId);
    job.updateProgress(100);

    logger.info(`Analysis completed for policy ${policyId}`);

    return {
      policyId,
      status: 'completed',
      gapsFound: guidance.gaps.length,
      actionsGenerated: guidance.actions.length,
    };
  } catch (error) {
    logger.error(`Analysis failed for policy ${policyId}:`, error);

    await failJob(jobId, error);

    await prisma.policy.update({
      where: { id: policyId },
      data: {
        status: 'ERROR',
        processingError: error.message,
      },
    });

    throw error;
  }
}

/**
 * Create and start the worker
 */
async function startWorker() {
  // Ensure database is connected
  await connectDatabase();

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      return analyzePolicy(job);
    },
    {
      ...getBullMQConnection(),
      concurrency: 2, // Process 2 jobs at a time
      limiter: {
        max: 10,
        duration: 60000, // 10 jobs per minute max
      },
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Job ${job.id} failed:`, error.message);
  });

  worker.on('error', (error) => {
    logger.error('Worker error:', error);
  });

  logger.info('Analysis worker started');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down worker...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down worker...');
    await worker.close();
    process.exit(0);
  });

  return worker;
}

// Start worker if run directly
if (require.main === module) {
  startWorker().catch((error) => {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  });
}

module.exports = { startWorker, analyzePolicy };
