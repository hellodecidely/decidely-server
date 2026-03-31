import express from 'express';
import {
  addClientToProject,
  getProjectClients,
  updateClient,
  removeClientFromProject,
  getAllClients,
} from '../controllers/clientController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Project-specific client routes
router.post('/projects/:projectId/clients', addClientToProject);
router.get('/projects/:projectId/clients', getProjectClients);
router.put('/projects/:projectId/clients/:clientId', updateClient);
router.delete('/projects/:projectId/clients/:clientId', removeClientFromProject);

// Global client management
router.get('/clients', getAllClients);

export default router;