const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const authValidator = require('../validators/auth.validator');
const { validate } = require('../middleware/validate.middleware');
const { verifyToken } = require('../middleware/auth.middleware');

// ─────────────────────────────────────────────────────────────────────────────
// Auth Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new student account
 *     description: >
 *       Creates a new local student account and sends a verification email.
 *       **No JWT is returned at this step.**
 *       Frontend sends: `{ fullName, email, password }`.
 *       Username is auto-generated from fullName.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email, password]
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: secret123
 *     responses:
 *       201:
 *         description: Registration successful — verification email sent
 *       409:
 *         description: Email already exists
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/register', authValidator.register, validate, authController.register);

/**
 * @swagger
 * /api/auth/verify-email/{token}:
 *   get:
 *     summary: Verify email address
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Token invalid or expired
 */
router.get('/verify-email/:token', authController.verifyEmail);

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Resend email verification link
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Generic response (same whether email exists or not)
 */
router.post('/resend-verification', authValidator.forgotPassword, validate, authController.resendVerification);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in with email and password
 *     description: >
 *       Frontend sends: `{ email, password }`.
 *       Also accepts `{ identifier, password }` for Swagger testing.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 example: secret123
 *     responses:
 *       200:
 *         description: Login successful — returns JWT and user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/AuthTokenResponse'
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account disabled or email not verified
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/login', authValidator.login, validate, authController.login);

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Sign in with Google (OAuth 2.0)
 *     description: >
 *       Accepts the **Google ID token** obtained from the Google Identity Services
 *       frontend SDK and handles all four scenarios in a single endpoint:
 *
 *       1. **New Google user** → creates account, returns JWT
 *       2. **Returning Google user** → finds by Google ID, returns JWT
 *       3. **Existing local account with same email** → links Google to existing account, returns JWT
 *       4. **Disabled account** → returns 403
 *
 *       The frontend obtains the `idToken` from Google's JavaScript SDK
 *       (`google.accounts.id.initialize` callback). The raw token is verified
 *       cryptographically and never stored.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID token from the frontend Google SDK
 *                 example: eyJhbGciOiJSUzI1NiIsImtpZCI6...
 *     responses:
 *       200:
 *         description: Signed in successfully (returning or linked account)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Signed in with Google successfully.' }
 *                 data:
 *                   $ref: '#/components/schemas/AuthTokenResponse'
 *       201:
 *         description: New account created via Google Sign-In
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Account created and signed in with Google successfully.' }
 *                 data:
 *                   $ref: '#/components/schemas/AuthTokenResponse'
 *       400:
 *         description: Google email not verified or no email in token payload
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Google token is invalid or expired
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Account has been disabled
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/google', authValidator.googleSignIn, validate, authController.googleSignIn);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     description: >
 *       Sends a password reset link to the given email address.
 *       Always returns the same generic message regardless of whether
 *       the email exists — this prevents email enumeration.
 *       The reset link expires after **30 minutes**.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *     responses:
 *       200:
 *         description: Generic response (same whether email exists or not)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'If an account with that email exists, a password reset link has been sent.' }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/forgot-password', authValidator.forgotPassword, validate, authController.forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password/{token}:
 *   post:
 *     summary: Reset password using a reset token
 *     description: >
 *       Validates the password reset token from the email link and updates
 *       the account password. The token is **single-use** and expires after 30 minutes.
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: The raw reset token from the email link
 *         example: a1b2c3d4e5f6...64hexchars
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password, confirmPassword]
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: NewSecret@456
 *                 description: Must contain uppercase, lowercase, and a number
 *               confirmPassword:
 *                 type: string
 *                 example: NewSecret@456
 *                 description: Must match the password field
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Password reset successful. You can now log in with your new password.' }
 *       400:
 *         description: Token invalid/expired or new password same as current
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/reset-password/:token', authValidator.resetPassword, validate, authController.resetPassword);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     description: Returns the full profile of the currently authenticated user.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Profile fetched successfully.' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, example: '64a1b2c3d4e5f6789012abcd' }
 *                     username: { type: string, example: 'john_doe' }
 *                     name: { type: string, example: 'John Doe' }
 *                     email: { type: string, example: 'john@example.com' }
 *                     phone: { type: string, nullable: true, example: '+1234567890' }
 *                     role: { type: string, example: 'student' }
 *                     avatar: { type: string, nullable: true }
 *                     authProvider: { type: string, example: 'local' }
 *                     isEmailVerified: { type: boolean, example: true }
 *                     createdAt: { type: string, format: date-time }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/me', verifyToken, authController.getMe);

/**
 * @swagger
 * /api/auth/me:
 *   put:
 *     summary: Update current user profile
 *     description: >
 *       Updates the authenticated user's `name` and/or `phone`.
 *       Email, password, and role cannot be changed via this endpoint.
 *       Works for both local and Google accounts.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *                 example: John Updated Doe
 *               phone:
 *                 type: string
 *                 example: '+9876543210'
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Profile updated successfully.' }
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.put('/me', verifyToken, authValidator.updateProfile, validate, authController.updateMe);

/**
 * @swagger
 * /api/auth/me/change-password:
 *   put:
 *     summary: Change password (local accounts only)
 *     description: >
 *       Allows a local account user to change their password.
 *       Google Sign-In accounts cannot use this endpoint (they have no password).
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: OldSecret@123
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: NewSecret@456
 *                 description: Must contain uppercase, lowercase, and a number
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Password changed successfully.' }
 *       400:
 *         description: Google account or new password same as current
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Not authenticated or current password is wrong
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
router.put('/me/change-password', verifyToken, authValidator.changePassword, validate, authController.changePassword);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout
 *     description: >
 *       Logs out the current user. Since JWTs are stateless, actual token
 *       invalidation happens on the **client side** by discarding the token.
 *       This endpoint exists for frontend consistency.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Logged out successfully. Please discard your token.' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/logout', verifyToken, authController.logout);

module.exports = router;
