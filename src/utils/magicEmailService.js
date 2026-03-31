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

// Send magic link email to client
export const sendMagicLinkEmail = async ({
  to,
  clientName,
  projectName,
  approvalTitle,
  magicLink,
  workspaceName,
  expiresIn = '7 days'
}) => {
  try {
    const transporter = createTransporter();
    
    const subject = `Review requested: ${approvalTitle}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Review Request</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e1e5e9; border-top: none; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e5e9; color: #666; font-size: 12px; }
          .info-box { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin:0;">Review Request</h1>
        </div>
        <div class="content">
          <h2>Hello ${clientName || 'there'}!</h2>
          
          <p><strong>${workspaceName}</strong> has requested your feedback on:</p>
          
          <div class="info-box">
            <h3 style="margin-top:0;">${approvalTitle}</h3>
            <p><strong>Project:</strong> ${projectName}</p>
          </div>
          
          <div style="text-align: center;">
            <a href="${magicLink}" class="button" style="color: white">Review Now</a>
          </div>
          
          <p style="text-align: center; font-size: 14px; color: #666;">
            Or copy this link:<br>
            <span style="background: #f8f9fa; padding: 5px 10px; border-radius: 3px; font-family: monospace;">
              ${magicLink}
            </span>
          </p>
          
          <p><strong>⚠️ This link expires in ${expiresIn}</strong></p>
          <p>No login required - just click the link above.</p>
          
          <div class="footer">
            <p>This is an automated message from Decidely.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const text = `
Hello ${clientName || 'there'},

${workspaceName} has requested your feedback on: ${approvalTitle}

Project: ${projectName}

Click here to review: ${magicLink}

This link expires in ${expiresIn}. No login required.

This is an automated message from Decidely.
    `;
    
    const info = await transporter.sendMail({
      from: `"${workspaceName} via Decidely" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
      text: text,
    });
    
    console.log(`✅ Magic link email sent to ${to}`);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('❌ Failed to send magic link email:', error);
    throw error;
  }
};

// Send decision notification email to agency
export const sendDecisionNotificationEmail = async ({
  to,
  approvalTitle,
  projectName,
  clientEmail,
  clientName,
  decision,
  comment,
  decisionUrl
}) => {
  try {
    const transporter = createTransporter();
    
    const subject = `Client Decision: ${approvalTitle} - ${decision}`;
    
    const decisionColors = {
      approved: { bg: '#d4edda', color: '#155724', text: 'Approved' },
      changes: { bg: '#fff3cd', color: '#856404', text: 'Changes Requested' },
      blocked: { bg: '#f8d7da', color: '#721c24', text: 'Blocked' },
      pending: { bg: '#fff3cd', color: '#856404', text: 'Pending' }
    };
    
    const decisionStyle = decisionColors[decision] || decisionColors.pending;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Client Decision Received</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e1e5e9; border-top: none; border-radius: 0 0 10px 10px; }
          .decision-box { padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; font-weight: bold; font-size: 18px; }
          .comment-box { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #007bff; }
          .button { display: inline-block; background: #007bff; color: white; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e5e9; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin:0;">Client Decision Received</h1>
        </div>
        <div class="content">
          <h2>A client has submitted feedback!</h2>
          
          <div style="background: ${decisionStyle.bg}; color: ${decisionStyle.color}; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center; font-weight: bold;">
            Decision: ${decisionStyle.text}
          </div>
          
          <table style="width: 100%; margin: 20px 0;">
            <tr>
              <td style="padding: 8px 0;"><strong>Item:</strong></td>
              <td>${approvalTitle}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Project:</strong></td>
              <td>${projectName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Client:</strong></td>
              <td>${clientName || clientEmail}</td>
            </tr>
          </table>
          
          ${comment ? `
            <div class="comment-box">
              <h4 style="margin-top:0;">Client Comment:</h4>
              <p style="margin-bottom:0;">"${comment}"</p>
            </div>
          ` : ''}
          
          <div style="text-align: center;">
            <a href="${decisionUrl}" class="button">View in Dashboard</a>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from Decidely.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const text = `
Client Decision Received

A client has submitted feedback!

Item: ${approvalTitle}
Project: ${projectName}
Client: ${clientName || clientEmail}
Decision: ${decision}
${comment ? `Comment: ${comment}` : ''}

View in dashboard: ${decisionUrl}

This is an automated notification from Decidely.
    `;
    
    const info = await transporter.sendMail({
      from: `"Decidely Notifications" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
      text: text,
    });
    
    console.log(`✅ Decision notification email sent to ${to}`);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('❌ Failed to send decision notification email:', error);
    throw error;
  }
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
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invitation to Collaborate</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e1e5e9; border-top: none; border-radius: 0 0 10px 10px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e5e9; color: #666; font-size: 12px; }
          .info-box { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin:0;">Welcome to Decidely!</h1>
        </div>
        <div class="content">
          <h2>Hello ${clientName || 'there'}!</h2>
          
          <p><strong>${invitedBy}</strong> from <strong>${workspaceName}</strong> has invited you to collaborate on:</p>
          
          <div class="info-box">
            <h3 style="margin-top:0;">${projectName}</h3>
            <p>You'll be able to review and approve work items via email magic links - no account needed!</p>
          </div>
          
          <p>When someone shares an item for your review, you'll receive an email with a secure link. Just click to review and provide feedback.</p>
          
          <p><strong>✨ No password needed. No account creation.</strong></p>
          
          <div class="footer">
            <p>This invitation was sent by ${invitedBy} from ${workspaceName}.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const text = `
Hello ${clientName || 'there'},

${invitedBy} from ${workspaceName} has invited you to collaborate on: ${projectName}

You'll be able to review and approve work items via email magic links - no account needed!

When someone shares an item for your review, you'll receive an email with a secure link. Just click to review and provide feedback.

No password needed. No account creation.

This invitation was sent by ${invitedBy} from ${workspaceName}.
    `;
    
    const info = await transporter.sendMail({
      from: `"${workspaceName} via Decidely" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
      text: text,
    });
    
    console.log(`✅ Invitation email sent to ${to}`);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('❌ Failed to send invitation email:', error);
    throw error;
  }
};

// Test email function
export const testEmailService = async (testEmail = null) => {
  try {
    const emailTo = testEmail || process.env.GMAIL_USER;
    
    console.log('🧪 Testing email service...');
    
    await sendMagicLinkEmail({
      to: emailTo,
      clientName: 'Test Client',
      projectName: 'Test Project',
      approvalTitle: 'Test Approval',
      magicLink: 'https://yourapp.com/review/test123',
      workspaceName: 'Test Workspace',
      expiresIn: '7 days'
    });
    
    console.log('✅ Email test passed!');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Email test failed:', error);
    throw error;
  }
};