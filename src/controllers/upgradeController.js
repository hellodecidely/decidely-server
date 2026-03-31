// controllers/upgradeController.js
import User from '../models/User.js';
import { sendUpgradeRequestEmail, sendPaymentLinkEmail } from '../utils/emailService.js';

// Store upgrade requests (in production, use a database collection)
const upgradeRequests = [];

// Request upgrade (sends email to you)
export const requestUpgrade = async (req, res) => {
  try {
    const { name, email, company, plan, message } = req.body;
    const userId = req.user?.id; // If user is logged in

    // Store the request
    const requestId = Date.now().toString();
    upgradeRequests.push({
      id: requestId,
      userId,
      name,
      email,
      company,
      plan,
      message,
      status: 'pending',
      createdAt: new Date(),
      paymentLink: null
    });

    // Send email to YOU (the admin)
    await sendUpgradeRequestEmail({
      to: 'hello@ceolcore.com', // Your custom email
      fromName: name,
      fromEmail: email,
      company,
      plan,
      message,
      requestId
    });

    res.status(200).json({
      success: true,
      message: 'Upgrade request received. We\'ll contact you within 24 hours.',
      requestId
    });
  } catch (error) {
    console.error('Error processing upgrade request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process upgrade request'
    });
  }
};

// Admin: Get all pending requests
export const getPendingRequests = async (req, res) => {
  // In production, add admin authentication
  const pending = upgradeRequests.filter(r => r.status === 'pending');
  res.json({ success: true, data: pending });
};

// Admin: Send payment link to customer
export const sendPaymentLink = async (req, res) => {
  try {
    const { requestId, paymentLink } = req.body;
    
    const request = upgradeRequests.find(r => r.id === requestId);
    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    // Update request
    request.paymentLink = paymentLink;
    request.status = 'payment_sent';

    // Send payment link email to customer
    await sendPaymentLinkEmail({
      to: request.email,
      name: request.name,
      plan: request.plan,
      paymentLink,
      amount: request.plan === 'Pro' ? '$19' : '$49'
    });

    res.json({ success: true, message: 'Payment link sent to customer' });
  } catch (error) {
    console.error('Error sending payment link:', error);
    res.status(500).json({ success: false, error: 'Failed to send payment link' });
  }
};

// Admin: Activate user account after payment
export const activateProAccount = async (req, res) => {
  try {
    const { email, plan } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Update user's plan
    user.plan = plan === 'Pro' ? 'pro' : 'agency';
    user.planActivatedAt = new Date();
    user.planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await user.save();

    // Send confirmation email
    await sendActivationEmail({
      to: user.email,
      name: user.name,
      plan
    });

    res.json({ 
      success: true, 
      message: `${plan} account activated for ${email}` 
    });
  } catch (error) {
    console.error('Error activating account:', error);
    res.status(500).json({ success: false, error: 'Failed to activate account' });
  }
};