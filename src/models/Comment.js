import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Please add comment text'],
    trim: true,
  },
  approvalItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalItem',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    // Can be null for guest comments via magic link
  },
  userEmail: {
    type: String,
    required: function() {
      return !this.user;
    },
  },
  userName: {
    type: String,
    required: true,
  },
  attachments: [{
    url: String,
    type: String,
    name: String,
  }],
  internal: {
    type: Boolean,
    default: false,
  },
  resolved: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

export default mongoose.model('Comment', CommentSchema);