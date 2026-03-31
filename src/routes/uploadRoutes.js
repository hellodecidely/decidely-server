// routes/uploadRoutes.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getUploadUrl,
  confirmUpload,
  deleteFile,
  getUploadStatus
} from '../controllers/uploadController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get signed URL for direct upload
router.post('/get-upload-url', getUploadUrl);

// Confirm upload and attach to approval
router.post('/confirm-upload', confirmUpload);

// Delete file from S3
router.delete('/file/:key', deleteFile);

// Check upload status
router.get('/status/:key', getUploadStatus);

export default router;