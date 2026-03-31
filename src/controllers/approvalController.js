import mongoose from 'mongoose';
import Approval from '../models/ApprovalItem.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import Comment from '../models/Comment.js';
import { upload, getFileCategory, deleteFromS3 } from '../config/aws.js'; // Import AWS config

// controllers/approvalController.js
export const createApprovalItem = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, description, type, link, deadline, assignTo, media } = req.body; // ← ADD media
    
    // Get user with updated counts
    const user = await User.findById(req.user.id);
    
    // Check approval limit
    if (!user.canCreateApproval()) {
      const limit = user.plan === 'pro' ? 200 : 20;
      return res.status(403).json({
        success: false,
        error: user.plan === 'free' 
          ? `Free plan limited to ${limit} approvals per month. Upgrade to Pro for more.`
          : `Pro plan limited to ${limit} approvals per month. Upgrade to Agency for unlimited.`
      });
    }

    // ✅ Check file size limit if media is provided (from frontend direct upload)
    if (media && media.size) {
      if (!user.canUploadFile(media.size)) {
        const maxSize = user.getMaxFileSize() / (1024 * 1024);
        return res.status(403).json({
          success: false,
          error: `File size exceeds your plan limit of ${maxSize}MB. Upgrade to upload larger files.`
        });
      }
    }

    // Validate required fields
    if (!title || !projectId) {
      return res.status(400).json({
        success: false,
        error: 'Title and project ID are required'
      });
    }

    // Check if project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Prepare approval data
    let finalType = type || 'text';
    let finalLink = link || '';
    let mediaData = null;

    // ✅ Use media from body (already uploaded directly to S3)
    if (media && media.url) {
      mediaData = {
        url: media.url,
        key: media.key,
        filename: media.filename,
        mimetype: media.mimetype,
        size: media.size,
        category: media.category,
        uploadedAt: new Date()
      };
      finalType = media.category;
      finalLink = media.url;
    }

    // Create approval
    const approval = new Approval({
      title,
      description,
      type: finalType,
      link: finalLink,
      deadline,
      assignTo,
      project: projectId,
      createdBy: req.user.id,
      status: 'pending',
      media: mediaData,
      content: {
        text: description || '',
        type: finalType
      },
      comments: [],
      activityLog: [{
        action: mediaData ? 'Created with file' : 'Created',
        user: req.user.name || req.user.email,
        timestamp: new Date(),
        details: mediaData ? `File uploaded: ${mediaData.filename}` : 'Approval item created'
      }]
    });

    await approval.save();

    // Increment approval count
    await user.incrementApprovalCount();

    // Update project counts
    project.totalApprovals = (project.totalApprovals || 0) + 1;
    project.pendingApprovals = (project.pendingApprovals || 0) + 1;
    await project.save();

    res.status(201).json({
      success: true,
      data: approval,
      usage: user.getUsageStats()
    });
  } catch (error) {
    console.error('Error creating approval:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create approval item'
    });
  }
};


// the deleteApprovalItem function
export const deleteApprovalItem = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the approval first to get media info
    const approval = await Approval.findById(id);
    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval not found'
      });
    }

    // Check ownership
    if (approval.createdBy.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this approval'
      });
    }

    // ✅ DELETE FILE FROM S3 IF IT EXISTS
    if (approval.media?.key) {
      try {
        await deleteFromS3(approval.media.key);
        console.log('✅ Deleted file from S3:', approval.media.key);
      } catch (s3Error) {
        console.error('❌ Error deleting from S3:', s3Error);
        // Continue with approval deletion even if S3 delete fails
      }
    }

    // Also check if there's a file in the link field (for older records)
    if (approval.link && approval.link.includes('amazonaws.com')) {
      // Extract key from URL
      const urlParts = approval.link.split('/');
      const possibleKey = urlParts.slice(urlParts.indexOf('approvals')).join('/');
      if (possibleKey) {
        try {
          await deleteFromS3(possibleKey);
          console.log('✅ Deleted file from S3 using link:', possibleKey);
        } catch (s3Error) {
          console.error('❌ Error deleting from S3 using link:', s3Error);
        }
      }
    }

    // Delete the approval
    await approval.deleteOne();

    // Update project counts
    const project = await Project.findById(approval.project);
    if (project) {
      project.totalApprovals = Math.max(0, (project.totalApprovals || 0) - 1);
      if (approval.status === 'pending') {
        project.pendingApprovals = Math.max(0, (project.pendingApprovals || 0) - 1);
      }
      await project.save();
    }

    // Decrement user's approval count
    const user = await User.findById(userId);
    await user.decrementApprovalCount();

    res.json({
      success: true,
      message: 'Approval and associated files deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting approval:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete approval'
    });
  }
};

// Get approval items for a project
export const getApprovalItems = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, type } = req.query;

    let query = {};
    
    if (projectId !== 'all') {
      query.project = projectId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (type && type !== 'all') {
      query.type = type;
    }

    const approvals = await Approval.find(query)
      .populate('project', 'name')
      .populate('createdBy', 'name email')
      .populate({
        path: 'comments.user',
        select: 'name email'
      })
      .sort({ createdAt: -1 });

    // Transform the data to include client info from comments
    const transformedApprovals = approvals.map(approval => {
      const approvalObj = approval.toObject();
      
      // Find client comments to get client email
      const clientComments = approval.comments?.filter(
        c => c.type === 'external'
      );
      
      // If there are client comments, use that email
      if (clientComments && clientComments.length > 0) {
        // You might want to store the client email in a better way
        // This is a temporary solution
        approvalObj.clientEmail = clientComments[0].user?.email || 'client@example.com';
      }

      // Transform comments to include type indicator
      approvalObj.comments = approval.comments?.map(comment => ({
        ...comment.toObject(),
        type: comment.type === 'external' ? 'client' : 'internal'
      }));

      return approvalObj;
    });

    res.json({
      success: true,
      data: transformedApprovals
    });
  } catch (error) {
    console.error('Error fetching approvals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch approvals'
    });
  }
};

// @desc    Get single approval item
// @route   GET /api/approvals/:id
// @access  Private
export const getApprovalItem = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get the approval
    const approval = await Approval.findById(id)
      .populate('project', 'name')
      .populate('createdBy', 'name email');

    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval not found'
      });
    }

    // Get all comments for this approval from the Comment model
    const Comment = mongoose.model('Comment');
    const comments = await Comment.find({ approvalItem: id })
      .sort({ createdAt: -1 });

    // Convert to plain object and add comments
    const approvalObj = approval.toObject();
    approvalObj.comments = comments;

    res.status(200).json({
      success: true,
      data: approvalObj
    });
  } catch (error) {
    console.error('Error in getApprovalItem:', error);
    next(error);
  }
};

// Update approval item
export const updateApprovalItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, link, deadline } = req.body;

    const approval = await Approval.findById(id);
    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval not found'
      });
    }

    // Update fields
    if (title !== undefined) approval.title = title;
    if (description !== undefined) approval.description = description;
    if (link !== undefined) approval.link = link;
    if (deadline !== undefined) approval.deadline = deadline;

    // Add to activity log
    approval.activityLog.push({
      action: 'Updated',
      user: req.user.name || req.user.email,
      timestamp: new Date(),
      details: 'Approval details updated'
    });

    await approval.save();

    res.json({
      success: true,
      data: approval
    });
  } catch (error) {
    console.error('Error updating approval:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update approval'
    });
  }
};


// Update approval status
export const updateApprovalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'approved', 'changes', 'blocked'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const approval = await Approval.findById(id);
    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval not found'
      });
    }

    const oldStatus = approval.status;
    approval.status = status;

    // Update project counts if status changed
    if (oldStatus !== status) {
      const project = await Project.findById(approval.project);
      if (project) {
        // Remove from old status count
        if (oldStatus === 'pending') {
          project.pendingApprovals = Math.max(0, (project.pendingApprovals || 0) - 1);
        } else if (oldStatus === 'approved') {
          project.approvedCount = Math.max(0, (project.approvedCount || 0) - 1);
        }

        // Add to new status count
        if (status === 'pending') {
          project.pendingApprovals = (project.pendingApprovals || 0) + 1;
        } else if (status === 'approved') {
          project.approvedCount = (project.approvedCount || 0) + 1;
        }

        await project.save();
      }

      // Add to activity log
      approval.activityLog.push({
        action: 'Status Updated',
        user: req.user.name || req.user.email,
        timestamp: new Date(),
        details: `Status changed from ${oldStatus} to ${status}`
      });
    }

    await approval.save();

    res.json({
      success: true,
      data: approval
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update approval status'
    });
  }
};

// Add comment to approval
export const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text, type = 'internal' } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Comment text is required'
      });
    }

    const approval = await Approval.findById(id);
    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval not found'
      });
    }

    const comment = {
      text,
      type,
      user: req.user.id,
      createdAt: new Date()
    };

    approval.comments.push(comment);
    
    // Add to activity log
    approval.activityLog.push({
      action: 'Comment Added',
      user: req.user.name || req.user.email,
      timestamp: new Date(),
      details: `${type} comment added`
    });

    await approval.save();

    // Populate user info in the response
    await approval.populate('comments.user', 'name email');

    res.json({
      success: true,
      data: approval
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment'
    });
  }
};

// Get approval stats
export const getApprovalStats = async (req, res) => {
  try {
    const { projectId } = req.params;

    let match = {};
    if (projectId !== 'all') {
      match.project = mongoose.Types.ObjectId(projectId);
    }

    const stats = await Approval.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      total: 0,
      pending: 0,
      approved: 0,
      changes: 0,
      blocked: 0
    };

    stats.forEach(stat => {
      result[stat._id] = stat.count;
      result.total += stat.count;
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch approval stats'
    });
  }
};

// Add these functions to your existing approvalController.js

// Update status via magic link (for clients)
export const updateStatusViaMagic = async (req, res) => {
  try {
    const { token, itemId } = req.params;
    const { status, comment } = req.body;

    // Validate token (you'll need to implement token verification logic)
    // For now, we'll trust the token is valid
    const validStatuses = ['approved', 'changes', 'blocked'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: approved, changes, or blocked'
      });
    }

    const approval = await Approval.findById(itemId);
    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval item not found'
      });
    }

    const oldStatus = approval.status;
    approval.status = status;

    // Add comment if provided
    if (comment) {
      approval.comments.push({
        text: comment,
        type: 'external', // Client comments are external
        user: 'Client',
        createdAt: new Date()
      });
    }

    // Update project counts if status changed
    if (oldStatus !== status) {
      const project = await Project.findById(approval.project);
      if (project) {
        // Remove from old status count
        if (oldStatus === 'pending') {
          project.pendingApprovals = Math.max(0, (project.pendingApprovals || 0) - 1);
        } else if (oldStatus === 'approved') {
          project.approvedCount = Math.max(0, (project.approvedCount || 0) - 1);
        }

        // Add to new status count
        if (status === 'approved') {
          project.approvedCount = (project.approvedCount || 0) + 1;
        }

        await project.save();
      }

      // Add to activity log
      approval.activityLog.push({
        action: 'Status Updated by Client',
        user: 'Client (via Magic Link)',
        timestamp: new Date(),
        details: `Status changed from ${oldStatus} to ${status}`
      });
    } else if (comment) {
      // If only comment added, log it
      approval.activityLog.push({
        action: 'Comment Added by Client',
        user: 'Client (via Magic Link)',
        timestamp: new Date(),
        details: 'External comment added'
      });
    }

    await approval.save();

    res.json({
      success: true,
      message: `Status updated to ${status}`,
      data: approval
    });
  } catch (error) {
    console.error('Error updating status via magic link:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update approval status'
    });
  }
};

// Add comment via magic link (for clients)
export const addCommentViaMagic = async (req, res) => {
  try {
    const { token, itemId } = req.params;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Comment text is required'
      });
    }

    const approval = await Approval.findById(itemId);
    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval item not found'
      });
    }

    // Add comment
    approval.comments.push({
      text,
      type: 'external',
      user: 'Client',
      createdAt: new Date()
    });

    // Add to activity log
    approval.activityLog.push({
      action: 'Comment Added by Client',
      user: 'Client (via Magic Link)',
      timestamp: new Date(),
      details: 'External comment added'
    });

    await approval.save();

    res.json({
      success: true,
      message: 'Comment added successfully',
      data: approval
    });
  } catch (error) {
    console.error('Error adding comment via magic link:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment'
    });
  }
};

// @desc    Get all approvals across all projects
// @route   GET /api/approvals
// @access  Private
export const getAllApprovals = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    console.log('🔍 Fetching all approvals for user:', userId);
    
    // Get user to find their workspaces
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user's workspaces
    const workspaceIds = user.workspaces || [];
    console.log('📌 User workspaces:', workspaceIds);
    
    if (workspaceIds.length === 0) {
      console.log('⚠️ User has no workspaces');
      return res.status(200).json({
        success: true,
        count: 0,
        data: []
      });
    }
    
    // Find all projects in user's workspaces
    const projects = await Project.find({
      workspace: { $in: workspaceIds }
    }).select('_id name workspace');
    
    console.log('📁 Projects in user workspaces:', projects.map(p => ({
      id: p._id,
      name: p.name,
      workspace: p.workspace
    })));
    
    const projectIds = projects.map(p => p._id);
    
    if (projectIds.length === 0) {
      console.log('⚠️ No projects found in user workspaces');
      return res.status(200).json({
        success: true,
        count: 0,
        data: []
      });
    }
    
    // Get all approvals from these projects
    const approvals = await Approval.find({
      project: { $in: projectIds }
    })
      .populate('project', 'name workspace')
      .populate('createdBy', 'name email')
      .sort('-createdAt');

    console.log('✅ Found approvals:', approvals.length);
    console.log('📋 Approval projects:', approvals.map(a => ({
      id: a._id,
      title: a.title,
      projectId: a.project?._id,
      projectName: a.project?.name,
      projectWorkspace: a.project?.workspace
    })));

    res.status(200).json({
      success: true,
      count: approvals.length,
      data: approvals
    });
    
  } catch (error) {
    console.error('❌ Error in getAllApprovals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch approvals'
    });
  }
};