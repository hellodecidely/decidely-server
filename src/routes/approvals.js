import express from 'express';
import {
  createApprovalItem,
  getApprovalItems,
  getApprovalItem,
  updateApprovalItem,
  deleteApprovalItem,
  updateApprovalStatus,
  addComment,
  getApprovalStats,
  getAllApprovals
} from '../controllers/approvalController.js';
import { protect } from '../middleware/auth.js';
import { upload } from '../config/aws.js';
import { checkApprovalLimit } from '../middleware/usageCheck.js';

const router = express.Router();

// Add placeholder functions for magic link routes
const updateStatusViaMagic = async (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Magic link feature not implemented yet'
  });
};

const addCommentViaMagic = async (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Magic link feature not implemented yet'
  });
};

// Protect all regular routes
router.use(protect);

// Approval CRUD operations

router.post('/project/:projectId/approvals', protect, checkApprovalLimit, createApprovalItem);

router.get('/project/:projectId/approvals', getApprovalItems);
router.get('/:id', getApprovalItem);
router.put('/:id', updateApprovalItem);
router.delete('/:id', deleteApprovalItem);
router.get('/', getAllApprovals); // GET /api/approvals

// Status and comments
router.put('/:id/status', updateApprovalStatus);
router.post('/:id/comments', addComment);

// Stats
router.get('/project/:projectId/stats', getApprovalStats);

// Magic link routes (public - no protection)
router.put('/magic/item/:token/:itemId/status', updateStatusViaMagic);
router.post('/magic/item/:token/:itemId/comments', addCommentViaMagic);

export default router;