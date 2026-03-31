import express from 'express';
import { getDashboardStats } from '../controllers/dashboardController.js';
import { protect } from '../middleware/auth.js'; // Change from 'auth' to '{ protect }'

const router = express.Router();
router.use(protect); // Change from 'auth' to 'protect'
router.get('/stats', getDashboardStats);

export default router;