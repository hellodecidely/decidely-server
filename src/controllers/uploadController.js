// controllers/uploadController.js
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import User from '../models/User.js';
import Approval from '../models/ApprovalItem.js';

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate a signed URL for direct browser-to-S3 upload
 * @route POST /api/uploads/get-upload-url
 * @access Private
 */
export const getUploadUrl = async (req, res) => {
  try {
    const { fileName, fileType, fileSize } = req.body;
    const userId = req.user.id;

    // ... validation code ...

    // Determine folder based on file type
    let folder = 'other';
    if (fileType.startsWith('image/')) folder = 'images';
    else if (fileType.startsWith('video/')) folder = 'videos';
    else if (fileType === 'application/pdf') folder = 'documents';

    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.]/g, '-');
    
    // ✅ NEW: Organized by file type, not user ID
    const key = `approvals/${folder}/${timestamp}-${sanitizedFileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      Metadata: {
        userId,      // Still store userId in metadata
        fileName
      }
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    res.json({
      success: true,
      data: {
        uploadUrl,
        publicUrl,
        key,
        expiresIn: 900
      }
    });

    console.log('🔑 BACKEND - Generated key:', key);
    console.log('🔑 BACKEND - Full response:', { uploadUrl, publicUrl, key });

  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate upload URL'
    });
  }
};

/**
 * Confirm upload and attach to approval
 * @route POST /api/uploads/confirm-upload
 * @access Private
 */
export const confirmUpload = async (req, res) => {
  try {
    const { approvalId, key, publicUrl, fileName, fileType, fileSize } = req.body;
    const userId = req.user.id;

    if (!approvalId || !key || !publicUrl) {
      return res.status(400).json({
        success: false,
        error: 'approvalId, key, and publicUrl are required'
      });
    }

    // Find the approval
    const approval = await Approval.findById(approvalId);
    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval not found'
      });
    }

    // Verify user owns this approval
    if (approval.createdBy.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to modify this approval'
      });
    }

    // Determine file category
    let category = 'other';
    if (fileType.startsWith('image/')) category = 'image';
    else if (fileType.startsWith('video/')) category = 'video';
    else if (fileType === 'application/pdf') category = 'document';

    // Update approval with media info
    approval.media = {
      url: publicUrl,
      key,
      filename: fileName,
      mimetype: fileType,
      size: fileSize,
      category,
      uploadedAt: new Date()
    };

    // Update approval type if it was text
    if (approval.type === 'text') {
      approval.type = category;
    }

    // Add to activity log
    approval.activityLog.push({
      action: 'File Uploaded',
      user: req.user.name || req.user.email,
      timestamp: new Date(),
      details: `File uploaded: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)}MB)`
    });

    await approval.save();

    // Increment user's approval count (if not already done)
    const user = await User.findById(userId);
    await user.incrementApprovalCount();

    res.json({
      success: true,
      data: approval
    });

  } catch (error) {
    console.error('Error confirming upload:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to confirm upload'
    });
  }
};

/**
 * Delete file from S3
 * @route DELETE /api/uploads/file/:key
 * @access Private
 */
export const deleteFile = async (req, res) => {
  try {
    const { key } = req.params;
    const userId = req.user.id;

    // Find approval with this key to verify ownership
    const approval = await Approval.findOne({ 'media.key': key });
    if (approval && approval.createdBy.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this file'
      });
    }

    // Create delete command
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);

    // If file was attached to an approval, remove the media reference
    if (approval) {
      approval.media = undefined;
      await approval.save();
    }

    res.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete file'
    });
  }
};

/**
 * Get upload status for a file
 * @route GET /api/uploads/status/:key
 * @access Private
 */
export const getUploadStatus = async (req, res) => {
  try {
    const { key } = req.params;

    // Check if file exists in S3 (optional - can be implemented if needed)
    // For now, just check if it's attached to an approval
    const approval = await Approval.findOne({ 'media.key': key });

    res.json({
      success: true,
      data: {
        exists: !!approval,
        attached: !!approval,
        approvalId: approval?._id
      }
    });

  } catch (error) {
    console.error('Error checking upload status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check upload status'
    });
  }
};