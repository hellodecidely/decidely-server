// middleware/checkPlanExpiry.js
import User from '../models/User.js';

export const checkPlanExpiry = async (req, res, next) => {
  try {
    // Skip for non-authenticated routes
    if (!req.user) return next();

    const user = await User.findById(req.user.id);
    
    // Check if plan is expired
    if (user.plan !== 'free' && user.planExpiresAt && user.planExpiresAt < new Date()) {
      // Plan expired - downgrade to free
      user.plan = 'free';
      user.planExpiresAt = null;
      await user.save();
      
      // Force logout by clearing token
      return res.status(401).json({
        success: false,
        error: 'Your plan has expired. Please login again.',
        code: 'PLAN_EXPIRED'
      });
    }
    
    next();
  } catch (error) {
    console.error('Plan expiry check error:', error);
    next(error);
  }
};