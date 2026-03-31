import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import MagicLink from '../models/Magiclink.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import ApprovalItem from '../models/ApprovalItem.js';
import { sendMagicLinkEmail, sendDecisionNotificationEmail } from '../utils/magicEmailService.js';
import mongoose from 'mongoose';

// Generate magic link token
export const generateMagicLinkToken = (email, projectId) => {
  return jwt.sign(
    {
      email: email.toLowerCase(),
      projectId,
      type: 'magic_link',
      timestamp: Date.now()
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Generate approval URL
export const generateApprovalUrl = (token) => {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${baseUrl}/review/${token}`;
};

// @desc    Generate magic link for client
// @route   POST /api/magic/generate
// @access  Private
export const generateMagicLink = async (req, res, next) => {
  try {
    const { projectId, email, approvalIds = [], sendEmail = true } = req.body;
    const userId = req.user.id;

    // Validate inputs
    if (!projectId || !email) {
      return res.status(400).json({
        success: false,
        error: 'Project ID and email are required'
      });
    }

    // Get project with workspace
    const project = await Project.findById(projectId).populate('workspace');
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Check if user has access to this project
    const user = await User.findById(userId);
    const hasAccess = user.workspaces.some(w => w.toString() === project.workspace._id.toString());
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to access this project'
      });
    }

    // Check if email is authorized for this project
    const normalizedEmail = email.toLowerCase().trim();
    const isClientAuthorized = project.clientEmails.some(
      client => client.email === normalizedEmail && client.isActive
    );

    if (!isClientAuthorized) {
      return res.status(400).json({
        success: false,
        error: 'Email is not authorized for this project. Add client first.'
      });
    }

    // Validate approvals if provided
    let validApprovals = [];
    if (approvalIds.length > 0) {
      validApprovals = await ApprovalItem.find({
        _id: { $in: approvalIds },
        project: projectId
      });
      
      if (validApprovals.length !== approvalIds.length) {
        return res.status(400).json({
          success: false,
          error: 'One or more approval items are invalid'
        });
      }
    }

    // Generate unique token
    const token = MagicLink.generateToken();
    
    // Calculate expiry (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create magic link in database
    const magicLink = await MagicLink.create({
      token,
      email: normalizedEmail,
      project: projectId,
      approvals: validApprovals.map(a => a._id),
      createdBy: userId,
      expiresAt,
      status: 'active'
    });

    // Generate URL for frontend
    const magicUrl = generateApprovalUrl(token);

    // Send email if requested
    let emailSent = false;
    if (sendEmail) {
      try {
        // Get first approval title for email
        const firstApproval = validApprovals[0] || await ApprovalItem.findOne({ project: projectId }).sort('-createdAt');
        
        await sendMagicLinkEmail({
          to: normalizedEmail,
          clientName: project.clientEmails.find(c => c.email === normalizedEmail)?.name || '',
          projectName: project.name,
          approvalTitle: firstApproval?.title || 'Review Items',
          magicLink: magicUrl,
          workspaceName: project.workspace.name,
          expiresIn: '7 days'
        });
        emailSent = true;
        console.log(`✅ Magic link email sent to ${normalizedEmail}`);
      } catch (emailError) {
        console.error('❌ Failed to send magic link email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.status(201).json({
      success: true,
      data: {
        token,
        url: magicUrl,
        email: normalizedEmail,
        project: project.name,
        expiresAt,
        emailSent,
        magicLinkId: magicLink._id
      }
    });
  } catch (error) {
    console.error('Error in generateMagicLink:', error);
    next(error);
  }
};

// @desc    Validate magic link token
// @route   GET /api/magic/validate/:token
// @access  Public
export const validateMagicLink = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }

    // Find magic link in database
    const magicLink = await MagicLink.findOne({ token });

    if (!magicLink) {
      return res.status(404).json({
        success: false,
        error: 'Invalid magic link'
      });
    }

    // Check if link is valid
    if (!magicLink.isValid()) {
      let error = 'Magic link has expired';
      if (magicLink.status === 'revoked') {
        error = 'Magic link has been revoked';
      } else if (magicLink.isExpired()) {
        error = 'Magic link has expired';
      }
      
      return res.status(401).json({
        success: false,
        error
      });
    }

    // Get project to verify client is still authorized
    const project = await Project.findById(magicLink.project);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Verify client email is still authorized
    const isClientAuthorized = project.clientEmails.some(
      client => client.email === magicLink.email && client.isActive
    );

    if (!isClientAuthorized) {
      return res.status(403).json({
        success: false,
        error: 'You are no longer authorized for this project'
      });
    }

    // Record access metadata (optional - get from request)
    magicLink.recordClick({
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip
    });
    await magicLink.save();

    res.status(200).json({
      success: true,
      data: {
        valid: true,
        email: magicLink.email,
        projectId: magicLink.project,
        expiresAt: magicLink.expiresAt
      }
    });
  } catch (error) {
    console.error('Error in validateMagicLink:', error);
    next(error);
  }
};

// @desc    Get project and approvals via magic link
// @route   GET /api/magic/access/:token
// @access  Public
export const getAccessViaMagicLink = async (req, res, next) => {
  try {
    const { token } = req.params;

    const magicLink = await MagicLink.findOne({ token });

    if (!magicLink || !magicLink.isValid()) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired magic link'
      });
    }

    // Get project details
    const project = await Project.findById(magicLink.project)
      .populate('workspace', 'name');

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Get approvals - either specific ones or all from project
    let approvals = [];
    if (magicLink.approvals && magicLink.approvals.length > 0) {
      // Get only specified approvals
      approvals = await ApprovalItem.find({
        _id: { $in: magicLink.approvals }
      }).sort('-createdAt');
    } else {
      // Get all active approvals from project
      approvals = await ApprovalItem.find({
        project: magicLink.project
      }).sort('-createdAt');
    }

    // Get client info from project
    const clientInfo = project.clientEmails.find(
      c => c.email === magicLink.email
    );

    res.status(200).json({
      success: true,
      data: {
        project: {
          id: project._id,
          name: project.name,
          description: project.description,
          workspace: project.workspace?.name || 'Unknown'
        },
        client: {
          email: magicLink.email,
          name: clientInfo?.name || '',
          company: clientInfo?.company || ''
        },
        approvals: approvals.map(a => ({
          _id: a._id,
          title: a.title,
          description: a.description,
          type: a.type,
          status: a.status,
          link: a.link,
          deadline: a.deadline,
          createdAt: a.createdAt
        })),
        magicLink: {
          expiresAt: magicLink.expiresAt,
          clicks: magicLink.clicks
        }
      }
    });
  } catch (error) {
    console.error('Error in getAccessViaMagicLink:', error);
    next(error);
  }
};

// @desc    Submit decision via magic link
// @route   POST /api/magic/decision/:token
// @access  Public
export const submitDecisionViaMagic = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { approvalId, status, comment } = req.body;

    // Find magic link
    const magicLink = await MagicLink.findOne({ token });
    if (!magicLink || !magicLink.isValid()) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired magic link'
      });
    }

    // Find approval
    const approval = await ApprovalItem.findById(approvalId);
    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval not found'
      });
    }

    // Update approval status
    approval.status = status;
    approval.clientEmail = magicLink.email;
    approval.assignedTo = magicLink.email;
    approval.updatedByClient = {
      email: magicLink.email,
      at: new Date(),
      comment: comment || ''
    };
    
    await approval.save();

    // Add comment if provided - USE COMMENT MODEL
    if (comment && comment.trim()) {
      const Comment = mongoose.model('Comment');
      await Comment.create({
        text: comment,
        approvalItem: approvalId,
        userEmail: magicLink.email,
        userName: magicLink.email,
        internal: false // External comment
      });
      
      console.log('✅ Client comment added to Comment model');
    }

    res.status(200).json({
      success: true,
      message: 'Decision submitted successfully'
    });
  } catch (error) {
    console.error('Error in submitDecisionViaMagic:', error);
    next(error);
  }
};

// @desc    Add comment via magic link
// @route   POST /api/magic/comment/:token
// @access  Public
export const addCommentViaMagic = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { approvalId, comment } = req.body;

    if (!approvalId || !comment) {
      return res.status(400).json({
        success: false,
        error: 'Approval ID and comment are required'
      });
    }

    // Find magic link
    const magicLink = await MagicLink.findOne({ token });

    if (!magicLink || !magicLink.isValid()) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired magic link'
      });
    }

    // Find approval
    const approval = await ApprovalItem.findById(approvalId);

    if (!approval) {
      return res.status(404).json({
        success: false,
        error: 'Approval item not found'
      });
    }

    // Verify approval belongs to the same project
    if (approval.project.toString() !== magicLink.project.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized'
      });
    }

    // Add comment
    const Comment = (await import('../models/Comment.js')).default;
    const newComment = await Comment.create({
      text: comment,
      approvalItem: approval._id,
      userEmail: magicLink.email,
      userName: magicLink.email,
      type: 'client'
    });

    res.status(201).json({
      success: true,
      data: newComment,
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Error in addCommentViaMagic:', error);
    next(error);
  }
};

// @desc    Get all magic links for agency
// @route   GET /api/magic/links
// @access  Private
export const getAllMagicLinks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    console.log('📊 Fetching magic links for user:', userId);
    
    const { status, projectId, page = 1, limit = 20 } = req.query;
    console.log('Query params:', { status, projectId, page, limit });

    // Build query
    const query = { createdBy: userId };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (projectId && projectId !== 'all') {
      query.project = projectId;
    }

    console.log('MongoDB query:', JSON.stringify(query));

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    console.log('Skip:', skip, 'Limit:', limit);

    // Get magic links
    const magicLinks = await MagicLink.find(query)
      .populate('project', 'name')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit));

    console.log(`Found ${magicLinks.length} magic links`);

    // Get total count
    const total = await MagicLink.countDocuments(query);
    console.log('Total count:', total);

    // Calculate stats
    const stats = {
      total: await MagicLink.countDocuments({ createdBy: userId }),
      active: await MagicLink.countDocuments({ createdBy: userId, status: 'active' }),
      expired: await MagicLink.countDocuments({ createdBy: userId, status: 'expired' }),
      revoked: await MagicLink.countDocuments({ createdBy: userId, status: 'revoked' })
    };
    
    console.log('Stats:', stats);

    res.status(200).json({
      success: true,
      data: magicLinks,
      stats: { stats }, // Wrap stats in an object to match frontend expectation
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ ERROR in getAllMagicLinks:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch magic links',
      details: error.message
    });
  }
};


// @desc    Get single magic link
// @route   GET /api/magic/links/:id
// @access  Private
export const getMagicLinkById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const magicLink = await MagicLink.findOne({
      _id: id,
      createdBy: userId
    })
      .populate('project', 'name description')
      .populate('approvals', 'title status type')
      .populate('createdBy', 'name email');

    if (!magicLink) {
      return res.status(404).json({
        success: false,
        error: 'Magic link not found'
      });
    }

    res.status(200).json({
      success: true,
      data: magicLink
    });
  } catch (error) {
    console.error('Error in getMagicLinkById:', error);
    next(error);
  }
};

// @desc    Revoke magic link
// @route   DELETE /api/magic/links/:id
// @access  Private
export const revokeMagicLink = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const magicLink = await MagicLink.findOne({
      _id: id,
      createdBy: userId
    });

    if (!magicLink) {
      return res.status(404).json({
        success: false,
        error: 'Magic link not found'
      });
    }

    magicLink.status = 'revoked';
    await magicLink.save();

    res.status(200).json({
      success: true,
      message: 'Magic link revoked successfully'
    });
  } catch (error) {
    console.error('Error in revokeMagicLink:', error);
    next(error);
  }
};

// @desc    Resend magic link email
// @route   POST /api/magic/links/:id/resend
// @access  Private
export const resendMagicLinkEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log('Resending email for link:', id);
    console.log('User ID:', userId);

    const magicLink = await MagicLink.findOne({
      _id: id,
      createdBy: userId
    }).populate('project');

    if (!magicLink) {
      return res.status(404).json({
        success: false,
        error: 'Magic link not found'
      });
    }

    if (magicLink.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot resend inactive magic link'
      });
    }

    // Get approval title
    let approvalTitle = 'Review Items';
    if (magicLink.approvals && magicLink.approvals.length > 0) {
      const firstApproval = await ApprovalItem.findById(magicLink.approvals[0]);
      if (firstApproval) approvalTitle = firstApproval.title;
    }

    // Generate URL
    const magicUrl = `${process.env.FRONTEND_URL}/review/${magicLink.token}`;

    // Resend email
    await sendMagicLinkEmail({
      to: magicLink.email,
      clientName: magicLink.email,
      projectName: magicLink.project.name,
      approvalTitle,
      magicLink: magicUrl,
      workspaceName: magicLink.project.workspace?.name || 'Workspace',
      expiresIn: '7 days'
    });

    // SUCCESS RESPONSE - Make sure it matches what frontend expects
    res.status(200).json({
      success: true,
      message: 'Magic link email resent successfully',
      data: {
        id: magicLink._id,
        email: magicLink.email,
        sent: true
      }
    });
    
  } catch (error) {
    console.error('Error in resendMagicLinkEmail:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend email'
    });
  }
};

// @desc    Get magic link stats
// @route   GET /api/magic/stats
// @access  Private
export const getMagicLinkStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // FIRST: Update any expired links
    await MagicLink.updateMany(
      { 
        createdBy: userId,
        status: 'active', 
        expiresAt: { $lt: new Date() } 
      },
      { 
        $set: { status: 'expired' } 
      }
    );

    // THEN: Calculate stats with updated statuses
    const stats = {
      total: await MagicLink.countDocuments({ createdBy: userId }),
      active: await MagicLink.countDocuments({ createdBy: userId, status: 'active' }),
      expired: await MagicLink.countDocuments({ createdBy: userId, status: 'expired' }),
      revoked: await MagicLink.countDocuments({ createdBy: userId, status: 'revoked' }),
      totalClicks: await MagicLink.aggregate([
        { $match: { createdBy: userId } },
        { $group: { _id: null, total: { $sum: '$clicks' } } }
      ])
    };

    // Get recent activity
    const recentActivity = await MagicLink.find({ createdBy: userId })
      .sort('-lastAccessed')
      .limit(5)
      .select('email lastAccessed status');

    res.status(200).json({
      success: true,
      data: {
        stats,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Error in getMagicLinkStats:', error);
    next(error);
  }
};