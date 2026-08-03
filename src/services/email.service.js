const nodemailer = require('nodemailer');
const env = require('../config/env');

// Lazy transporter — created on first use so env vars are guaranteed to be loaded.
// This prevents issues on Render where the module may load before env is fully injected.
let _transporter = null;
const getTransporter = () => {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      auth: { user: env.email.user, pass: env.email.pass },
    });
  }
  return _transporter;
};

const sendEmail = async ({ to, subject, html }) => {
  try {
    await getTransporter().sendMail({ from: env.email.from, to, subject, html });
  } catch (error) {
    console.error(`[EmailService] Failed to send "${subject}" to ${to}:`, error.message);
  }
};

const sendVerificationEmail = (user, rawToken) => {
  const verifyUrl = `${env.clientUrl}/verify-email/${rawToken}`;
  return sendEmail({
    to: user.email,
    subject: 'Verify Your Email Address',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2>Welcome to the E-Learning Platform, ${user.name}!</h2>
        <p>Please verify your email address to activate your account.</p>
        <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Verify Email Address</a></p>
        <p>Or copy this link: <span style="word-break:break-all;color:#6B7280">${verifyUrl}</span></p>
        <p><strong>This link expires in 24 hours.</strong></p>
        <p style="color:#9CA3AF;font-size:12px">If you did not create an account, you can safely ignore this email.</p>
      </div>`,
  });
};

const sendWelcomeEmail = (user) =>
  sendEmail({
    to: user.email,
    subject: 'Welcome — Your Account is Active!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2>You're all set, ${user.name}!</h2>
        <p>Your email has been verified and your account is now active.</p>
        <p><a href="${env.clientUrl}/login" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Go to Login</a></p>
      </div>`,
  });

const sendEnrollmentSubmittedEmail = (user, course) =>
  sendEmail({
    to: user.email,
    subject: `Enrollment Submitted — ${course.title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2>Enrollment Received</h2>
        <p>Hi ${user.name},</p>
        <p>Your enrollment for <strong>${course.title}</strong> has been submitted and is <strong>Pending</strong> review.</p>
        <p>You will be notified once it has been reviewed.</p>
        <p style="color:#9CA3AF;font-size:12px">E-Learning Platform</p>
      </div>`,
  });

const sendEnrollmentApprovedEmail = (user, course) =>
  sendEmail({
    to: user.email,
    subject: `Enrollment Approved — ${course.title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2>🎉 Enrollment Approved!</h2>
        <p>Hi ${user.name},</p>
        <p>Your enrollment in <strong>${course.title}</strong> has been <strong>approved</strong>.</p>
        <p><a href="${env.clientUrl}/courses/${course._id}" style="display:inline-block;padding:12px 24px;background:#10B981;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Access Course</a></p>
        <p style="color:#9CA3AF;font-size:12px">E-Learning Platform</p>
      </div>`,
  });

const sendEnrollmentRejectedEmail = (user, course, rejectionReason) =>
  sendEmail({
    to: user.email,
    subject: `Enrollment Update — ${course.title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2>Enrollment Not Approved</h2>
        <p>Hi ${user.name},</p>
        <p>Your enrollment for <strong>${course.title}</strong> has been <strong>rejected</strong>.</p>
        <p><strong>Reason:</strong></p>
        <blockquote style="border-left:4px solid #EF4444;padding-left:12px;color:#374151">${rejectionReason}</blockquote>
        <p>You are welcome to re-apply once you have addressed the issue above.</p>
        <p style="color:#9CA3AF;font-size:12px">E-Learning Platform</p>
      </div>`,
  });

const sendPasswordResetEmail = (user, rawToken) => {
  const resetUrl = `${env.clientUrl}/reset-password/${rawToken}`;
  return sendEmail({
    to: user.email,
    subject: 'Password Reset Request',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2>Password Reset</h2>
        <p>Hi ${user.name},</p>
        <p>Click the button below to reset your password.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Reset Password</a></p>
        <p>Or copy this link: <span style="word-break:break-all;color:#6B7280">${resetUrl}</span></p>
        <p><strong>This link expires in 30 minutes.</strong></p>
        <p style="color:#9CA3AF;font-size:12px">If you did not request this, you can safely ignore this email.</p>
      </div>`,
  });
};

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendEnrollmentSubmittedEmail,
  sendEnrollmentApprovedEmail,
  sendEnrollmentRejectedEmail,
  sendPasswordResetEmail,
};
