/**
 * Authentication Middleware
 * JWT-based authentication
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Authenticate JWT token
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, config.jwt.secret);

      // Fetch user from database
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          plan: true,
          policyCount: true,
          createdAt: true,
        },
      });

      if (!user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User not found',
        });
      }

      // Attach user to request
      req.user = user;
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has expired',
        });
      }

      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  return authenticate(req, res, next);
}

/**
 * Require specific plan level
 */
function requirePlan(...allowedPlans) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedPlans.includes(req.user.plan)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This feature requires one of the following plans: ${allowedPlans.join(', ')}`,
      });
    }

    next();
  };
}

/**
 * Check if user has access to a specific feature
 */
function requireFeature(featureName) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    const planLimits = config.planLimits[req.user.plan];

    if (!planLimits) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Unknown plan',
      });
    }

    const hasFeature =
      planLimits.features.includes('*') || planLimits.features.includes(featureName);

    if (!hasFeature) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This feature (${featureName}) is not available on your plan. Please upgrade to access it.`,
        requiredFeature: featureName,
        currentPlan: req.user.plan,
      });
    }

    next();
  };
}

/**
 * Check policy limits for user's plan
 */
async function checkPolicyLimit(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  const planLimits = config.planLimits[req.user.plan];

  // -1 means unlimited
  if (planLimits.maxPolicies === -1) {
    return next();
  }

  // Count user's current policies
  const policyCount = await prisma.policy.count({
    where: {
      userId: req.user.id,
      deletedAt: null,
    },
  });

  if (policyCount >= planLimits.maxPolicies) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `You have reached the maximum number of policies (${planLimits.maxPolicies}) for your plan. Please upgrade to add more policies.`,
      currentCount: policyCount,
      limit: planLimits.maxPolicies,
      currentPlan: req.user.plan,
    });
  }

  next();
}

/**
 * Generate JWT token
 */
function generateToken(userId) {
  return jwt.sign({ userId }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Verify JWT token (utility function)
 */
function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = {
  authenticate,
  optionalAuth,
  requirePlan,
  requireFeature,
  checkPolicyLimit,
  generateToken,
  verifyToken,
};
