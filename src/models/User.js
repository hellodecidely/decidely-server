import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  company: {
    type: String,
    trim: true,
  },
  role: {
    type: String,
    enum: ['agency_owner', 'admin', 'member', 'viewer'],
    default: 'agency_owner',
  },
  avatar: {
    type: String,
    default: null,
  },
  workspaces: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  }],
  currentWorkspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    default: null,
  },
  lastActive: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
    },
    theme: { type: String, default: 'light' },
  },
  plan: {
    type: String,
    enum: ['free', 'pro', 'agency'],
    default: 'free'
  },
  planActivatedAt: {
    type: Date
  },
  planExpiresAt: {
    type: Date
  },
  
  // Usage tracking
  workspacesCount: {
    type: Number,
    default: 0
  },
  projectsCount: {
    type: Number,
    default: 0
  },
  approvalsCount: {
    type: Number,
    default: 0
  },
  approvalsResetAt: {
    type: Date,
    default: Date.now
  },
  
  // File upload tracking
  totalUploadSize: {
    type: Number,
    default: 0
  },
  uploadsResetAt: {
    type: Date,
    default: Date.now
  },
lastPlanChange: {
  type: Date,
  default: Date.now
},
resetPasswordToken: {
  type: String,
  select: false
},
resetPasswordExpire: {
  type: Date,
  select: false
},

}, {
  timestamps: true,
});

// Hash password before saving - WITHOUT next
UserSchema.pre('save', async function() {
  try {
    // Only hash the password if it has been modified
    if (!this.isModified('password')) {
      return;
    }
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});


// Compare password
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if user has access to workspace
UserSchema.methods.hasWorkspaceAccess = function(workspaceId) {
  if (!this.workspaces || !Array.isArray(this.workspaces)) {
    return false;
  }
  return this.workspaces.some(w => w.toString() === workspaceId.toString());
};

// Add workspace to user
UserSchema.methods.addWorkspace = function(workspaceId) {
  if (!this.workspaces) {
    this.workspaces = [];
  }
  const idStr = workspaceId.toString();
  if (!this.workspaces.some(w => w.toString() === idStr)) {
    this.workspaces.push(workspaceId);
  }
  return this;
};

// Remove workspace from user
UserSchema.methods.removeWorkspace = function(workspaceId) {
  if (this.workspaces) {
    this.workspaces = this.workspaces.filter(w => w.toString() !== workspaceId.toString());
  }
  if (this.currentWorkspace?.toString() === workspaceId.toString()) {
    this.currentWorkspace = this.workspaces[0] || null;
  }
  return this;
};

// Update last active
UserSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this.save();
};

// Method to check if user can create more workspaces
UserSchema.methods.canCreateWorkspace = function() {
  if (this.plan === 'agency') return true;
  if (this.plan === 'pro') return this.workspacesCount < 20;
  return this.workspacesCount < 2; // free plan
};

// Method to check if user can create more projects
UserSchema.methods.canCreateProject = function() {
  if (this.plan === 'agency') return true;
  if (this.plan === 'pro') return this.projectsCount < 40;
  return this.projectsCount < 4; // free plan
};

// Method to check if user can create more approvals (monthly reset)
UserSchema.methods.canCreateApproval = function() {
  // Reset monthly count if needed
  const now = new Date();
  const lastReset = new Date(this.approvalsResetAt || Date.now());
  const daysSinceReset = Math.floor((now - lastReset) / (1000 * 60 * 60 * 24));
  
  if (daysSinceReset >= 30) {
    this.approvalsCount = 0;
    this.approvalsResetAt = now;
  }
  
  if (this.plan === 'agency') return true;
  if (this.plan === 'pro') return this.approvalsCount < 200;
  return this.approvalsCount < 20; // free plan
};

// Method to check file size limit
UserSchema.methods.getMaxFileSize = function() {
  if (this.plan === 'agency') return 60 * 1024 * 1024; // 60MB
  if (this.plan === 'pro') return 40 * 1024 * 1024; // 40MB
  return 20 * 1024 * 1024; // 20MB free plan
};

// Method to check if user can upload file of given size
UserSchema.methods.canUploadFile = function(fileSize) {
  const maxSize = this.getMaxFileSize();
  return fileSize <= maxSize;
};

// Method to increment usage counts
UserSchema.methods.incrementWorkspaceCount = async function() {
  this.workspacesCount += 1;
  return this.save();
};

UserSchema.methods.incrementProjectCount = async function() {
  this.projectsCount += 1;
  return this.save();
};

UserSchema.methods.incrementApprovalCount = async function() {
  this.approvalsCount += 1;
  return this.save();
};

UserSchema.methods.decrementWorkspaceCount = async function() {
  this.workspacesCount = Math.max(0, this.workspacesCount - 1);
  return this.save();
};

UserSchema.methods.decrementProjectCount = async function() {
  this.projectsCount = Math.max(0, this.projectsCount - 1);
  return this.save();
};

UserSchema.methods.decrementApprovalCount = async function() {
  this.approvalsCount = Math.max(0, this.approvalsCount - 1);
  return this.save();
};

// Get usage stats
UserSchema.methods.getUsageStats = function() {
  const now = new Date();
  const lastReset = new Date(this.approvalsResetAt || Date.now());
  const daysUntilReset = Math.max(0, 30 - Math.floor((now - lastReset) / (1000 * 60 * 60 * 24)));
  
  return {
    plan: this.plan,
    workspaces: {
      used: this.workspacesCount,
      limit: this.plan === 'agency' ? 'Unlimited' : this.plan === 'pro' ? 20 : 2,
      remaining: this.plan === 'agency' ? 'Unlimited' : 
                 (this.plan === 'pro' ? 20 - this.workspacesCount : 2 - this.workspacesCount)
    },
    projects: {
      used: this.projectsCount,
      limit: this.plan === 'agency' ? 'Unlimited' : this.plan === 'pro' ? 20 : 2,
      remaining: this.plan === 'agency' ? 'Unlimited' : 
                 (this.plan === 'pro' ? 20 - this.projectsCount : 2 - this.projectsCount)
    },
    approvals: {
      used: this.approvalsCount,
      limit: this.plan === 'agency' ? 'Unlimited' : this.plan === 'pro' ? 200 : 20,
      remaining: this.plan === 'agency' ? 'Unlimited' : 
                 (this.plan === 'pro' ? 200 - this.approvalsCount : 20 - this.approvalsCount),
      resetsIn: daysUntilReset
    },
    maxFileSize: this.getMaxFileSize() / (1024 * 1024) + 'MB'
  };
};

UserSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email,
      name: this.name,
      role: this.role,
      plan: this.plan,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};



export default mongoose.model('User', UserSchema);