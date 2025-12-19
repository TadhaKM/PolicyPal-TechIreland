/**
 * Policy Controller
 * Handles policy upload, retrieval, and management
 */

const { prisma } = require('../config/database');
const storage = require('../services/storage');
const { addAnalysisJob, addReanalysisJob, getJobStatus } = require('../services/queue/analysisQueue');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * POST /policies/upload
 * Upload a new policy PDF for analysis
 */
async function uploadPolicy(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No file uploaded',
      });
    }

    const file = req.file;
    const userId = req.user.id;

    // Validate file type
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Only PDF files are allowed',
      });
    }

    // Check file size limit based on plan
    const planLimits = config.planLimits[req.user.plan];
    if (file.size > planLimits.maxFileSize) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `File size exceeds limit for your plan (${planLimits.maxFileSize / 1024 / 1024}MB)`,
      });
    }

    // Generate storage key and upload to S3
    const storageKey = storage.generateKey(userId, file.originalname, 'policies');
    const uploadResult = await storage.uploadFile(file.buffer, storageKey, file.mimetype);

    // Create policy record
    const policy = await prisma.policy.create({
      data: {
        userId,
        sourceFileUrl: uploadResult.url,
        filename: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        status: 'PROCESSING',
        policyType: req.body.policyType || 'HOME',
      },
    });

    // Create job record
    const job = await prisma.job.create({
      data: {
        policyId: policy.id,
        type: 'ANALYZE',
        status: 'QUEUED',
      },
    });

    // Add to analysis queue
    const queueResult = await addAnalysisJob(policy.id, userId, {
      priority: req.user.plan === 'PREMIUM' ? 'high' : 'normal',
    });

    // Update policy count for user
    await prisma.user.update({
      where: { id: userId },
      data: { policyCount: { increment: 1 } },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'POLICY_UPLOADED',
        resource: 'policy',
        resourceId: policy.id,
        details: {
          filename: file.originalname,
          fileSize: file.size,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    logger.info(`Policy uploaded: ${policy.id} by user ${userId}`);

    res.status(201).json({
      message: 'Policy uploaded successfully',
      policy: {
        id: policy.id,
        filename: policy.filename,
        status: policy.status,
        uploadedAt: policy.uploadedAt,
      },
      job: {
        id: job.id,
        queueId: queueResult.jobId,
        status: job.status,
      },
    });
  } catch (error) {
    logger.error('Upload policy error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to upload policy',
    });
  }
}

/**
 * GET /policies
 * List user's policies
 */
async function listPolicies(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status, type } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {
      userId,
      deletedAt: null,
      ...(status && { status }),
      ...(type && { policyType: type }),
    };

    const [policies, total] = await Promise.all([
      prisma.policy.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          filename: true,
          policyType: true,
          status: true,
          insurer: true,
          productName: true,
          policyNumber: true,
          periodStart: true,
          periodEnd: true,
          uploadedAt: true,
          updatedAt: true,
        },
      }),
      prisma.policy.count({ where }),
    ]);

    res.json({
      policies,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    logger.error('List policies error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list policies',
    });
  }
}

/**
 * GET /policies/:id
 * Get a specific policy
 */
async function getPolicy(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const policy = await prisma.policy.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
      include: {
        extracts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        riskAssessments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        guidanceRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!policy) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Policy not found',
      });
    }

    // Generate presigned URL for download
    let downloadUrl = null;
    if (policy.sourceFileUrl) {
      const key = storage.getKeyFromUrl(policy.sourceFileUrl);
      downloadUrl = await storage.getPresignedUrl(key, 3600); // 1 hour
    }

    res.json({
      policy: {
        ...policy,
        downloadUrl,
        latestExtract: policy.extracts[0] || null,
        latestRiskAssessment: policy.riskAssessments[0] || null,
        latestGuidance: policy.guidanceRuns[0] || null,
        recentJobs: policy.jobs,
        extracts: undefined,
        riskAssessments: undefined,
        guidanceRuns: undefined,
        jobs: undefined,
      },
    });
  } catch (error) {
    logger.error('Get policy error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get policy',
    });
  }
}

/**
 * GET /policies/:id/dashboard
 * Get dashboard-ready data for a policy
 */
async function getPolicyDashboard(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const policy = await prisma.policy.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
      include: {
        extracts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        riskAssessments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        guidanceRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!policy) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Policy not found',
      });
    }

    if (policy.status !== 'READY') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Policy analysis is not complete yet',
        status: policy.status,
      });
    }

    const extract = policy.extracts[0];
    const riskAssessment = policy.riskAssessments[0];
    const guidance = policy.guidanceRuns[0];

    // Build dashboard response
    const dashboard = {
      summary: {
        policyId: policy.id,
        insurer: policy.insurer,
        productName: policy.productName,
        policyNumber: policy.policyNumber,
        period: {
          start: policy.periodStart,
          end: policy.periodEnd,
        },
        address: policy.addressNormalized || policy.addressRaw,
        keyPoints: extract?.extractionJson?.summary?.keyPoints || [],
      },
      coverageBreakdown: extract?.extractionJson?.coverages || [],
      exclusions: extract?.extractionJson?.exclusions || [],
      riskRadar: riskAssessment?.riskResultsJson?.risks || [],
      actions: guidance?.guidanceJson?.actions || [],
      questions: guidance?.guidanceJson?.questions || [],
      gaps: guidance?.guidanceJson?.gaps || [],
      metadata: {
        extractionVersion: extract?.modelVersion,
        pipelineVersion: extract?.pipelineVersion,
        rulesetVersion: guidance?.rulesetVersion,
        datasetVersions: riskAssessment?.datasetVersions,
        analyzedAt: extract?.createdAt,
      },
    };

    res.json({ dashboard });
  } catch (error) {
    logger.error('Get policy dashboard error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get policy dashboard',
    });
  }
}

/**
 * POST /policies/:id/reanalyze
 * Re-run analysis on a policy
 */
async function reanalyzePolicy(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const policy = await prisma.policy.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!policy) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Policy not found',
      });
    }

    // Update policy status
    await prisma.policy.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    // Create new job
    const job = await prisma.job.create({
      data: {
        policyId: policy.id,
        type: 'REANALYZE',
        status: 'QUEUED',
      },
    });

    // Add to queue
    const queueResult = await addReanalysisJob(policy.id, userId, {
      priority: req.user.plan === 'PREMIUM' ? 'high' : 'normal',
    });

    logger.info(`Policy reanalysis queued: ${policy.id}`);

    res.json({
      message: 'Reanalysis started',
      job: {
        id: job.id,
        queueId: queueResult.jobId,
        status: job.status,
      },
    });
  } catch (error) {
    logger.error('Reanalyze policy error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start reanalysis',
    });
  }
}

/**
 * DELETE /policies/:id
 * Soft delete a policy
 */
async function deletePolicy(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const policy = await prisma.policy.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!policy) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Policy not found',
      });
    }

    // Soft delete
    await prisma.policy.update({
      where: { id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });

    // Update policy count
    await prisma.user.update({
      where: { id: userId },
      data: { policyCount: { decrement: 1 } },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'POLICY_DELETED',
        resource: 'policy',
        resourceId: policy.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    logger.info(`Policy deleted: ${policy.id}`);

    res.json({
      message: 'Policy deleted successfully',
    });
  } catch (error) {
    logger.error('Delete policy error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete policy',
    });
  }
}

/**
 * GET /jobs/:id
 * Get job status
 */
async function getJob(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const job = await prisma.job.findFirst({
      where: { id },
      include: {
        policy: {
          select: {
            id: true,
            userId: true,
            filename: true,
            status: true,
          },
        },
      },
    });

    if (!job || job.policy.userId !== userId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Job not found',
      });
    }

    res.json({
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        phase: job.phase,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        policy: {
          id: job.policy.id,
          filename: job.policy.filename,
          status: job.policy.status,
        },
      },
    });
  } catch (error) {
    logger.error('Get job error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get job status',
    });
  }
}

module.exports = {
  uploadPolicy,
  listPolicies,
  getPolicy,
  getPolicyDashboard,
  reanalyzePolicy,
  deletePolicy,
  getJob,
};
