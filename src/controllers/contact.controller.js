const Contact    = require('../models/Contact');
const asyncHandler = require('../utils/asyncHandler');
const ApiError   = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');

/**
 * POST /api/contact
 * Public. Matches the frontend ContactForm fields: name, email, subject, message.
 */
exports.submitContact = asyncHandler(async (req, res) => {
  const { name, email, subject, message } = req.body;

  const contact = await Contact.create({ name, email, subject, message });

  return res.status(201).json(
    new ApiResponse(201, 'Your message has been sent. We will get back to you as soon as possible.', {
      id:          contact._id,
      submittedAt: contact.createdAt,
    })
  );
});

/**
 * GET /api/admin/feedback
 * Admin only. Returns all contact form submissions.
 * Response shape matches the admin page FeedbackSection:
 *   { id, name, email, subject, message, submittedAt }
 */
exports.getAllFeedback = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const p = Number(page);
  const l = Number(limit);

  const [feedback, total] = await Promise.all([
    Contact.find()
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .lean(),
    Contact.countDocuments(),
  ]);

  // Flatten to match frontend FeedbackSection shape
  const formatted = feedback.map((f) => ({
    id:          f._id,
    name:        f.name,
    email:       f.email,
    subject:     f.subject,
    message:     f.message,
    submittedAt: f.createdAt,
  }));

  return res.json(new ApiResponse(200, 'Feedback fetched successfully.', {
    feedback: formatted,
    pagination: {
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l),
    },
  }));
});
