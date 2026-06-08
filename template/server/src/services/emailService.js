import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

const ENABLED = process.env.ENABLE_EMAIL === 'true';
const FROM = process.env.EMAIL_FROM || 'noreply@example.com';

let transporter = null;

if (ENABLED) {
  transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
      user: 'apikey',
      pass: process.env.SENDGRID_API_KEY,
    },
  });
}

/**
 * Send a generic email. No-op when ENABLE_EMAIL is false.
 */
export async function sendEmail({ to, subject, html }) {
  if (!ENABLED) {
    logger.info(`Email disabled — skipping send to ${to}: "${subject}"`);
    return null;
  }

  const info = await transporter.sendMail({ from: FROM, to, subject, html });
  logger.info(`Email sent to ${to}: ${info.messageId}`);
  return info;
}

/**
 * Send a password-reset email. No-op when ENABLE_EMAIL is false.
 */
export async function sendPasswordReset(email, resetToken) {
  const resetUrl = `${process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

  return sendEmail({
    to: email,
    subject: 'Reset your password',
    html: `
      <h2>Password Reset</h2>
      <p>You requested a password reset. Click the link below to choose a new password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

/**
 * Send a welcome email. No-op when ENABLE_EMAIL is false.
 */
export async function sendWelcome(email, firstName) {
  return sendEmail({
    to: email,
    subject: 'Welcome to Forge!',
    html: `
      <h2>Welcome, ${firstName}!</h2>
      <p>Your account has been created successfully. You're all set to start using Forge.</p>
    `,
  });
}
