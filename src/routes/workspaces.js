import express from 'express';
import {
  createWorkspace,
  getWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  addMember
} from '../controllers/workspaceController.js';
import { protect } from '../middleware/auth.js';
import { checkWorkspaceLimit } from '../middleware/usageCheck.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Create workspace
router.post('/', protect, checkWorkspaceLimit, createWorkspace);

// Get all workspaces for current user
router.get('/', getWorkspaces);

// Get, update, delete single workspace
router.route('/:id')
  .get(getWorkspace)
  .put(updateWorkspace)
  .delete(deleteWorkspace);

// Add member to workspace
router.post('/:id/members', addMember);

export default router;