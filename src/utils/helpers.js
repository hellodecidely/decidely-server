import jwt from 'jsonwebtoken';

// Generate magic link token
export const generateMagicLinkToken = (email, projectId) => {
  const expiresIn = process.env.MAGIC_LINK_EXPIRE_DAYS || 7;
  
  return jwt.sign(
    {
      email,
      projectId,
      type: 'magic_link',
    },
    process.env.JWT_SECRET,
    { expiresIn: `${expiresIn}d` }
  );
};

// Generate approval URL
export const generateApprovalUrl = (token) => {
  return `${process.env.CLIENT_URL}/approve/${token}`;
};

// Format date
export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Calculate status color
export const getStatusColor = (status) => {
  const colors = {
    pending: 'warning',
    approved: 'success',
    changes_requested: 'danger',
    blocked: 'secondary',
  };
  return colors[status] || 'secondary';
};