import express from 'express';
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  getAllUserProjects,
  getProjectWithApprovals
} from '../controllers/projectController.js';
import { protect } from '../middleware/auth.js';
import { checkProjectLimit } from '../middleware/usageCheck.js';

const router = express.Router();

// All routes require authentication
router.use(protect);


// Get all projects for current user
router.get('/', getAllUserProjects);
router.get('/:id/with-approvals', getProjectWithApprovals);

// Projects within a workspace
router.post('/workspaces/:workspaceId/projects', protect, checkProjectLimit, createProject);
router.get('/workspaces/:workspaceId/projects', getProjects);

// Single project operations
router.route('/:id')
  .get(getProject)
  .put(updateProject)
  .delete(deleteProject);

export default router;