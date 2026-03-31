import Project from '../models/Project.js';
import Approval from '../models/ApprovalItem.js';
import User from '../models/User.js';

export const getDashboardStats = async (req, res) => {
  try {
    const workspaceId = req.user.workspace;
    const userId = req.user._id;
    
    const totalProjects = await Project.countDocuments({ 
      workspaceId,
      createdBy: userId
    });
    
    const userProjects = await Project.find({ 
      workspaceId, 
      createdBy: userId 
    }).select('_id');
    
    const userProjectIds = userProjects.map(project => project._id);
    
    const pendingApprovals = await Approval.countDocuments({ 
      projectId: { $in: userProjectIds },
      status: 'pending'
    });
    
    const completedApprovals = await Approval.countDocuments({ 
      projectId: { $in: userProjectIds },
      status: 'approved'
    });
    
    // Removed teamMembers count
    // const teamMembers = await User.countDocuments({ workspace: workspaceId });
    
    const recentProjects = await Project.find({ 
      workspaceId,
      createdBy: userId 
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('name status clientName deadline');
    
    const recentApprovals = await Approval.find({ 
      projectId: { $in: userProjectIds },
      status: 'pending'
    })
      .populate('projectId', 'name')
      .sort({ deadline: 1 })
      .limit(5)
      .select('title projectId status deadline clientName');
    
    res.json({
      stats: {
        totalProjects,
        pendingApprovals,
        completedApprovals,
        // teamMembers // Remove this
      },
      recentProjects,
      recentApprovals
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Error fetching dashboard data' });
  }
};