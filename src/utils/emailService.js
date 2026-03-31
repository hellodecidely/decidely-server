import nodemailer from 'nodemailer';

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });
};

// Send client invitation email
export const sendClientInvitationEmail = async ({ 
  to, 
  clientName, 
  projectName, 
  workspaceName, 
  invitedBy 
}) => {
  try {
    const transporter = createTransporter();
    
    const subject = `Invitation to collaborate on ${projectName}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0;">Welcome to Decidely!</h1>
        </div>
        
        <div style="padding: 30px; background: #f9f9f9;">
          <h2>Hello ${clientName || 'there'}!</h2>
          
          <p><strong>${invitedBy}</strong> from <strong>${workspaceName}</strong> has invited you to collaborate on the project:</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <h3 style="margin-top: 0;">${projectName}</h3>
            <p>You'll be able to review and approve work items, provide feedback, and track progress - all without creating an account.</p>
          </div>
          
          <p>When someone shares an item for your review, you'll receive an email with a magic link. Just click the link to review and provide feedback.</p>
          
          <div style="background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0;"><strong>✨ No account needed!</strong> Simply click the review links you receive via email.</p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;" />
          
          <p style="color: #666; font-size: 12px; text-align: center;">
            This invitation was sent by ${invitedBy} from ${workspaceName}.<br/>
            If you believe this was sent in error, please ignore this email.
          </p>
        </div>
      </div>
    `;
    
    const text = `
Hello ${clientName || 'there'},

${invitedBy} from ${workspaceName} has invited you to collaborate on the project: ${projectName}

You'll be able to review and approve work items, provide feedback, and track progress - all without creating an account.

When someone shares an item for your review, you'll receive an email with a magic link. Just click the link to review and provide feedback.

No account needed! Simply click the review links you receive via email.

This invitation was sent by ${invitedBy} from ${workspaceName}.
If you believe this was sent in error, please ignore this email.
    `;
    
    const mailOptions = {
      from: `"${workspaceName} via Decidely" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
      text: text,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Invitation email sent:', info.messageId);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send invitation email:', error);
    throw error;
  }
};

// Send magic link email
export const sendMagicLinkEmail = async ({ 
  to, 
  clientName, 
  projectName, 
  approvalTitle, 
  magicLink,
  workspaceName 
}) => {
  try {
    const transporter = createTransporter();
    
    const subject = `Review requested: ${approvalTitle}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0;">Review Request</h1>
        </div>
        
        <div style="padding: 30px; background: #f9f9f9;">
          <h2>Hello ${clientName || 'there'}!</h2>
          
          <p><strong>${workspaceName}</strong> has requested your feedback on:</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <h3 style="margin-top: 0;">${approvalTitle}</h3>
            <p><strong>Project:</strong> ${projectName}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLink}" 
               style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Review Now
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; text-align: center;">
            This link will expire in 7 days. No login required.
          </p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;" />
          
          <p style="color: #666; font-size: 12px; text-align: center;">
            This is an automated message from Decidely.
          </p>
        </div>
      </div>
    `;
    
    const text = `
Hello ${clientName || 'there'},

${workspaceName} has requested your feedback on: ${approvalTitle}

Project: ${projectName}

Click here to review: ${magicLink}

This link will expire in 7 days. No login required.

This is an automated message from Decidely.
    `;
    
    const mailOptions = {
      from: `"${workspaceName} via Decidely" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
      text: text,
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Magic link email sent:', info.messageId);
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send magic link email:', error);
    throw error;
  }
};