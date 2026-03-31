// routes/auth.js
import express from 'express';
import {
  register,
  login,
  getMe,
  updateProfile,
  getUserUsage,
  checkTokenStatus,
  validateToken,
  getCurrentPlan,
  forgotPassword,
  resetPassword,
  validateResetToken,
  changePassword
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { checkPlanExpiry } from '../middleware/checkPlanExpiry.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.get('/validate-reset-token/:token', validateResetToken);
router.post('/change-password', protect, changePassword);

// Protected routes - apply both protect and checkTokenVersion
router.get('/me',protect, checkPlanExpiry, getMe);
router.put('/update', protect, checkPlanExpiry, updateProfile);
router.get('/usage', protect, checkPlanExpiry, getUserUsage);
router.get('/validate', protect, validateToken);
router.get('/current-plan', protect, getCurrentPlan);

router.get('/check-token', protect, checkTokenStatus);

export default router;