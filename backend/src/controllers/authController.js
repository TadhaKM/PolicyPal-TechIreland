/**
 * Authentication Controller
 * Handles user signup, login, logout, and profile
 */

const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /auth/signup
 * Register a new user
 */
async function signup(req, res) {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'An account with this email already exists',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        hashedPassword,
        firstName,
        lastName,
        plan: 'FREE',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        plan: true,
        createdAt: true,
      },
    });

    // Generate token
    const token = generateToken(user.id);

    logger.info(`User signed up: ${user.email}`);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_SIGNUP',
        resource: 'user',
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.status(201).json({
      message: 'Account created successfully',
      user,
      token,
    });
  } catch (error) {
    logger.error('Signup error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create account',
    });
  }
}

/**
 * POST /auth/login
 * Authenticate user and return token
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.hashedPassword);

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate token
    const token = generateToken(user.id);

    logger.info(`User logged in: ${user.email}`);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        resource: 'user',
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        plan: user.plan,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to login',
    });
  }
}

/**
 * POST /auth/logout
 * Logout user (mainly for audit logging, as JWT is stateless)
 */
async function logout(req, res) {
  try {
    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'USER_LOGOUT',
        resource: 'user',
        resourceId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    logger.info(`User logged out: ${req.user.email}`);

    res.json({
      message: 'Logout successful',
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to logout',
    });
  }
}

/**
 * GET /me
 * Get current user profile
 */
async function getProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        plan: true,
        policyCount: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            policies: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    res.json({
      user: {
        ...user,
        policyCount: user._count.policies,
        _count: undefined,
      },
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get profile',
    });
  }
}

/**
 * PATCH /me
 * Update current user profile
 */
async function updateProfile(req, res) {
  try {
    const { firstName, lastName } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        plan: true,
        createdAt: true,
      },
    });

    logger.info(`User profile updated: ${user.email}`);

    res.json({
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update profile',
    });
  }
}

/**
 * POST /auth/change-password
 * Change user password
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.hashedPassword);

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Current password is incorrect',
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { hashedPassword },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'PASSWORD_CHANGED',
        resource: 'user',
        resourceId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    logger.info(`User changed password: ${user.email}`);

    res.json({
      message: 'Password changed successfully',
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to change password',
    });
  }
}

module.exports = {
  signup,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
};
