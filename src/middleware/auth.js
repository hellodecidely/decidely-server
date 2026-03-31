import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';

export const protect = async (req, res, next) => {
  // ✅ Define public routes that don't require authentication
  const publicPaths = [
    '/auth/login',
    '/auth/register', 
    '/auth/forgot-password'
  ];
  
  // ✅ Check if the current route is a reset password related route
  const isResetPasswordRoute = req.path.startsWith('/auth/validate-reset-token') || 
                                req.path.startsWith('/auth/reset-password');
  
  // ✅ Check if route is in public paths
  const isPublicPath = publicPaths.includes(req.path);
  
  // ✅ Skip authentication for reset password routes and public paths
  if (isResetPasswordRoute || isPublicPath) {
    return next();
  }
  
  if (req.path === '/' || req.path === '/health') {
    return next();
  }

  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      });
    }

    req.user = user;
    
    // Add plan and limits to request
    req.plan = user.plan;
    req.planExpiresAt = user.planExpiresAt;
    req.limits = {
      workspaces: user.plan === 'agency' ? 'Unlimited' : (user.plan === 'pro' ? 20 : 2),
      projects: user.plan === 'agency' ? 'Unlimited' : (user.plan === 'pro' ? 20 : 2),
      approvals: user.plan === 'agency' ? 'Unlimited' : (user.plan === 'pro' ? 200 : 20),
      fileSize: user.plan === 'agency' ? 60 : (user.plan === 'pro' ? 40 : 20)
    };
    
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route',
    });
  }
};

// Magic link specific middleware
export const magicLinkAuth = async (req, res, next) => {
  const { token } = req.params;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Magic link token required',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.email || !decoded.projectId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid magic link',
      });
    }

    req.client = {
      email: decoded.email,
      projectId: decoded.projectId,
      isGuest: true,
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Magic link is invalid or expired',
    });
  }
};

// Check if user is workspace owner or member
export const checkWorkspaceAccess = (roles = []) => {
  return async (req, res, next) => {
    try {
      // If using magic link, allow access to specific project
      if (req.client) {
        return next();
      }

      // For authenticated users
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
      }

      // Add more specific workspace checks here as needed
      next();
    } catch (error) {
      next(error);
    }
  };
};

