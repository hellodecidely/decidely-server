import Workspace from '../models/Workspace.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import Approval from '../models/ApprovalItem.js';
import { deleteFromS3 } from '../config/aws.js';

// Create workspace
export const createWorkspace = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user._id;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Workspace name is required'
      });
    }

    // Get user with updated counts
    const user = await User.findById(userId);
    
    // Check workspace limit
    if (!user.canCreateWorkspace()) {
      const limit = user.plan === 'pro' ? 20 : 2;
      return res.status(403).json({
        success: false,
        error: user.plan === 'free' 
          ? `Free plan limited to ${limit} workspaces. Upgrade to Pro for more.`
          : `Pro plan limited to ${limit} workspaces. Upgrade to Agency for unlimited.`
      });
    }

    // Check if user already has a workspace with same name
    const existingWorkspace = await Workspace.findOne({
      name: name.trim(),
      owner: userId
    });

    if (existingWorkspace) {
      return res.status(400).json({
        success: false,
        error: 'You already have a workspace with this name'
      });
    }

    // Create workspace
    const workspace = await Workspace.create({
      name: name.trim(),
      owner: userId,
      members: [userId]
    });

    // Add workspace to user and increment count
    user.workspaces.push(workspace._id);
    await user.incrementWorkspaceCount();

    res.status(201).json({
      success: true,
      data: workspace,
      message: 'Workspace created successfully',
      usage: user.getUsageStats()
    });
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
};

// deleteWorkspace to decrement count
export const deleteWorkspace = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const workspace = await Workspace.findOne({
      _id: id,
      owner: userId
    });

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found or you are not the owner'
      });
    }

    const user = await User.findById(userId);
    
    // Find all projects in this workspace
    const projects = await Project.find({ workspace: id });
    
    let totalFilesDeleted = 0;
    
    // For each project, delete all approvals and their S3 files
    for (const project of projects) {
      // Find all approvals in this project
      const approvals = await Approval.find({ project: project._id });
      
      // Delete each file from S3
      for (const approval of approvals) {
        if (approval.media?.key) {
          try {
            await deleteFromS3(approval.media.key);
            totalFilesDeleted++;
            console.log(`✅ Deleted file: ${approval.media.key}`);
          } catch (s3Error) {
            console.error(`❌ Error deleting file:`, s3Error);
          }
        }
      }
      
      // Delete all approvals from database
      const approvalsDeleted = await Approval.deleteMany({ project: project._id });
      console.log(`🗑️ Deleted ${approvalsDeleted.deletedCount} approvals from project ${project._id}`);
      
      // Decrement user's approval count
      user.approvalsCount = Math.max(0, user.approvalsCount - approvalsDeleted.deletedCount);
    }
    
    // Delete all projects
    const projectsDeleted = await Project.deleteMany({ workspace: id });
    console.log(`🗑️ Deleted ${projectsDeleted.deletedCount} projects from workspace ${id}`);
    
    // Decrement user's project count
    user.projectsCount = Math.max(0, user.projectsCount - projectsDeleted.deletedCount);

    // Remove workspace from user's workspaces array
    user.workspaces = user.workspaces.filter(w => w.toString() !== id);
    
    // Decrement workspace count
    user.workspacesCount = Math.max(0, user.workspacesCount - 1);
    
    await user.save();
    
    // Delete the workspace
    await Workspace.findByIdAndDelete(id);

    console.log(`✅ Workspace deleted. Total files removed: ${totalFilesDeleted}`);

    res.json({
      success: true,
      message: 'Workspace and all associated data deleted successfully',
      counts: {
        workspacesRemaining: user.workspacesCount,
        projectsRemaining: user.projectsCount,
        approvalsRemaining: user.approvalsCount,
        filesDeleted: totalFilesDeleted
      }
    });
  } catch (error) {
    console.error('Delete workspace error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
};
// Get all workspaces for current user
export const getWorkspaces = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get workspaces where user is owner or member
    const workspaces = await Workspace.find({
      $or: [
        { owner: userId },
        { members: userId }
      ]
    }).sort({ createdAt: -1 });

    // Get project counts for each workspace
    const workspacesWithCounts = await Promise.all(
      workspaces.map(async (workspace) => {
        // Count projects in this workspace (created by anyone, not just current user)
        const projectCount = await Project.countDocuments({
          workspace: workspace._id  // Changed from workspaceId to workspace
        });
        
        return {
          ...workspace.toObject(),
          projectCount
        };
      })
    );

    res.json({
      success: true,
      data: workspacesWithCounts
    });
  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
};


// Get single workspace
export const getWorkspace = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Check if user is owner or member of this workspace
    const workspace = await Workspace.findOne({
      _id: id,
      $or: [
        { owner: userId },
        { members: userId }
      ]
    });

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found or access denied'
      });
    }

    // Get project count (all projects in workspace, not just user's)
    const projectCount = await Project.countDocuments({
      workspace: id  // Changed from workspaceId to workspace
    });

    const workspaceWithCount = {
      ...workspace.toObject(),
      projectCount
    };

    res.json({
      success: true,
      data: workspaceWithCount
    });
  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Update workspace
export const updateWorkspace = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user._id;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Workspace name is required'
      });
    }

    // Check if user is owner of this workspace
    const workspace = await Workspace.findOne({
      _id: id,
      owner: userId // Only owner can update
    });

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found or you are not the owner'
      });
    }

    // Update workspace name
    workspace.name = name.trim();
    await workspace.save();

    res.json({
      success: true,
      data: workspace,
      message: 'Workspace updated successfully'
    });
  } catch (error) {
    console.error('Update workspace error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};


// Add member to workspace
export const addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const userId = req.user._id;

    // Check if user is owner of this workspace
    const workspace = await Workspace.findOne({
      _id: id,
      owner: userId // Only owner can add members
    });

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found or you are not the owner'
      });
    }

    // Find user by email
    const userToAdd = await User.findOne({ email });

    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user is already a member
    if (workspace.members.includes(userToAdd._id)) {
      return res.status(400).json({
        success: false,
        error: 'User is already a member of this workspace'
      });
    }

    // Add user to members
    workspace.members.push(userToAdd._id);
    await workspace.save();

    res.json({
      success: true,
      message: 'Member added successfully'
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Add user to workspace
// @route   POST /api/workspaces/:workspaceId/users
// @access  Private (only workspace owner or admin)
export const addUserToWorkspace = async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    const { userId } = req.body;
    const currentUserId = req.user.id;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Check if current user is workspace owner or admin
    if (workspace.owner.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        error: 'Only workspace owner can add users',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Add workspace to user
    user.addWorkspace(workspaceId);
    await user.save();

    // Add user to workspace members if needed
    if (!workspace.members.includes(userId)) {
      workspace.members.push(userId);
      await workspace.save();
    }

    res.status(200).json({
      success: true,
      message: 'User added to workspace successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
        workspace: {
          id: workspace._id,
          name: workspace.name,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};