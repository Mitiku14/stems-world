const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const env = require('../config/env');
const { TOKEN_TYPES, AUTH_PROVIDERS } = require('../constants');
const tokenService = require('../services/token.service');
const emailService = require('../services/email.service');

// ─── Google OAuth client ───────────────────────────────────────────────────────
// Instantiated once at module load — reused across all requests (stateless, safe)
const googleClient = new OAuth2Client(env.google.clientId);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Signs a JWT containing the user's id and role.
 * Identical for both local and Google users — downstream auth is unchanged.
 */
const signJwt = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    env.jwt.secret,
    { expiresIn: env.jwt.expire }
  );
};

/**
 * Formats the public user object returned in all auth responses.
 * Includes authProvider so the frontend can show/hide password-related UI.
 */
const formatUser = (user) => ({
  id: user._id,
  username: user.username,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  authProvider: user.authProvider,
});

/**
 * Generates a unique username from a display name.
 * Tries up to 5 times with a fresh random suffix each attempt to avoid collisions.
 * Falls back to a pure UUID-style suffix if all attempts fail.
 *
 * e.g. "John Doe" → "john_doe_3f2a"
 */
const generateUsername = async (displayName) => {
  const base = displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '_')   // replace non-alphanumeric with underscore
    .replace(/_+/g, '_')           // collapse consecutive underscores
    .replace(/^_|_$/g, '')         // trim leading/trailing underscores
    .substring(0, 20);             // cap base at 20 chars (leaves room for suffix)

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.random().toString(36).substring(2, 6); // 4-char alphanumeric
    const candidate = `${base}_${suffix}`;

    const exists = await User.findOne({ username: candidate }).lean();
    if (!exists) return candidate;
  }

  // Extremely unlikely to reach here — pure random fallback
  return `user_${Date.now().toString(36)}`;
};

/**
 * Verifies a Google ID token using google-auth-library.
 * Returns the payload if valid, throws ApiError if not.
 *
 * Checks: signature, expiry, issuer, and audience (your CLIENT_ID).
 * The audience check is critical — it ensures this token was issued for YOUR app.
 */
const verifyGoogleToken = async (idToken) => {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.google.clientId,
    });
    return ticket.getPayload();
  } catch {
    // Don't expose the raw google-auth-library error — it may leak internals
    throw new ApiError(401, 'Google authentication failed. The token is invalid or has expired. Please try again.');
  }
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Local registration. Creates account and sends verification email. No JWT yet.
 */
exports.register = asyncHandler(async (req, res) => {
  const { username, name, email, password, phone } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { username: username.toLowerCase() }] });
  if (existing) {
    throw new ApiError(409, 'An account with that email or username already exists.');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await User.create({
    username: username.toLowerCase(),
    name,
    email,
    password: hashedPassword,
    phone: phone || null,
    authProvider: AUTH_PROVIDERS.LOCAL,
  });

  const rawToken = await tokenService.createToken(user._id, TOKEN_TYPES.EMAIL_VERIFICATION);
  await emailService.sendVerificationEmail(user, rawToken);

  return res
    .status(201)
    .json(new ApiResponse(201, 'Registration successful. Please check your email to verify your account.'));
});

/**
 * GET /api/auth/verify-email/:token
 * Validates the email verification token and activates the account.
 */
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const tokenDoc = await tokenService.findToken(token, TOKEN_TYPES.EMAIL_VERIFICATION);

  if (!tokenDoc) {
    throw new ApiError(400, 'This verification link is invalid or has expired. Please request a new one.');
  }

  const user = await User.findById(tokenDoc.userId);

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  if (user.isEmailVerified) {
    await tokenService.deleteToken(tokenDoc);
    return res.json(new ApiResponse(200, 'Your email is already verified. You can log in.'));
  }

  user.isEmailVerified = true;
  await user.save();

  await tokenService.deleteToken(tokenDoc);

  // Fire and forget
  emailService.sendWelcomeEmail(user);

  return res.json(new ApiResponse(200, 'Email verified successfully. You can now log in.'));
});

/**
 * POST /api/auth/resend-verification
 * Resends a fresh verification email to an unverified local account.
 * Google users will silently no-op (they're already verified).
 */
exports.resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  const genericMsg = 'If that email exists and is unverified, a new verification link has been sent.';

  // Covers: user not found, already verified, and Google accounts (already verified)
  if (!user || user.isEmailVerified) {
    return res.json(new ApiResponse(200, genericMsg));
  }

  const rawToken = await tokenService.createToken(user._id, TOKEN_TYPES.EMAIL_VERIFICATION);
  await emailService.sendVerificationEmail(user, rawToken);

  return res.json(new ApiResponse(200, genericMsg));
});

/**
 * POST /api/auth/login
 * Local login — accepts email OR username in "identifier".
 * Guards against OAuth accounts attempting password login.
 */
exports.login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  const isEmail = identifier.includes('@');
  const query = isEmail
    ? { email: identifier.toLowerCase().trim() }
    : { username: identifier.toLowerCase().trim() };

  const user = await User.findOne(query).select('+password');

  if (!user) {
    throw new ApiError(401, 'Invalid credentials. Please check your email/username and password.');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Your account has been disabled. Please contact support.');
  }

  // Guard: Google-only account trying password login
  if (user.authProvider === AUTH_PROVIDERS.GOOGLE) {
    throw new ApiError(
      400,
      'This account was created with Google Sign-In and does not have a password. Please sign in with Google.'
    );
  }

  if (!user.isEmailVerified) {
    throw new ApiError(
      403,
      'Please verify your email before logging in. Check your inbox or request a new verification link.'
    );
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);

  if (!isPasswordMatch) {
    throw new ApiError(401, 'Invalid credentials. Please check your email/username and password.');
  }

  const token = signJwt(user);

  return res.json(new ApiResponse(200, 'Login successful.', { token, user: formatUser(user) }));
});

/**
 * POST /api/auth/google
 * ─────────────────────────────────────────────────────────────────────────────
 * Single endpoint that handles all four Google Sign-In scenarios:
 *
 *   1. New Google user      → create account, issue JWT
 *   2. Returning Google user → find by googleId, issue JWT
 *   3. Existing local user, first Google sign-in (same email) → link accounts, issue JWT
 *   4. Disabled account     → reject with 403
 *
 * The frontend sends the ID token received from Google's SDK.
 * This backend verifies it cryptographically — the raw token is never stored.
 */
exports.googleSignIn = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  // ── 1. Verify token with Google ──────────────────────────────────────────
  const payload = await verifyGoogleToken(idToken);

  const { sub: googleId, email, name, picture: avatar, email_verified } = payload;

  // Reject unverified Google emails — security requirement
  if (!email_verified) {
    throw new ApiError(
      400,
      'Your Google account email is not verified. Please verify it with Google before signing in.'
    );
  }

  // Guard: no email in payload (rare but possible in some Workspace configurations)
  if (!email) {
    throw new ApiError(
      400,
      'Your Google account does not provide an email address. Please use email/password registration instead.'
    );
  }

  // ── 2. Look up user by googleId (fastest path for returning users) ────────
  let user = await User.findOne({ googleId });

  if (user) {
    // Returning Google user — just check their account status and issue JWT
    if (!user.isActive) {
      throw new ApiError(403, 'Your account has been disabled. Please contact support.');
    }

    return res.json(new ApiResponse(200, 'Signed in with Google successfully.', {
      token: signJwt(user),
      user: formatUser(user),
    }));
  }

  // ── 3. Look up by email (handles account linking + new local-user detection) ─
  user = await User.findOne({ email });

  if (user) {
    // Account exists — check if it's disabled before doing anything
    if (!user.isActive) {
      throw new ApiError(403, 'Your account has been disabled. Please contact support.');
    }

    // Link the Google account to the existing local account.
    // Safe because Google has verified ownership of this email (email_verified = true above).
    user.googleId = googleId;

    // Only update avatar if the user doesn't already have one set
    if (!user.avatar) {
      user.avatar = avatar || null;
    }

    // If the local account wasn't email-verified yet, Google's verification covers it
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
    }

    // Keep authProvider as 'local' — the account was originally local.
    // The googleId field being set is enough to identify the link.
    // (If you want to track multi-provider, this would be pushed to a providers array)
    await user.save();

    return res.json(new ApiResponse(200, 'Google account linked and signed in successfully.', {
      token: signJwt(user),
      user: formatUser(user),
    }));
  }

  // ── 4. No existing account — create a new one ─────────────────────────────
  const username = await generateUsername(name || email.split('@')[0]);

  const newUser = await User.create({
    username,
    name: name || email.split('@')[0],
    email,
    googleId,
    avatar: avatar || null,
    authProvider: AUTH_PROVIDERS.GOOGLE,
    isEmailVerified: true,  // Google has already verified this email
    // password is intentionally omitted — Google users have no password
  });

  // Welcome email — fire and forget (same as local registration welcome)
  emailService.sendWelcomeEmail(newUser);

  return res.status(201).json(
    new ApiResponse(201, 'Account created and signed in with Google successfully.', {
      token: signJwt(newUser),
      user: formatUser(newUser),
    })
  );
});

/**
 * POST /api/auth/forgot-password
 * Guards against Google-only accounts requesting a password reset.
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const genericMsg = 'If an account with that email exists, a password reset link has been sent.';

  const user = await User.findOne({ email });

  if (!user) {
    return res.json(new ApiResponse(200, genericMsg));
  }

  // Guard: Google-only account has no password to reset.
  // Return the generic message — same as "not found" — to avoid revealing
  // that this email is registered and which provider it uses.
  if (user.authProvider === AUTH_PROVIDERS.GOOGLE) {
    return res.json(new ApiResponse(200, genericMsg));
  }

  const rawToken = await tokenService.createToken(user._id, TOKEN_TYPES.PASSWORD_RESET);
  await emailService.sendPasswordResetEmail(user, rawToken);

  return res.json(new ApiResponse(200, genericMsg));
});

/**
 * POST /api/auth/reset-password/:token
 * Validates the reset token and updates the password.
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const tokenDoc = await tokenService.findToken(token, TOKEN_TYPES.PASSWORD_RESET);

  if (!tokenDoc) {
    throw new ApiError(400, 'This password reset link is invalid or has expired. Please request a new one.');
  }

  const user = await User.findById(tokenDoc.userId).select('+password');

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  // Prevent reusing the same password
  const isSamePassword = await bcrypt.compare(password, user.password);
  if (isSamePassword) {
    throw new ApiError(400, 'New password cannot be the same as your current password.');
  }

  user.password = await bcrypt.hash(password, 12);
  await user.save();

  await tokenService.deleteToken(tokenDoc);

  return res.json(new ApiResponse(200, 'Password reset successful. You can now log in with your new password.'));
});

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile.
 * Now includes authProvider and avatar so the frontend can adapt its UI.
 */
exports.getMe = asyncHandler(async (req, res) => {
  const user = req.user;

  return res.json(
    new ApiResponse(200, 'Profile fetched successfully.', {
      id: user._id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      authProvider: user.authProvider,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    })
  );
});

/**
 * PUT /api/auth/me
 * Updates profile (name, phone). Works for both local and Google users.
 */
exports.updateMe = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { name, phone },
    { new: true, runValidators: true }
  );

  return res.json(
    new ApiResponse(200, 'Profile updated successfully.', {
      id: updatedUser._id,
      username: updatedUser.username,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      avatar: updatedUser.avatar,
      authProvider: updatedUser.authProvider,
    })
  );
});

/**
 * PUT /api/auth/me/change-password
 * Local users only — guarded against Google accounts.
 */
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Guard: Google-only account has no password to change
  if (req.user.authProvider === AUTH_PROVIDERS.GOOGLE) {
    throw new ApiError(
      400,
      'This account uses Google Sign-In and does not have a password. Sign in with Google to access your account.'
    );
  }

  const user = await User.findById(req.user._id).select('+password');

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Current password is incorrect.');
  }

  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();

  return res.json(new ApiResponse(200, 'Password changed successfully.'));
});

/**
 * POST /api/auth/logout
 * JWT is stateless — invalidation is client-side.
 * Works identically for local and Google users.
 */
exports.logout = asyncHandler(async (req, res) => {
  return res.json(new ApiResponse(200, 'Logged out successfully. Please discard your token.'));
});
