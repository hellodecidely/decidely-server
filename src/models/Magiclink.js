import mongoose from 'mongoose';
import crypto from 'crypto';

const MagicLinkSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  approvals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalItem',
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked'],
    default: 'active',
    index: true,
  },
  clicks: {
    type: Number,
    default: 0,
  },
  lastAccessed: {
    type: Date,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  usedAt: {
    type: Date,
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    lastLocation: String,
  },
}, {
  timestamps: true,
});

// Generate a secure random token
MagicLinkSchema.statics.generateToken = function() {
  return crypto.randomBytes(32).toString('hex');
};

// Check if token is valid and not expired
MagicLinkSchema.methods.isValid = function() {
  return this.status === 'active' && this.expiresAt > new Date();
};

// Check if token is expired
MagicLinkSchema.methods.isExpired = function() {
  return this.expiresAt <= new Date();
};

// Mark as used
MagicLinkSchema.methods.markAsUsed = function() {
  this.usedAt = new Date();
  this.status = 'expired';
};

// Increment click count
MagicLinkSchema.methods.recordClick = function(metadata = {}) {
  this.clicks += 1;
  this.lastAccessed = new Date();
  if (metadata.userAgent) this.metadata.userAgent = metadata.userAgent;
  if (metadata.ipAddress) this.metadata.ipAddress = metadata.ipAddress;
};

// Auto-expire old links (static method for cleanup)
MagicLinkSchema.statics.autoExpire = async function() {
  const result = await this.updateMany(
    { 
      expiresAt: { $lt: new Date() },
      status: 'active'
    },
    { 
      $set: { status: 'expired' }
    }
  );
  console.log(`⏰ Auto-expired ${result.modifiedCount} magic links`);
  return result;
};

export default mongoose.model('MagicLink', MagicLinkSchema);