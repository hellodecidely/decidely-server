import mongoose from 'mongoose';

const approvalSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  media: {
    url: String,           // Public URL
    key: String,      // Google Cloud blob name (for deletion)
    filename: String,      // Original filename
    mimetype: String,      // MIME type
    size: Number,          // File size in bytes
    category: {
      type: String,
      enum: ['text', 'image', 'video', 'document', 'link'],
      default: 'other'
    },
    uploadedAt: Date
  },
  type: {
    type: String,
    enum: ['text', 'image', 'document', 'link' , 'video'],
    default: 'text'
  },
  link: {
    type: String,
    trim: true
  },
  deadline: {
    type: Date
  },
  clientEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  assignedTo: {
    type: String  // This can store client email or name
  },
  updatedByClient: {
    email: String,
    at: Date,
    comment: String
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'changes', 'blocked'],
    default: 'pending'
  },
  // Make content optional or remove required validation
  content: {
    text: {
      type: String,
      default: ''  // Change from required to default
    },
    type: {
      type: String,
      default: 'text'
    }
  },
  comments: [{
    text: String,
    type: {
      type: String,
      enum: ['internal', 'external'],
      default: 'internal'
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  activityLog: [{
    action: String,
    user: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: String
  }]
}, {
  timestamps: true
});

const Approval = mongoose.model('Approval', approvalSchema);


export default Approval;