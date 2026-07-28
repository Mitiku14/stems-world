const nodemailer = require('nodemailer');
const env = require('../config/env');

/**
 * Single shared transporter — created once at module load, reused for every send.
 * Nodemailer transporters manage their own connection pool internally;
 * recreating on every call wastes that benefit.
 */
const transporter = nodemailer.createTransport({
  host: env.email.host,
  port: env.email.port,
  auth: {
    user: env.email.user,
    pass: env.email.pass,
  },
});

/**
 * Core send function — all public methods funnel through here.
 * Errors are logged but NOT thrown — email failure should never crash a request.
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: env.email.from,
      to,
      subject,
      html,
    });
  } catch (error) {
    // Log but don't propagate — a failed email should not fail the API response
    console.error(`[EmailService] Failed to send "${subject}" to ${to}:`, error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sent immediately after a student registers.
 * Contains the link they must click to verify their email address.
 */
const sendVerificationEmail = async (user, rawToken) => {
  const verifyUrl = `${env.clientUrl}/verify-email/${rawToken}`;

  await sendEmail({
    to: user.email,
    subject: 'Verify Your Email Address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to the E-Learning Platform, ${user.name}!</h2>
        <p>Thank you for registering. Please verify your email address to activate your account.</p>
        <p>
          <a href="${verifyUrl}"
             style="display:inline-block; padding:12px 24px; background:#4F46E5;
                    color:#fff; text-decoration:none; border-radius:6px; font-weight:bold;">
            Verify Email Address
          </a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break:break-all; color:#6B7280;">${verifyUrl}</p>
        <p><strong>This link expires in 24 hours.</strong></p>
        <hr/>
        <p style="color:#9CA3AF; font-size:12px;">
          If you did not create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
};

/**
 * Sent after a student successfully verifies their email.
 */
const sendWelcomeEmail = async (user) => {
  await sendEmail({
    to: user.email,
    subject: 'Welcome — Your Account is Active!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You're all set, ${user.name}!</h2>
        <p>Your email has been verified and your account is now active.</p>
        <p>You can now log in, browse courses, and enroll.</p>
        <p>
          <a href="${env.clientUrl}/login"
             style="display:inline-block; padding:12px 24px; background:#4F46E5;
                    color:#fff; text-decoration:none; border-radius:6px; font-weight:bold;">
            Go to Login
          </a>
        </p>
      </div>
    `,
  });
};

/**
 * Sent when a student submits a course enrollment.
 */
const sendEnrollmentSubmittedEmail = async (user, course) => {
  await sendEmail({
    to: user.email,
    subject: `Enrollment Submitted — ${course.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Enrollment Received</h2>
        <p>Hi ${user.name},</p>
        <p>Your enrollment request for <strong>${course.title}</strong> has been submitted successfully.</p>
        <p>Your enrollment is currently <strong>Pending</strong> review by our admin team.</p>
        <p>You will receive an email once your enrollment has been reviewed.</p>
        <hr/>
        <p style="color:#9CA3AF; font-size:12px;">E-Learning Platform</p>
      </div>
    `,
  });
};

/**
 * Sent when an admin approves a student's enrollment.
 */
const sendEnrollmentApprovedEmail = async (user, course) => {
  const courseUrl = `${env.clientUrl}/courses/${course._id}`;

  await sendEmail({
    to: user.email,
    subject: `Enrollment Approved — ${course.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>🎉 Enrollment Approved!</h2>
        <p>Hi ${user.name},</p>
        <p>Great news! Your enrollment in <strong>${course.title}</strong> has been <strong>approved</strong>.</p>
        <p>You can now access the course content.</p>
        <p>
          <a href="${courseUrl}"
             style="display:inline-block; padding:12px 24px; background:#10B981;
                    color:#fff; text-decoration:none; border-radius:6px; font-weight:bold;">
            Access Course
          </a>
        </p>
        <hr/>
        <p style="color:#9CA3AF; font-size:12px;">E-Learning Platform</p>
      </div>
    `,
  });
};

/**
 * Sent when an admin rejects a student's enrollment.
 */
const sendEnrollmentRejectedEmail = async (user, course, rejectionReason) => {
  await sendEmail({
    to: user.email,
    subject: `Enrollment Update — ${course.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Enrollment Not Approved</h2>
        <p>Hi ${user.name},</p>
        <p>Unfortunately, your enrollment request for <strong>${course.title}</strong> has been <strong>rejected</strong>.</p>
        <p><strong>Reason:</strong></p>
        <blockquote style="border-left:4px solid #EF4444; padding-left:12px; color:#374151;">
          ${rejectionReason}
        </blockquote>
        <p>You are welcome to re-apply once you have addressed the issue above.</p>
        <hr/>
        <p style="color:#9CA3AF; font-size:12px;">E-Learning Platform</p>
      </div>
    `,
  });
};

/**
 * Sent when a student requests a password reset.
 */
const sendPasswordResetEmail = async (user, rawToken) => {
  const resetUrl = `${env.clientUrl}/reset-password/${rawToken}`;

  await sendEmail({
    to: user.email,
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>Hi ${user.name},</p>
        <p>We received a request to reset your password. Click the button below to proceed.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block; padding:12px 24px; background:#4F46E5;
                    color:#fff; text-decoration:none; border-radius:6px; font-weight:bold;">
            Reset Password
          </a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break:break-all; color:#6B7280;">${resetUrl}</p>
        <p><strong>This link expires in 30 minutes.</strong></p>
        <hr/>
        <p style="color:#9CA3AF; font-size:12px;">
          If you did not request a password reset, you can safely ignore this email.
          Your password will not be changed.
        </p>
      </div>
    `,
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
