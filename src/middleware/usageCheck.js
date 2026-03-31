// middleware/usageCheck.js
import User from '../models/User.js';

export const checkWorkspaceLimit = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.canCreateWorkspace()) {
      const limit = user.plan === 'pro' ? 20 : 2;
      return res.status(403).json({
        success: false,
        error: user.plan === 'free' 
          ? `Free plan limited to ${limit} workspaces. Upgrade to Pro for more.`
          : `Pro plan limited to ${limit} workspaces. Upgrade to Agency for unlimited.`
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const checkProjectLimit = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.canCreateProject()) {
      const limit = user.plan === 'pro' ? 20 : 2;
      return res.status(403).json({
        success: false,
        error: user.plan === 'free' 
          ? `Free plan limited to ${limit} projects. Upgrade to Pro for more.`
          : `Pro plan limited to ${limit} projects. Upgrade to Agency for unlimited.`
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const checkApprovalLimit = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.canCreateApproval()) {
      const limit = user.plan === 'pro' ? 200 : 20;
      return res.status(403).json({
        success: false,
        error: user.plan === 'free' 
          ? `Free plan limited to ${limit} approvals per month. Upgrade to Pro for more.`
          : `Pro plan limited to ${limit} approvals per month. Upgrade to Agency for unlimited.`
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};