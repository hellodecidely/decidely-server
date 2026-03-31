import Project from '../models/Project.js';
import User from '../models/User.js';
// import { sendClientInvitationEmail } from '../utils/emailService.js'; // Uncomment when email is ready


// @desc    Get project clients
// @route   GET /api/projects/:projectId/clients
// @access  Private
export const getProjectClients = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    console.log('Fetching clients for project:', projectId);
    console.log('User ID:', userId);

    // Get project with workspace
    const project = await Project.findById(projectId).populate('workspace');
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Get user with workspaces
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Check if user has access to this workspace
    const hasAccess = user.hasWorkspaceAccess(project.workspace._id);
    
    if (!hasAccess) {
      console.log('Access denied. User workspaces:', user.workspaces);
      console.log('Project workspace:', project.workspace._id);
      
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view clients for this project',
      });
    }

    // Get active clients
    const activeClients = (project.clientEmails || [])
      .filter(client => client && client.isActive)
      .map(client => ({
        _id: client._id,
        email: client.email,
        name: client.name || '',
        company: client.company || '',
        addedAt: client.addedAt,
        addedBy: client.addedBy,
        isActive: client.isActive
      }));

    console.log(`Found ${activeClients.length} clients for project`);

    res.status(200).json({
      success: true,
      count: activeClients.length,
      data: activeClients,
      project: {
        id: project._id,
        name: project.name,
      },
    });
  } catch (error) {
    console.error('Error in getProjectClients:', error);
    next(error);
  }
};

// @desc    Add client to project
// @route   POST /api/projects/:projectId/clients
// @access  Private
export const addClientToProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { email, name, company, sendInvitation = false } = req.body;
    const userId = req.user.id;

    // Validate email
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required',
      });
    }

    const project = await Project.findById(projectId).populate('workspace');
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Get user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Check if user has access to this workspace
    const hasAccess = user.hasWorkspaceAccess(project.workspace._id);

    if (!hasAccess) {
      console.log('Access denied. User workspaces:', user.workspaces);
      console.log('Project workspace:', project.workspace._id);
      
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to add clients to this project',
      });
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if client already exists
    const existingClient = project.clientEmails.find(
      client => client && client.email === normalizedEmail && client.isActive
    );

    if (existingClient) {
      return res.status(400).json({
        success: false,
        error: 'Client already exists in this project',
      });
    }

    // Add new client
    const newClient = {
      email: normalizedEmail,
      name: name || '',
      company: company || '',
      addedBy: userId,
      isActive: true,
      addedAt: new Date(),
    };

    project.clientEmails.push(newClient);
    await project.save();

    // Send invitation email if requested
    if (sendInvitation) {
      try {
        const { sendClientInvitationEmail } = await import('../utils/emailService.js');
        
        await sendClientInvitationEmail({
          to: normalizedEmail,
          clientName: name || '',
          projectName: project.name,
          workspaceName: project.workspace?.name || 'Your Workspace',
          invitedBy: user.name || user.email,
        });
        
        console.log(`Invitation email sent to ${normalizedEmail}`);
      } catch (emailError) {
        console.error('Failed to send invitation email:', emailError);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        client: newClient,
        message: 'Client added successfully',
        invitationSent: sendInvitation,
      },
    });
  } catch (error) {
    console.error('Error in addClientToProject:', error);
    next(error);
  }
};

// @desc    Remove client from project
// @route   DELETE /api/projects/:projectId/clients/:clientId
// @access  Private
export const removeClientFromProject = async (req, res, next) => {
  try {
    const { projectId, clientId } = req.params;
    const userId = req.user.id;

    const project = await Project.findById(projectId).populate('workspace');
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Check workspace access
    const user = await User.findById(userId);
    const hasAccess = user.hasWorkspaceAccess(project.workspace._id);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to remove clients from this project',
      });
    }

    const client = project.clientEmails.id(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found',
      });
    }

    // Soft delete
    client.isActive = false;
    await project.save();

    res.status(200).json({
      success: true,
      message: 'Client removed from project',
    });
  } catch (error) {
    console.error('Error in removeClientFromProject:', error);
    next(error);
  }
};

// @desc    Update client details
// @route   PUT /api/projects/:projectId/clients/:clientId
// @access  Private
export const updateClient = async (req, res, next) => {
  try {
    const { projectId, clientId } = req.params;
    const { name, company, isActive } = req.body;
    const userId = req.user.id;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Check workspace access
    const user = await User.findById(userId);
    const userWorkspaces = user.workspaces || [];
    
    if (!userWorkspaces.includes(project.workspace.toString())) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized for this project',
      });
    }

    const client = project.clientEmails.id(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found',
      });
    }

    // Update fields
    if (name !== undefined) client.name = name;
    if (company !== undefined) client.company = company;
    if (isActive !== undefined) client.isActive = isActive;

    await project.save();

    res.status(200).json({
      success: true,
      data: client,
      message: 'Client updated successfully',
    });
  } catch (error) {
    next(error);
  }
};


// @desc    Get all clients across workspaces
// @route   GET /api/clients
// @access  Private
export const getAllClients = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    
    // FIX: Check if user.workspaces exists and is an array
    const workspaceIds = user.workspaces || [];

    // If no workspaces, return empty array
    if (workspaceIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    // Find all projects in user's workspaces
    const projects = await Project.find({
      workspace: { $in: workspaceIds },
      'clientEmails.isActive': true,
    }).select('name workspace clientEmails');

    // Aggregate unique clients
    const clientsMap = new Map();
    
    projects.forEach(project => {
      (project.clientEmails || []).forEach(client => {
        if (client && client.isActive && !clientsMap.has(client.email)) {
          clientsMap.set(client.email, {
            email: client.email,
            name: client.name || '',
            company: client.company || '',
            projects: [{
              id: project._id,
              name: project.name,
            }],
          });
        } else if (client && client.isActive) {
          const existingClient = clientsMap.get(client.email);
          if (existingClient) {
            existingClient.projects.push({
              id: project._id,
              name: project.name,
            });
          }
        }
      });
    });

    const clients = Array.from(clientsMap.values());

    res.status(200).json({
      success: true,
      count: clients.length,
      data: clients,
    });
  } catch (error) {
    next(error);
  }
};