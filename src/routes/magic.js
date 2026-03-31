import express from 'express';
import {
  generateMagicLink,
  validateMagicLink,
  getAccessViaMagicLink,
  submitDecisionViaMagic,
  addCommentViaMagic,
  getAllMagicLinks,
  getMagicLinkById,
  revokeMagicLink,
  resendMagicLinkEmail,
  getMagicLinkStats
} from '../controllers/magicLinkController.js';
import { protect } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for public routes (prevent abuse)
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  }
});

// Apply rate limiting to public routes
router.use('/validate', publicLimiter);
router.use('/access', publicLimiter);
router.use('/decision', publicLimiter);
router.use('/comment', publicLimiter);

// ====================================
// PUBLIC ROUTES (No authentication)
// ====================================

// Validate magic link
router.get('/validate/:token', validateMagicLink);

// Get project and approvals via magic link
router.get('/access/:token', getAccessViaMagicLink);

// Submit decision via magic link
router.post('/decision/:token', submitDecisionViaMagic);

// Add comment via magic link
router.post('/comment/:token', addCommentViaMagic);

// ====================================
// PROTECTED ROUTES (Agency only)
// ====================================

// Apply authentication to all routes below
router.use(protect);

// Generate magic link
router.post('/generate', generateMagicLink);

// Get all magic links (with filters)
router.get('/links', getAllMagicLinks);

// Get magic link stats
router.get('/stats', getMagicLinkStats);

// Get single magic link
router.get('/links/:id', getMagicLinkById);

// Revoke magic link
router.delete('/links/:id', revokeMagicLink);

// Resend magic link email
router.post('/links/:id/resend', resendMagicLinkEmail);

export default router;