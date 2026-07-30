const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const User         = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError     = require('../utils/ApiError');
const ApiResponse  = require('../utils/ApiResponse');
const env          = require('../config/env');
const { TOKEN_TYPES, AUTH_PROVIDERS } = require('../constants');
const tokenService = require('../services/token.service');
const emailService = require('../services/email.service');

const googleClient = new OAuth2Client(env.google.clientId);

// ── Helpers ──────────────────────────────────────────────────────────────────

const signJwt = (user) =>
  jwt.sign({ id: user._id, role: user.role }, env.jwt.secret, { expiresIn: env.jwt.expire });

const formatUser = (user) => ({
  id:           user._id,
  username:     user.username,
  name:         user.name,
  email:        user.email,
  role:         user.role,
  avatar:       user.avatar,
  authProvider: user.authProvider,
});

const generateUsername = async (displayName) => {
  const base = displayName
    .toLowerCase().trim()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 20);

  for (let i = 0; i < 5; i++) {
    const candidate = `${base}_${Math.random().toString(36).substring(2, 6)}`;
    const exists = await User.findOne({ username: candidate }).lean();
    if (!exists) return candidate;
  }
  return `user_${Date.now().toString(36)}`;
};

const verifyGoogleToken = async (idToken) => {
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.google.clientId });
    return ticket.getPayload();
  } catch {
    throw new ApiError(401, 'Google authentication failed. The token is invalid or has expired. Please try again.');
  }
};

// ── Controllers ───────────────────────────────────────────────────────────────

exports.register = asyncHandler(async (req, res) => {
  const { username, name, email, password, phone } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { username: username.toLowerCase() }] });
  if (existing) throw new ApiError(409, 'An account with that email or username already exists.');

  const user = await User.create({
    username: username.toLowerCase(),
    name,
    email,
    password: await bcrypt.hash(password, 12),
    phone: phone || null,
    authProvider: AUTH_PROVIDERS.LOCAL,
  });

  const rawToken = await tokenService.createToken(user._id, TOKEN_TYPES.EMAIL_VERIFICATION);
  await emailService.sendVerificationEmail(user, rawToken);

  return res.status(201).json(
    new ApiResponse(201, 'Registration successful. Please check your email to verify your account.')
  );
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const tokenDoc = await tokenService.findToken(req.params.token, TOKEN_TYPES.EMAIL_VERIFICATION);
  if (!tokenDoc) throw new ApiError(400, 'This verification link is invalid or has expired. Please request a new one.');

  const user = await User.findById(tokenDoc.userId);
  if (!user) throw new ApiError(404, 'User not found.');

  if (user.isEmailVerified) {
    await tokenService.deleteToken(tokenDoc);
    return res.json(new ApiResponse(200, 'Your email is already verified. You can log in.'));
  }

  user.isEmailVerified = true;
  await user.save();
  await tokenService.deleteToken(tokenDoc);
  emailService.sendWelcomeEmail(user);

  return res.json(new ApiResponse(200, 'Email verified successfully. You can now log in.'));
});

exports.resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const genericMsg = 'If that email exists and is unverified, a new verification link has been sent.';
  const user = await User.findOne({ email });

  if (!user || user.isEmailVerified) return res.json(new ApiResponse(200, genericMsg));

  const rawToken = await tokenService.createToken(user._id, TOKEN_TYPES.EMAIL_VERIFICATION);
  await emailService.sendVerificationEmail(user, rawToken);

  return res.json(new ApiResponse(200, genericMsg));
});

exports.login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  const isEmail = identifier.includes('@');
  const query   = isEmail
    ? { email: identifier.toLowerCase().trim() }
    : { username: identifier.toLowerCase().trim() };

  const user = await User.findOne(query).select('+password');

  if (!user) throw new ApiError(401, 'Invalid credentials. Please check your email/username and password.');
  if (!user.isActive) throw new ApiError(403, 'Your account has been disabled. Please contact support.');

  if (user.authProvider === AUTH_PROVIDERS.GOOGLE) {
    throw new ApiError(400, 'This account was created with Google Sign-In and does not have a password. Please sign in with Google.');
  }

  if (!user.isEmailVerified) {
    throw new ApiError(403, 'Please verify your email before logging in. Check your inbox or request a new verification link.');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new ApiError(401, 'Invalid credentials. Please check your email/username and password.');

  return res.json(new ApiResponse(200, 'Login successful.', { token: signJwt(user), user: formatUser(user) }));
});

exports.googleSignIn = asyncHandler(async (req, res) => {
  const payload = await verifyGoogleToken(req.body.idToken);
  const { sub: googleId, email, name, picture: avatar, email_verified } = payload;

  if (!email_verified) {
    throw new ApiError(400, 'Your Google account email is not verified. Please verify it with Google before signing in.');
  }
  if (!email) {
    throw new ApiError(400, 'Your Google account does not provide an email address. Please use email/password registration instead.');
  }

  // Fast path: returning Google user
  let user = await User.findOne({ googleId });
  if (user) {
    if (!user.isActive) throw new ApiError(403, 'Your account has been disabled. Please contact support.');
    return res.json(new ApiResponse(200, 'Signed in with Google successfully.', { token: signJwt(user), user: formatUser(user) }));
  }

  // Account linking: existing local account with same email
  user = await User.findOne({ email });
  if (user) {
    if (!user.isActive) throw new ApiError(403, 'Your account has been disabled. Please contact support.');
    user.googleId = googleId;
    if (!user.avatar) user.avatar = avatar || null;
    if (!user.isEmailVerified) user.isEmailVerified = true;
    await user.save();
    return res.json(new ApiResponse(200, 'Google account linked and signed in successfully.', { token: signJwt(user), user: formatUser(user) }));
  }

  // New Google user
  const username = await generateUsername(name || email.split('@')[0]);
  const newUser = await User.create({
    username,
    name: name || email.split('@')[0],
    email,
    googleId,
    avatar: avatar || null,
    authProvider: AUTH_PROVIDERS.GOOGLE,
    isEmailVerified: true,
  });

  emailService.sendWelcomeEmail(newUser);

  return res.status(201).json(
    new ApiResponse(201, 'Account created and signed in with Google successfully.', { token: signJwt(newUser), user: formatUser(newUser) })
  );
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const genericMsg = 'If an account with that email exists, a password reset link has been sent.';
  const user = await User.findOne({ email: req.body.email });

  if (!user || user.authProvider === AUTH_PROVIDERS.GOOGLE) {
    return res.json(new ApiResponse(200, genericMsg));
  }

  const rawToken = await tokenService.createToken(user._id, TOKEN_TYPES.PASSWORD_RESET);
  await emailService.sendPasswordResetEmail(user, rawToken);

  return res.json(new ApiResponse(200, genericMsg));
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const tokenDoc = await tokenService.findToken(req.params.token, TOKEN_TYPES.PASSWORD_RESET);
  if (!tokenDoc) throw new ApiError(400, 'This password reset link is invalid or has expired. Please request a new one.');

  const user = await User.findById(tokenDoc.userId).select('+password');
  if (!user) throw new ApiError(404, 'User not found.');

  const isSame = await bcrypt.compare(req.body.password, user.password);
  if (isSame) throw new ApiError(400, 'New password cannot be the same as your current password.');

  user.password = await bcrypt.hash(req.body.password, 12);
  await user.save();
  await tokenService.deleteToken(tokenDoc);

  return res.json(new ApiResponse(200, 'Password reset successful. You can now log in with your new password.'));
});

exports.getMe = asyncHandler(async (req, res) => {
  const { _id, username, name, email, phone, role, avatar, authProvider, isEmailVerified, createdAt } = req.user;
  return res.json(new ApiResponse(200, 'Profile fetched successfully.', {
    id: _id, username, name, email, phone, role, avatar, authProvider, isEmailVerified, createdAt,
  }));
});

exports.updateMe = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { name, phone },
    { new: true, runValidators: true }
  );
  return res.json(new ApiResponse(200, 'Profile updated successfully.', {
    id:           updatedUser._id,
    username:     updatedUser.username,
    name:         updatedUser.name,
    email:        updatedUser.email,
    phone:        updatedUser.phone,
    avatar:       updatedUser.avatar,
    authProvider: updatedUser.authProvider,
  }));
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (req.user.authProvider === AUTH_PROVIDERS.GOOGLE) {
    throw new ApiError(400, 'This account uses Google Sign-In and does not have a password. Sign in with Google to access your account.');
  }

  const user = await User.findById(req.user._id).select('+password');
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new ApiError(401, 'Current password is incorrect.');

  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();

  return res.json(new ApiResponse(200, 'Password changed successfully.'));
});

exports.logout = asyncHandler(async (_req, res) => {
  return res.json(new ApiResponse(200, 'Logged out successfully. Please discard your token.'));
});
