import User from '../models/User.js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';


// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const { email, password, name, company } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        error: 'User already exists',
      });
    }

    // Create user
    const user = await User.create({
      email,
      password,
      name,
      company,
      role: 'agency_owner',
      plan: 'free', // ✅ Default to free plan
    });

    // Create token
    const token = user.getSignedJwtToken();

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        company: user.company,
        role: user.role,
        plan: user.plan, // ✅ ADD THIS
      },
    });
  } catch (error) {
    next(error);
  }
};


// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password',
      });
    }

    // Check for user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Check if plan expired
    if (user.plan !== 'free' && user.planExpiresAt && user.planExpiresAt < new Date()) {
      user.plan = 'free';
      user.planExpiresAt = null;
      await user.save();
    }

    // Update last active
    await User.findByIdAndUpdate(user._id, { lastActive: new Date() });

    // Create token
    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        company: user.company,
        role: user.role,
        avatar: user.avatar,
        plan: user.plan, // ✅ ADD THIS - CRITICAL!
        planExpiresAt: user.planExpiresAt, // ✅ ADD THIS - good to have
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Server error during login',
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        company: user.company,
        role: user.role,
        avatar: user.avatar,
        plan: user.plan, // ✅ ADD THIS
        planExpiresAt: user.planExpiresAt, // ✅ ADD THIS
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/update
// @access  Private
export const updateProfile = async (req, res, next) => {
  try {
    const { name, company } = req.body;
    const fieldsToUpdate = {};

    if (name) fieldsToUpdate.name = name;
    if (company) fieldsToUpdate.company = company;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      fieldsToUpdate,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        company: user.company,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};


export const getUserUsage = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.json({
      success: true,
      data: user.getUsageStats()
    });
  } catch (error) {
    console.error('Error getting user usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get usage stats'
    });
  }
};


export const checkTokenStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({
      tokenVersionInJWT: req.user.tokenVersion,
      tokenVersionInDB: user.tokenVersion,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
      match: user.tokenVersion === req.user.tokenVersion,
      message: user.tokenVersion !== req.user.tokenVersion ? 'YOU SHOULD BE LOGGED OUT!' : 'Token is valid'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const validateToken = async (req, res) => {
  try {
    // Token is already validated by protect middleware
    // Just return success
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getCurrentPlan = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    let limits = {
      workspaces: 2,
      projects: 4,
      approvals: 20,
      imageDocSize: 10,   // Images & Documents limit in MB
      videoSize: 20       // Videos limit in MB
    };
    
    if (user.plan === 'pro') {
      limits = {
        workspaces: 20,
        projects: 40,
        approvals: 200,
        imageDocSize: 20,  // 20MB for images/documents
        videoSize: 40      // 40MB for videos
      };
    } else if (user.plan === 'agency') {
      limits = {
        workspaces: 'Unlimited',
        projects: 'Unlimited',
        approvals: 'Unlimited',
        imageDocSize: 40,  // 40MB for images/documents
        videoSize: 60      // 60MB for videos
      };
    }
    
    res.json({
      success: true,
      plan: user.plan || 'free',
      planExpiresAt: user.planExpiresAt || null,
      limits: limits
    });
  } catch (error) {
    console.error('Error getting plan:', error);
    res.status(500).json({ error: error.message });
  }
};


// @desc    Forgot password - send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'No user found with this email address'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token and save to database
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    
    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e1e5e9; border-top: none; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e5e9; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin:0;">Reset Your Password</h1>
        </div>
        <div class="content">
          <p>Hello ${user.name},</p>
          <p>We received a request to reset your password for your Decidely account.</p>
          <p>Click the button below to create a new password. This link will expire in 10 minutes.</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button" style="color: white">Reset Password</a>
          </div>
          
          <p>Or copy this link: <br/>
            <code style="background: #f8f9fa; padding: 5px 10px; border-radius: 3px;">
              ${resetUrl}
            </code>
          </p>
          
          <p>If you didn't request this, please ignore this email.</p>
          
          <div class="footer">
            <p>This is an automated message from Decidely.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: `"Decidely" <${process.env.GMAIL_USER}>`,
      to: user.email,
      subject: 'Reset Your Password',
      html,
    });

    res.json({
      success: true,
      message: 'Password reset email sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    
    // Clear token if email fails
    User.resetPasswordToken = undefined;
    User.resetPasswordExpire = undefined;
    await User.save({ validateBeforeSave: false });
    
    res.status(500).json({
      success: false,
      error: 'Failed to send reset email'
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Hash token to compare with database
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    
    await user.save();

    // Generate new JWT token
    const newToken = user.getSignedJwtToken();

    res.json({
      success: true,
      token: newToken,
      message: 'Password reset successful'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password'
    });
  }
};

// @desc    Validate reset token
// @route   GET /api/auth/validate-reset-token/:token
// @access  Public
export const validateResetToken = async (req, res) => {
  try {
    const { token } = req.params;
    
    console.log('🔍 Validate reset token - Token received:', token);
    
    // Hash the token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    console.log('🔍 Hashed token:', hashedToken);
    
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });
    
    console.log('🔍 User found:', user ? user.email : 'No user found');
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }
    
    res.json({
      success: true,
      message: 'Token is valid'
    });
  } catch (error) {
    console.error('Validate token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate token'
    });
  }
};


// @desc    Change password
// @route   POST /api/auth/change-password
// @access  Private
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Please provide current password and new password'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters'
      });
    }
    
    // Get user from database with password field
    const user = await User.findById(req.user._id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // ✅ Use matchPassword method from your model
    const isMatch = await user.matchPassword(currentPassword);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Update password (pre-save hook will hash it)
    user.password = newPassword;
    await user.save();
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
};