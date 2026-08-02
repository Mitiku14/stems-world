const swaggerJsdoc = require('swagger-jsdoc');

// Determine the correct server URL:
// 1. API_URL env var (set this on Render to your deployed URL)
// 2. RENDER_EXTERNAL_URL — Render automatically injects this on all services
// 3. Fall back to localhost for local development
const serverUrl =
  process.env.API_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${process.env.PORT || 5000}`;

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'E-Learning Platform API',
      version: '1.0.0',
      description: `
## E-Learning Platform Backend API

A production-ready REST API for an E-Learning platform supporting:
- **Student registration** with email verification
- **Google OAuth** sign-in
- **Course browsing** with search and filters
- **Enrollment management** with optional PDF document upload
- **Admin dashboard** for managing students, courses, and enrollments

---

### Authentication
All protected endpoints require a **Bearer JWT token** in the \`Authorization\` header:
\`\`\`
Authorization: Bearer <your_token>
\`\`\`

Obtain a token by logging in via \`POST /api/auth/login\` or \`POST /api/auth/google\`.

---

### Roles
| Role | Description |
|------|-------------|
| \`student\` | Can browse courses, submit enrollments, view own profile |
| \`admin\` | Full access to dashboard, course management, student management, enrollment approval |
      `,
      contact: {
        name: 'E-Learning Platform Support',
        email: 'support@elearning.com',
      },
    },
    servers: [
      {
        url: serverUrl,
        description: process.env.NODE_ENV === 'production' ? 'Production server (Render)' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token obtained from /api/auth/login or /api/auth/google',
        },
      },
      schemas: {
        // ── Success response wrapper ───────────────────────────────────────
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful.' },
            data: { type: 'object', description: 'Response payload (varies by endpoint)' },
          },
        },

        // ── Error response wrapper ─────────────────────────────────────────
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Something went wrong.' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', example: 'email' },
                  message: { type: 'string', example: 'Please provide a valid email address' },
                },
              },
            },
          },
        },

        // ── Pagination ─────────────────────────────────────────────────────
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 42 },
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            totalPages: { type: 'integer', example: 5 },
          },
        },

        // ── User ───────────────────────────────────────────────────────────
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            username: { type: 'string', example: 'john_doe' },
            name: { type: 'string', example: 'John Doe' },
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            phone: { type: 'string', example: '+1234567890', nullable: true },
            role: { type: 'string', enum: ['student', 'admin'], example: 'student' },
            avatar: { type: 'string', example: 'https://lh3.googleusercontent.com/...', nullable: true },
            authProvider: { type: 'string', enum: ['local', 'google'], example: 'local' },
            isEmailVerified: { type: 'boolean', example: true },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00.000Z' },
          },
        },

        // ── Auth token response ────────────────────────────────────────────
        AuthTokenResponse: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              description: 'JWT token — include in Authorization: Bearer <token> header',
            },
            user: { $ref: '#/components/schemas/User' },
          },
        },

        // ── Course ─────────────────────────────────────────────────────────
        Course: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            title: { type: 'string', example: 'Introduction to Machine Learning' },
            description: { type: 'string', example: 'Learn the foundations of machine learning.' },
            category: {
              type: 'string',
              enum: ['programming', 'mathematics', 'language', 'science', 'other'],
              example: 'programming',
            },
            level: {
              type: 'string',
              enum: ['beginner', 'intermediate', 'advanced', 'all'],
              example: 'intermediate',
            },
            requiresDocument: {
              type: 'boolean',
              example: true,
              description: 'If true, students must upload an academic PDF when enrolling',
            },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00.000Z' },
          },
        },

        // ── Enrollment ─────────────────────────────────────────────────────
        Enrollment: {
          type: 'object',
          description: 'Flattened enrollment shape returned to the admin frontend.',
          properties: {
            id: { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            studentName: { type: 'string', example: 'John Doe' },
            email: { type: 'string', example: 'john@example.com' },
            courseType: { type: 'string', example: 'Introduction to Machine Learning' },
            academicFileName: { type: 'string', nullable: true, example: 'a1b2c3d4.pdf' },
            status: {
              type: 'string',
              enum: ['pending', 'accepted', 'rejected'],
              example: 'pending',
            },
            registeredAt: { type: 'string', format: 'date-time' },
            rejectionReason: { type: 'string', nullable: true },
            reviewedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },

        // ── Dashboard stats ────────────────────────────────────────────────
        DashboardStats: {
          type: 'object',
          properties: {
            totalStudents: { type: 'integer', example: 42 },
            totalCourses:  { type: 'integer', example: 6 },
            enrollments: {
              type: 'object',
              properties: {
                total:    { type: 'integer', example: 100 },
                pending:  { type: 'integer', example: 20 },
                accepted: { type: 'integer', example: 70 },
                rejected: { type: 'integer', example: 10 },
              },
            },
          },
        },
      },

      // ── Reusable parameters ──────────────────────────────────────────────
      parameters: {
        PageParam: {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 1, default: 1 },
          description: 'Page number for pagination',
        },
        LimitParam: {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          description: 'Number of items per page',
        },
      },

      // ── Reusable responses ───────────────────────────────────────────────
      responses: {
        Unauthorized: {
          description: 'Authentication required or token is invalid/expired',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Access denied. No token provided.' },
            },
          },
        },
        Forbidden: {
          description: 'Authenticated but not authorized for this action',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'You do not have permission to perform this action.' },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Resource not found.' },
            },
          },
        },
        ValidationError: {
          description: 'Request validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                message: 'Validation failed',
                errors: [{ field: 'email', message: 'Please provide a valid email address' }],
              },
            },
          },
        },
        Conflict: {
          description: 'Resource already exists or business rule conflict',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'An account with that email already exists.' },
            },
          },
        },
        ServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Something went wrong. Please try again later.' },
            },
          },
        },
      },
    },

    tags: [
      { name: 'Auth',                description: 'Registration, login, email verification, password management' },
      { name: 'Courses',             description: 'Browse and manage courses' },
      { name: 'Enrollments',         description: 'Student enrollment submission and status tracking' },
      { name: 'Contact',             description: 'Public contact / feedback form' },
      { name: 'Admin — Dashboard',   description: 'Admin overview statistics and feedback' },
      { name: 'Admin — Enrollments', description: 'Admin enrollment review (accept / reject)' },
      { name: 'Admin — Students',    description: 'Admin student account management' },
    ],
  },

  // Scan all route files for JSDoc @swagger annotations
  apis: [
    './src/routes/auth.routes.js',
    './src/routes/course.routes.js',
    './src/routes/enrollment.routes.js',
    './src/routes/admin.routes.js',
    './src/routes/contact.routes.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
