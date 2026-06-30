import Project from '../models/Project.js';
import Approval from '../models/ApprovalItem.js';
import User from '../models/User.js';
import { deleteFromS3 } from '../config/aws.js';

// Create project in workspace
export const createProject = async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    const { name, description } = req.body;
    const userId = req.user.id;

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'Workspace ID is required'
      });
    }

    // Get user with updated counts
    const user = await User.findById(userId);
    
    // Check project limit
    if (!user.canCreateProject()) {
      const limit = user.plan === 'pro' ? 40 : 4;
      return res.status(403).json({
        success: false,
        error: user.plan === 'free' 
          ? `Free plan limited to ${limit} projects. Upgrade to Pro for more.`
          : `Pro plan limited to ${limit} projects. Upgrade to Agency for unlimited.`
      });
    }

    // Create the project
    const project = await Project.create({
      name,
      description,
      workspace: workspaceId,
      createdBy: userId,
    });

    // Increment project count
    await user.incrementProjectCount();

    // Auto-add workspace to user if not already
    if (!user.workspaces.includes(workspaceId)) {
      user.workspaces.push(workspaceId);
      await user.save();
    }

    res.status(201).json({
      success: true,
      data: project,
      usage: user.getUsageStats()
    });
  } catch (error) {
    next(error);
  }
};

// deleteProject function

export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    console.log(`🗑️ Deleting project: ${id}`);

    const project = await Project.findOne({
      _id: id,
      createdBy: userId
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const user = await User.findById(userId);

    // ✅ FIND ALL APPROVALS
    const approvals = await Approval.find({ project: id });
    console.log(`📋 Found ${approvals.length} approvals to delete`);

    // ✅ DELETE EACH FILE FROM S3
    let filesDeleted = 0;
    for (const approval of approvals) {
      console.log(`   Approval: ${approval.title}`);
      console.log(`      Media key: ${approval.media?.key || 'none'}`);
      console.log(`      Media URL: ${approval.media?.url || 'none'}`);
      
      if (approval.media?.key) {
        try {
          console.log(`      🗑️ Deleting file: ${approval.media.key}`);
          await deleteFromS3(approval.media.key);
          filesDeleted++;
          console.log(`      ✅ Deleted: ${approval.media.key}`);
        } catch (s3Error) {
          console.error(`      ❌ Error deleting:`, s3Error.message);
        }
      } else {
        console.log(`      ⚠️ No S3 key found for this approval`);
      }
    }
    
    console.log(`🗑️ Deleted ${filesDeleted} files from S3`);

    // ✅ DELETE ALL APPROVALS FROM DATABASE
    const approvalsDeleted = await Approval.deleteMany({ project: id });
    console.log(`🗑️ Deleted ${approvalsDeleted.deletedCount} approvals from DB`);

    // Decrement user's approval count
    user.approvalsCount = Math.max(0, user.approvalsCount - approvalsDeleted.deletedCount);

    // Delete the project
    await project.deleteOne();
    console.log(`🗑️ Deleted project: ${project.name}`);

    // Decrement user's project count
    user.projectsCount = Math.max(0, user.projectsCount - 1);
    
    await user.save();

    res.json({
      success: true,
      message: `Project deleted. ${filesDeleted} files removed from S3`,
      counts: {
        projectsRemaining: user.projectsCount,
        approvalsRemaining: user.approvalsCount,
        filesDeleted: filesDeleted
      }
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Get projects in workspace
export const getProjects = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user._id;

    // Changed from workspaceId to workspace in query
    const projects = await Project.find({
      workspace: workspaceId,
      createdBy: userId
    }).sort({ createdAt: -1 });

    // Get approval counts for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        const pendingCount = await Approval.countDocuments({
          projectId: project._id,
          status: 'pending'
        });

        const approvedCount = await Approval.countDocuments({
          projectId: project._id,
          status: 'approved'
        });

        const totalApprovals = await Approval.countDocuments({
          projectId: project._id
        });

        return {
          ...project.toObject(),
          pendingApprovals: pendingCount,
          completedApprovals: approvedCount,
          totalApprovals
        };
      })
    );

    res.json({
      success: true,
      data: projectsWithCounts
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Get all projects for current user
// Get all projects for current user (across all workspaces)
export const getAllUserProjects = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch projects with workspace population
    const projects = await Project.find({ createdBy: userId })
      .populate('workspace', 'name') // Populate workspace name
      .sort({ createdAt: -1 });

    // Get approval counts for each project
    const projectsWithCounts = await Promise.all(
      projects.map(async (project) => {
        const pendingCount = await Approval.countDocuments({
          projectId: project._id,
          status: 'pending'
        });

        const approvedCount = await Approval.countDocuments({
          projectId: project._id,
          status: 'approved'
        });

        const totalApprovals = await Approval.countDocuments({
          projectId: project._id
        });

        // Convert to object and add workspace name
        const projectObj = project.toObject();
        if (project.workspace && typeof project.workspace === 'object') {
          projectObj.workspaceName = project.workspace.name;
          projectObj.workspaceId = project.workspace._id;
        }

        return {
          ...projectObj,
          pendingApprovals: pendingCount,
          completedApprovals: approvedCount,
          totalApprovals
        };
      })
    );

    res.json({
      success: true,
      data: projectsWithCounts
    });
  } catch (error) {
    console.error('Get all projects error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};


// Get single project
export const getProject = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const project = await Project.findOne({
      _id: id,
      createdBy: userId
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Get approval counts
    const pendingCount = await Approval.countDocuments({
      projectId: id,
      status: 'pending'
    });

    const approvedCount = await Approval.countDocuments({
      projectId: id,
      status: 'approved'
    });

    const totalApprovals = await Approval.countDocuments({
      projectId: id
    });

    const projectWithCounts = {
      ...project.toObject(),
      pendingApprovals: pendingCount,
      approvedCount,
      totalApprovals
    };

    res.json({
      success: true,
      data: projectWithCounts
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Update project
export const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user._id;

    const project = await Project.findOne({
      _id: id,
      createdBy: userId
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Update allowed fields
    if (updates.name !== undefined) {
      project.name = updates.name.trim();
    }
    
    if (updates.description !== undefined) {
      project.description = updates.description.trim();
    }
    
    if (updates.status !== undefined) {
      project.status = updates.status;
    }
    
    if (updates.deadline !== undefined) {
      project.deadline = updates.deadline;
    }
    
    if (updates.clients !== undefined) {
      project.clients = updates.clients;
    }

    await project.save();

    res.json({
      success: true,
      data: project,
      message: 'Project updated successfully'
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};


// In your projectController.js, add this function:
export const getProjectWithApprovals = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id)
      .populate({
        path: 'approvals',
        options: { sort: { createdAt: -1 } }
      });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    res.json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error fetching project with approvals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project'
    });
  }
};