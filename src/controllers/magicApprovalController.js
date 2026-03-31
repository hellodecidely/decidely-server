import ApprovalItem from '../models/ApprovalItem.js';
import Comment from '../models/Comment.js';
import Project from '../models/Project.js';

// Get project approvals via magic link
export const getProjectApprovalsViaMagic = async (req, res) => {
  try {
    const project = await Project.findById(req.client.projectId);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }
    
    // Verify client email is authorized for this project
    if (!project.clientEmails.includes(req.client.email.toLowerCase())) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized for this project',
      });
    }
    
    const items = await ApprovalItem.find({
      project: project._id,
    })
      .populate('createdBy', 'name email')
      .sort('-createdAt');

    res.status(200).json({
      success: true,
      count: items.length,
      data: items,
      project: {
        id: project._id,
        name: project.name,
        description: project.description,
      },
      clientEmail: req.client.email,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get single approval item via magic link
export const getApprovalItemViaMagic = async (req, res) => {
  try {
    const item = await ApprovalItem.findById(req.params.itemId)
      .populate('project')
      .populate('createdBy', 'name email');

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Approval item not found',
      });
    }
    
    // Verify item belongs to client's project
    const project = await Project.findById(item.project);
    if (!project.clientEmails.includes(req.client.email.toLowerCase())) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized for this item',
      });
    }

    // Get comments (exclude internal ones for clients)
    const comments = await Comment.find({
      approvalItem: item._id,
      internal: false,
    }).sort('createdAt');

    res.status(200).json({
      success: true,
      data: {
        item,
        comments,
      },
      clientEmail: req.client.email,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Update status via magic link
export const updateStatusViaMagic = async (req, res) => {
  try {
    const { status, comment: commentText } = req.body;

    const item = await ApprovalItem.findById(req.params.itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Approval item not found',
      });
    }

    // Verify item belongs to client's project
    const project = await Project.findById(item.project);
    if (!project.clientEmails.includes(req.client.email.toLowerCase())) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized',
      });
    }

    // Validate status
    if (!['pending', 'approved', 'changes_requested', 'blocked'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
      });
    }

    // Update item
    item.status = status;
    await item.save();

    // Add comment if provided
    if (commentText) {
      await Comment.create({
        text: commentText,
        approvalItem: item._id,
        userEmail: req.client.email,
        userName: req.client.email,
        internal: false,
      });
    }

    res.status(200).json({
      success: true,
      data: item,
      message: `Status updated to ${status}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Add comment via magic link
export const addCommentViaMagic = async (req, res) => {
  try {
    const { text } = req.body;

    const item = await ApprovalItem.findById(req.params.itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Approval item not found',
      });
    }

    // Verify item belongs to client's project
    const project = await Project.findById(item.project);
    if (!project.clientEmails.includes(req.client.email.toLowerCase())) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized',
      });
    }

    const comment = await Comment.create({
      text,
      approvalItem: item._id,
      userEmail: req.client.email,
      userName: req.client.email,
      internal: false,
    });

    res.status(201).json({
      success: true,
      data: comment,
      message: 'Comment added successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};