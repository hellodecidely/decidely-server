// server/src/routes/client.js
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

// ✅ PUBLIC ROUTES - No authentication required (for magic links)
// These should be placed BEFORE router.use(protect)
// Add this if you have a public endpoint for validating magic links
// router.get('/magic/validate/:token', validateMagicLink);

// 🔒 PROTECTED ROUTES - Require authentication
router.use(protect);

// Project-specific client routes
router.post('/projects/:projectId/clients', addClientToProject);
router.get('/projects/:projectId/clients', getProjectClients);
router.put('/projects/:projectId/clients/:clientId', updateClient);
router.delete('/projects/:projectId/clients/:clientId', removeClientFromProject);

// Global client management
router.get('/clients', getAllClients);

export default router;