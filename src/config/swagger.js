const swaggerJsdoc = require('swagger-jsdoc');
const { COURSE_CATEGORIES, COMMUNICATION_CHANNELS, COMPETITION_SCOPES } = require('../constants');

const courseTaxonomyProperties = Object.fromEntries(
  COURSE_CATEGORIES.map((category) => [
    category,
    {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'slug'],
        properties: {
          name: { type: 'string', description: 'Admin-managed display label', example: 'Programming' },
          slug: { $ref: '#/components/schemas/CourseSubcategorySlug' },
        },
      },
    },
  ])
);

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
        CourseCategory: {
          type: 'string',
          enum: COURSE_CATEGORIES,
          example: 'technology',
        },

        CourseSubcategorySlug: {
          type: 'string',
          pattern: '^[a-z0-9]+(?:_[a-z0-9]+)*$',
          example: 'programming',
          description: 'Globally unique, admin-managed slug that must be active and belong to the selected fixed STEAM category',
        },

        CourseSubcategory: {
          type: 'object',
          required: ['name', 'slug', 'category', 'isActive'],
          properties: {
            _id: { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            name: { type: 'string', maxLength: 100, example: 'Programming' },
            slug: { $ref: '#/components/schemas/CourseSubcategorySlug' },
            category: { $ref: '#/components/schemas/CourseCategory' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        CourseSubcategoryInput: {
          type: 'object',
          required: ['name', 'slug', 'category'],
          properties: {
            name: { type: 'string', maxLength: 100, example: 'Web Development' },
            slug: { $ref: '#/components/schemas/CourseSubcategorySlug' },
            category: { $ref: '#/components/schemas/CourseCategory' },
            isActive: { type: 'boolean', default: true },
          },
        },

        CourseTaxonomy: {
          type: 'object',
          description: 'All fixed STEAM categories mapped to active database-managed subcategories. Each subcategory includes a human-readable name and a machine-safe slug. Empty categories are returned as empty arrays.',
          required: COURSE_CATEGORIES,
          additionalProperties: false,
          properties: courseTaxonomyProperties,
        },

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
            phone: {
              type: 'string',
              pattern: '^\\+[1-9]\\d{7,14}$',
              example: '+251912345678',
              nullable: true,
            },
            role: { type: 'string', enum: ['student', 'admin'], example: 'student' },
            avatar: { type: 'string', example: 'https://lh3.googleusercontent.com/...', nullable: true },
            authProvider: { type: 'string', enum: ['local', 'google'], example: 'local' },
            isEmailVerified: { type: 'boolean', example: true },
            isPhoneVerified: { type: 'boolean', example: false },
            preferredCommunication: {
              type: 'string',
              enum: Object.values(COMMUNICATION_CHANNELS),
              default: COMMUNICATION_CHANNELS.EMAIL,
              example: COMMUNICATION_CHANNELS.EMAIL,
            },
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
            category: { $ref: '#/components/schemas/CourseCategory' },
            subcategory: { $ref: '#/components/schemas/CourseSubcategorySlug' },
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
            imageUrl: {
              type: 'string',
              nullable: true,
              example: '/cs/programming.jpg',
              description: 'Optional image URL for the course card (external URL or relative path)',
            },
            syllabus: {
              type: 'array',
              items: { type: 'string' },
              example: ['Variables & Data Types', 'Control Flow', 'Functions'],
              description: 'List of topics/skills covered in the course',
            },
            instructor: {
              type: 'string',
              nullable: true,
              example: 'Dr. Abebe Tessema',
              description: 'Instructor name',
            },
            duration: {
              type: 'string',
              nullable: true,
              example: '12 weeks',
              description: 'Course duration',
            },
            requirements: {
              type: 'array',
              items: { type: 'string' },
              example: ['Basic Python programming', 'English proficiency'],
              description: 'Prerequisites for the course',
            },
            registrationOpenDate: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-09-01T00:00:00.000Z',
              description: 'When enrollment opens (null = always open)',
            },
            registrationCloseDate: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2026-10-01T00:00:00.000Z',
              description: 'When enrollment closes (null = no deadline)',
            },
            season: {
              type: 'string',
              nullable: true,
              example: 'Fall 2026',
              description: 'Intake label',
            },
            maxStudents: {
              type: 'integer',
              nullable: true,
              example: 30,
              description: 'Maximum enrollment capacity (null = unlimited)',
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
            grade: { type: 'string', nullable: true, example: '10th Grade' },
            siteName: { type: 'string', nullable: true, example: 'Addis Ababa Hub' },
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

        // ── Site ─────────────────────────────────────────────────────────────
        Site: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            name: { type: 'string', example: 'Addis Ababa Hub' },
            address: { type: 'string', nullable: true, example: 'Bole Road, Addis Ababa, Ethiopia' },
            description: { type: 'string', nullable: true, example: 'Main training center' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        // ── StudentProfile ───────────────────────────────────────────────────
        StudentProfile: {
          type: 'object',
          description: 'A child/student record owned by the authenticated User. StudentProfile._id is authoritative; slot and profileNumber are parent-local presentation/capacity fields.',
          required: ['_id', 'givenName', 'fatherName', 'grandfatherName', 'fullName', 'displayLabel', 'slot', 'profileNumber', 'isActive'],
          properties: {
            _id: { type: 'string', example: '64a1b2c3d4e5f6789012abdd' },
            givenName: { type: 'string', example: 'Abel' },
            fatherName: { type: 'string', example: 'Bekele' },
            grandfatherName: { type: 'string', example: 'Tesfaye' },
            fullName: { type: 'string', readOnly: true, example: 'Abel Bekele Tesfaye' },
            displayLabel: { type: 'string', readOnly: true, example: 'Abel Bekele Tesfaye — Grade 7 — School A' },
            slot: { type: 'integer', minimum: 1, maximum: 5, readOnly: true, description: 'Parent-local capacity and presentation slot; never use as authoritative identity.' },
            profileNumber: { type: 'integer', minimum: 1, maximum: 5, readOnly: true, description: 'Display alias of slot.' },
            grade: { type: 'string', nullable: true, example: 'Grade 7' },
            school: { type: 'string', nullable: true, example: 'School A' },
            isActive: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },

        StudentProfileCreateInput: {
          type: 'object',
          additionalProperties: false,
          required: ['givenName', 'fatherName', 'grandfatherName'],
          properties: {
            givenName: { type: 'string', example: 'Mary Anne' },
            fatherName: { type: 'string', example: 'Abd El-Rahman' },
            grandfatherName: { type: 'string', example: "O'Connor" },
            grade: { type: 'string', nullable: true, example: 'Grade 7' },
            school: { type: 'string', nullable: true, example: 'School A' },
          },
        },

        StudentProfileUpdateInput: {
          type: 'object',
          additionalProperties: false,
          properties: {
            givenName: { type: 'string', example: 'Mary Anne' },
            fatherName: { type: 'string', example: 'Abd El-Rahman' },
            grandfatherName: { type: 'string', example: "O'Connor" },
            grade: { type: 'string', nullable: true, example: 'Grade 8' },
            school: { type: 'string', nullable: true, example: 'School A' },
            isActive: { type: 'boolean', example: true },
          },
        },

        StudentProfileSummary: {
          type: 'object',
          required: ['_id', 'fullName', 'displayLabel', 'slot', 'profileNumber'],
          properties: {
            _id: { type: 'string' },
            fullName: { type: 'string' },
            displayLabel: { type: 'string' },
            slot: { type: 'integer', minimum: 1, maximum: 5 },
            profileNumber: { type: 'integer', minimum: 1, maximum: 5 },
          },
        },

        StudentProfilePossibleDuplicate: {
          type: 'object',
          description: 'Non-blocking, same-parent-only warning. Matching names remain allowed and StudentProfile._id remains authoritative.',
          required: ['matched', 'profiles'],
          properties: {
            matched: { type: 'boolean', example: true },
            profiles: {
              type: 'array',
              maxItems: 4,
              items: { $ref: '#/components/schemas/StudentProfileSummary' },
            },
          },
        },

        StudentProfileMutationResponse: {
          type: 'object',
          required: ['success', 'message', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Student profile created successfully.' },
            data: {
              type: 'object',
              required: ['student', 'possibleDuplicate'],
              properties: {
                student: { $ref: '#/components/schemas/StudentProfile' },
                possibleDuplicate: { $ref: '#/components/schemas/StudentProfilePossibleDuplicate' },
              },
            },
          },
        },

        StudentProfileDetailResponse: {
          type: 'object',
          required: ['success', 'message', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Student profile fetched successfully.' },
            data: {
              type: 'object',
              required: ['student'],
              properties: {
                student: { $ref: '#/components/schemas/StudentProfile' },
              },
            },
          },
        },

        // ── Competition ──────────────────────────────────────────────────────
        CompetitionScope: {
          type: 'string',
          enum: COMPETITION_SCOPES,
          example: 'regional',
        },

        RoundDefinition: {
          type: 'object',
          required: ['name', 'order', 'eventStartsDate', 'eventEndDate'],
          properties: {
            _id: {
              type: 'string',
              example: '64a1b2c3d4e5f6789012abcd',
              description: 'Stable embedded round ID. Non-structural name/date edits preserve it even when omitted; structural identity cannot change after progression exists.',
            },
            name: { type: 'string', maxLength: 100, example: 'Qualifier' },
            order: { type: 'integer', minimum: 1, example: 1 },
            eventStartsDate: {
              type: 'string',
              format: 'date-time',
              example: '2026-10-15T09:00:00.000Z',
              description: 'Required. Must be earlier than eventEndDate and not earlier than the Competition eventStartDate when present.',
            },
            eventEndDate: {
              type: 'string',
              format: 'date-time',
              example: '2026-10-15T12:00:00.000Z',
              description: 'Required. Must be later than eventStartsDate and not later than the Competition eventEndDate when present.',
            },
          },
        },

        RoundProgress: {
          type: 'object',
          required: ['round', 'status'],
          properties: {
            round: { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            status: { type: 'string', enum: ['pending', 'passed', 'failed'], example: 'pending' },
            reviewedBy: { type: 'string', nullable: true, example: '64a1b2c3d4e5f6789012abce' },
            reviewedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },

        Competition: {
          type: 'object',
          properties: {
            title: { type: 'string', example: 'National Coding Hackathon' },
            description: { type: 'string', example: 'Annual hackathon for schools.' },
            category: { type: 'string', enum: ['steam_innovation', 'olympiad'], example: 'olympiad' },
            type: { type: 'string', enum: ['individual', 'team'], example: 'individual' },
            scope: { $ref: '#/components/schemas/CompetitionScope' },
            registrationOpenDate: {
              type: 'string',
              format: 'date-time',
              description: 'Required on create and must be earlier than registrationCloseDate',
            },
            registrationCloseDate: {
              type: 'string',
              format: 'date-time',
              description: 'Required on create and must not be later than eventStartDate when provided',
            },
            eventStartDate: { type: 'string', format: 'date-time', nullable: true },
            eventEndDate: { type: 'string', format: 'date-time', nullable: true },
            location: { type: 'string', example: 'Main Campus' },
            requirements: { type: 'array', items: { type: 'string' } },
            rounds: {
              type: 'array',
              maxItems: 20,
              description: 'Ordered embedded rounds with required event dates. Non-structural edits preserve existing _id values, and progression prevents later structural identity changes.',
              items: { $ref: '#/components/schemas/RoundDefinition' },
            },
            maxRegistrations: { type: 'integer', nullable: true, minimum: 1, example: 100 },
            status: { type: 'string', enum: ['draft', 'published', 'completed', 'cancelled'], example: 'published' },
            isActive: { type: 'boolean', example: true },
            organizer: { type: 'string', example: 'AfriSTEAM' },
            contactEmail: { type: 'string', example: 'support@afristeam.com' },
          },
        },

        CompetitionCreateInput: {
          allOf: [
            { $ref: '#/components/schemas/Competition' },
            {
              type: 'object',
              required: ['title', 'category', 'type', 'scope', 'registrationOpenDate', 'registrationCloseDate'],
            },
          ],
        },

        // ── Competition Registration ─────────────────────────────────────────
        CompetitionRegistration: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            competitionId: { type: 'string', example: '64a1b2c3d4e5f6789012abce' },
            competitionTitle: { type: 'string', example: 'National Mathematics Olympiad' },
            competition: {
              type: 'object',
              nullable: true,
              description: 'Authoritative Competition summary used to resolve currentRound and roundProgress round IDs for display.',
              properties: {
                _id: { type: 'string', example: '64a1b2c3d4e5f6789012abce' },
                title: { type: 'string', example: 'National Mathematics Olympiad' },
                rounds: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/RoundDefinition' },
                },
              },
            },
            studentName: { type: 'string', example: 'Jane Doe' },
            email: { type: 'string', example: 'jane@example.com' },
            phone: { type: 'string', example: '+1234567890' },
            academicFile: {
              type: 'string',
              format: 'uri',
              nullable: true,
              description: 'Optional URL of the academic/supporting document submitted with the Competition registration.',
              example: 'https://example.com/documents/academic-record.pdf',
            },
            grade: { type: 'string', example: '11th Grade' },
            school: { type: 'string', example: 'Central High School' },
            skills: { type: 'array', items: { type: 'string' } },
            motivation: { type: 'string', example: 'I love coding!' },
            teamName: { type: 'string', example: 'Code Ninjas' },
            teamMembers: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['pending', 'accepted', 'rejected'] },
            progressionStatus: { type: 'string', enum: ['not_started', 'in_progress', 'eliminated', 'completed'], example: 'in_progress' },
            currentRound: { type: 'string', nullable: true, example: '64a1b2c3d4e5f6789012abcd' },
            roundProgress: {
              type: 'array',
              items: { $ref: '#/components/schemas/RoundProgress' },
            },
            registeredAt: { type: 'string', format: 'date-time' },
            rejectionReason: { type: 'string', nullable: true },
            reviewedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },

        // ── Notification ───────────────────────────────────────────────────
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            title: { type: 'string', example: 'Enrollment Approved!' },
            message: { type: 'string', example: 'Your enrollment in CS 101 was accepted.' },
            type: { type: 'string', enum: ['enrollment_submitted', 'enrollment_approved', 'enrollment_rejected', 'competition_submitted', 'competition_approved', 'competition_rejected', 'announcement', 'general'] },
            isRead: { type: 'boolean', example: false },
            relatedResource: { type: 'string', nullable: true, example: '64a1b2c3d4e5f6789012abcd' },
            relatedResourceType: { type: 'string', nullable: true, example: 'Enrollment' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        // ── Certificate ────────────────────────────────────────────────────
        Certificate: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            certificateNumber: { type: 'string', example: 'CERT-2026-A1B2C3D4' },
            title: { type: 'string', example: 'Certificate of Completion - Python Programming' },
            type: { type: 'string', enum: ['course_completion', 'competition_achievement', 'hackathon_winner', 'special_recognition'] },
            studentName: { type: 'string', example: 'John Doe' },
            gradeOrRank: { type: 'string', nullable: true, example: 'Distinction' },
            status: { type: 'string', enum: ['valid', 'revoked'], example: 'valid' },
            issueDate: { type: 'string', format: 'date-time' },
          },
        },

        // ── Course Resource ────────────────────────────────────────────────
        CourseResource: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '64a1b2c3d4e5f6789012abcd' },
            title: { type: 'string', example: 'Course Syllabus PDF' },
            description: { type: 'string', example: 'Downloadable syllabus document' },
            type: { type: 'string', enum: ['pdf', 'video', 'external_link', 'document', 'github_repo', 'other'], example: 'pdf' },
            url: { type: 'string', example: 'https://example.com/syllabus.pdf' },
            position: { type: 'integer', example: 1 },
            isActive: { type: 'boolean', example: true },
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
      { name: 'Notifications',       description: 'In-app notification management for students' },
      { name: 'Certificates',        description: 'Student certificate retrieval and public verification' },
      { name: 'Admin — Dashboard',   description: 'Admin overview statistics and feedback' },
      { name: 'Admin — Enrollments', description: 'Admin enrollment review (accept / reject)' },
      { name: 'Admin — Courses',     description: 'Admin course management' },
      { name: 'Admin — Students',    description: 'Admin student account management' },
      { name: 'Admin — Announcements', description: 'Admin system announcements broadcast' },
      { name: 'Admin — CSV Export',  description: 'Admin CSV data reporting and exports' },
      { name: 'Admin — Certificates', description: 'Admin certificate issuance and revocation' },
      { name: 'Admin — Resources',   description: 'Admin course resource management' },
      { name: 'Sites',                description: 'Physical training locations' },
      { name: 'Student Profiles',     description: 'Authenticated parent-owned student profiles, limited to five retained slots per User' },
      { name: 'Admin — Sites',        description: 'Admin site/location management' },
      { name: 'Competitions',         description: 'Public competition endpoints' },
      { name: 'Admin — Competitions', description: 'Admin competition management and registration review' },
      { name: 'Admin — Course Subcategories', description: 'Admin managed Course subcategory CRUD — create, rename, activate/deactivate subcategories under fixed STEAM categories' },
    ],
  },

  // Scan all route files for JSDoc @swagger annotations
  apis: [
    './src/routes/auth.routes.js',
    './src/routes/course.routes.js',
    './src/routes/enrollment.routes.js',
    './src/routes/admin.routes.js',
    './src/routes/contact.routes.js',
    './src/routes/site.routes.js',
    './src/routes/studentProfile.routes.js',
    './src/routes/competition.routes.js',
    './src/routes/notification.routes.js',
    './src/routes/certificate.routes.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
