const fs = require('fs');
const path = require('path');

const collection = {
  info: {
    _postman_id: 'e-learning-platform-api-collection-v1',
    name: 'E-Learning Platform API Specification',
    description: 'Production-ready Postman collection for E-Learning Platform backend HTTP endpoints.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [
    { key: 'BASE_URL', value: 'http://localhost:5000', type: 'string' },
    { key: 'student_token', value: '', type: 'string' },
    { key: 'admin_token', value: '', type: 'string' },
    { key: 'verification_token', value: 'sample_raw_hex_token', type: 'string' },
    { key: 'reset_token', value: 'sample_raw_hex_token', type: 'string' },
    { key: 'course_id', value: '64a1b2c3d4e5f6789012abcd', type: 'string' },
    { key: 'course_subcategory_id', value: '64a1b2c3d4e5f6789012abca', type: 'string' },
    { key: 'resource_id', value: '64a1b2c3d4e5f6789012abce', type: 'string' },
    { key: 'enrollment_id', value: '64a1b2c3d4e5f6789012abcf', type: 'string' },
    { key: 'competition_id', value: '64a1b2c3d4e5f6789012abd0', type: 'string' },
    { key: 'comp_reg_id', value: '64a1b2c3d4e5f6789012abd1', type: 'string' },
    { key: 'round_id', value: '64a1b2c3d4e5f6789012abd6', type: 'string' },
    { key: 'site_id', value: '64a1b2c3d4e5f6789012abd2', type: 'string' },
    { key: 'notification_id', value: '64a1b2c3d4e5f6789012abd3', type: 'string' },
    { key: 'certificate_id', value: '64a1b2c3d4e5f6789012abd4', type: 'string' },
    { key: 'certificate_number', value: 'CERT-2026-A1B2C3D4', type: 'string' },
    { key: 'student_id', value: '64a1b2c3d4e5f6789012abd5', type: 'string' }
  ],
  item: []
};

// Test script generator
const makeTest = (expectedStatus = 200, jsonCheck = true) => ({
  listen: 'test',
  script: {
    exec: [
      `pm.test("Status code is ${expectedStatus}", function () {`,
      `    pm.response.to.have.status(${expectedStatus});`,
      `});`,
      ...(jsonCheck ? [
        `pm.test("Response is valid JSON wrapper", function () {`,
        `    var jsonData = pm.response.json();`,
        `    pm.expect(jsonData).to.have.property('success');`,
        `    pm.expect(jsonData).to.have.property('message');`,
        `});`
      ] : [])
    ],
    type: 'text/javascript'
  }
});

// Auth helper
const bearerAuth = (tokenVar = 'student_token') => ({
  type: 'bearer',
  bearer: [{ key: 'token', value: `{{${tokenVar}}}`, type: 'string' }]
});

// 1. Authentication
const authFolder = {
  name: '1. Authentication',
  description: 'Public & authenticated security workflows',
  item: [
    {
      name: 'Register Student',
      event: [makeTest(201)],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            fullName: 'Postman Student',
            email: 'postman_student@example.com',
            password: 'Password123!'
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/auth/register', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'register'] }
      }
    },
    {
      name: 'Verify Email',
      event: [makeTest(200)],
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/auth/verify-email/{{verification_token}}', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'verify-email', '{{verification_token}}'] }
      }
    },
    {
      name: 'Resend Email Verification',
      event: [makeTest(200)],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ email: 'postman_student@example.com' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/auth/resend-verification', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'resend-verification'] }
      }
    },
    {
      name: 'Login (Student or Admin)',
      event: [{
        listen: 'test',
        script: {
          exec: [
            'pm.test("Status code is 200", function () { pm.response.to.have.status(200); });',
            'pm.test("Token returned and set", function () {',
            '    var res = pm.response.json();',
            '    pm.expect(res.data).to.have.property("token");',
            '    if (res.data.user.role === "admin") { pm.environment.set("admin_token", res.data.token); }',
            '    else { pm.environment.set("student_token", res.data.token); }',
            '});'
          ],
          type: 'text/javascript'
        }
      }],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ email: 'postman_student@example.com', password: 'Password123!' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/auth/login', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'login'] }
      }
    },
    {
      name: 'Logout',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'POST',
        url: { raw: '{{BASE_URL}}/api/auth/logout', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'logout'] }
      }
    },
    {
      name: 'Forgot Password',
      event: [makeTest(200)],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ email: 'postman_student@example.com' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/auth/forgot-password', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'forgot-password'] }
      }
    },
    {
      name: 'Reset Password',
      event: [makeTest(200)],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ password: 'NewPassword123!', confirmPassword: 'NewPassword123!' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/auth/reset-password/{{reset_token}}', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'reset-password', '{{reset_token}}'] }
      }
    },
    {
      name: 'Change Password',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'PUT',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ currentPassword: 'Password123!', newPassword: 'UpdatedPassword123!' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/auth/me/change-password', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'me', 'change-password'] }
      }
    },
    {
      name: 'Get Current Profile',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/auth/me', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'me'] }
      }
    },
    {
      name: 'Update Profile',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'PUT',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ name: 'Postman Student Updated' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/auth/me', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'me'] }
      }
    },
    {
      name: 'Google OAuth Sign-In',
      event: [makeTest(200)],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ idToken: 'sample_google_id_token_jwt' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/auth/google', host: ['{{BASE_URL}}'], path: ['api', 'auth', 'google'] }
      }
    }
  ]
};

// 2. Courses & Admin Courses
const coursesFolder = {
  name: '2. Courses Management',
  description: 'Public course discovery & admin course management',
  item: [
    {
      name: 'Get Course Taxonomy',
      event: [makeTest(200)],
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/courses/taxonomy', host: ['{{BASE_URL}}'], path: ['api', 'courses', 'taxonomy'] }
      }
    },
    {
      name: 'Admin List Managed Course Subcategories',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/admin/course-subcategories?category=technology&isActive=true&search=development&page=1&limit=20',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'course-subcategories'],
          query: [
            { key: 'category', value: 'technology' },
            { key: 'isActive', value: 'true' },
            { key: 'search', value: 'development' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '20' }
          ]
        }
      }
    },
    {
      name: 'Admin Create Managed Course Subcategory',
      event: [{
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            'pm.test("Status code is 201", function () { pm.response.to.have.status(201); });',
            'pm.test("Managed subcategory ID is captured", function () {',
            '    var jsonData = pm.response.json();',
            '    pm.expect(jsonData).to.have.property("success", true);',
            '    pm.environment.set("course_subcategory_id", jsonData.data._id);',
            '});'
          ]
        }
      }],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            name: 'Web Development',
            slug: 'web_development',
            category: 'technology'
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/course-subcategories', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'course-subcategories'] }
      }
    },
    {
      name: 'Admin Update Managed Course Subcategory',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PUT',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ name: 'Full-Stack Web Development' }, null, 2)
        },
        url: {
          raw: '{{BASE_URL}}/api/admin/course-subcategories/{{course_subcategory_id}}',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'course-subcategories', '{{course_subcategory_id}}']
        }
      }
    },
    {
      name: 'List / Search / Filter Courses',
      event: [makeTest(200)],
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/courses?search=programming&category=technology&subcategory=programming&level=beginner&page=1&limit=10',
          host: ['{{BASE_URL}}'],
          path: ['api', 'courses'],
          query: [
            { key: 'search', value: 'programming' },
            { key: 'category', value: 'technology' },
            { key: 'subcategory', value: 'programming' },
            { key: 'level', value: 'beginner' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' }
          ]
        }
      }
    },
    {
      name: 'Get Course Details by ID',
      event: [makeTest(200)],
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/courses/{{course_id}}', host: ['{{BASE_URL}}'], path: ['api', 'courses', '{{course_id}}'] }
      }
    },
    {
      name: 'Get Course Active Resources',
      event: [makeTest(200)],
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/courses/{{course_id}}/resources', host: ['{{BASE_URL}}'], path: ['api', 'courses', '{{course_id}}', 'resources'] }
      }
    },
    {
      name: 'Admin Create Course',
      event: [makeTest(201)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            title: 'Full Stack Web Development',
            description: 'Learn modern frontend and backend web development.',
            category: 'technology',
            subcategory: 'web_development',
            level: 'advanced',
            requiresDocument: true,
            imageUrl: 'https://example.com/images/web-development.jpg',
            syllabus: ['HTML & CSS', 'JavaScript', 'Backend APIs'],
            instructor: 'Ms. Ada Lovelace',
            duration: '10 weeks',
            season: 'Fall 2026',
            maxStudents: 25,
            frontendId: 'web-development-1'
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/courses', host: ['{{BASE_URL}}'], path: ['api', 'courses'] }
      }
    },
    {
      name: 'Admin Toggle Managed Course Subcategory Status',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        url: {
          raw: '{{BASE_URL}}/api/admin/course-subcategories/{{course_subcategory_id}}/toggle-status',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'course-subcategories', '{{course_subcategory_id}}', 'toggle-status']
        }
      }
    },
    {
      name: 'Admin Update Course',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PUT',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ title: 'Full Stack Web Development (Updated)', duration: '12 weeks' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/courses/{{course_id}}', host: ['{{BASE_URL}}'], path: ['api', 'courses', '{{course_id}}'] }
      }
    },
    {
      name: 'Admin Toggle Course Status',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        url: { raw: '{{BASE_URL}}/api/courses/{{course_id}}/toggle-status', host: ['{{BASE_URL}}'], path: ['api', 'courses', '{{course_id}}', 'toggle-status'] }
      }
    },
    {
      name: 'Admin Delete Course',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'DELETE',
        url: { raw: '{{BASE_URL}}/api/courses/{{course_id}}', host: ['{{BASE_URL}}'], path: ['api', 'courses', '{{course_id}}'] }
      }
    }
  ]
};

// 3. Admin Course Resources
const adminResourcesFolder = {
  name: '3. Admin — Course Resources',
  description: 'Admin management of course learning materials',
  item: [
    {
      name: 'Admin Add Course Resource',
      event: [makeTest(201)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            title: 'Syllabus PDF Document',
            description: 'Full course syllabus and grading policy.',
            type: 'pdf',
            url: 'https://example.com/docs/syllabus.pdf',
            position: 1
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/courses/{{course_id}}/resources', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'courses', '{{course_id}}', 'resources'] }
      }
    },
    {
      name: 'Admin Update Course Resource',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PUT',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ title: 'Updated Syllabus PDF Document v2' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/courses/{{course_id}}/resources/{{resource_id}}', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'courses', '{{course_id}}', 'resources', '{{resource_id}}'] }
      }
    },
    {
      name: 'Admin Delete Course Resource',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'DELETE',
        url: { raw: '{{BASE_URL}}/api/admin/courses/{{course_id}}/resources/{{resource_id}}', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'courses', '{{course_id}}', 'resources', '{{resource_id}}'] }
      }
    },
    {
      name: 'Admin Reorder Course Resources',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            resourceOrders: [
              { resourceId: '{{resource_id}}', position: 2 }
            ]
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/courses/{{course_id}}/resources/reorder', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'courses', '{{course_id}}', 'resources', 'reorder'] }
      }
    }
  ]
};

// 4. Enrollments
const enrollmentsFolder = {
  name: '4. Enrollments',
  description: 'Course enrollment submission & admin review',
  item: [
    {
      name: 'Submit Course Enrollment (Auth / Anon)',
      event: [makeTest(201)],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            courseType: '{{course_id}}',
            studentName: 'Postman Student',
            email: 'postman_student@example.com',
            grade: '12th Grade',
            site: '{{site_id}}',
            academicPdf: 'https://example.com/uploads/transcript.pdf'
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/enrollments', host: ['{{BASE_URL}}'], path: ['api', 'enrollments'] }
      }
    },
    {
      name: 'Get My Enrollments (Student)',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/enrollments/my', host: ['{{BASE_URL}}'], path: ['api', 'enrollments', 'my'] }
      }
    },
    {
      name: 'Get Single Enrollment Details (Student)',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/enrollments/my/{{enrollment_id}}', host: ['{{BASE_URL}}'], path: ['api', 'enrollments', 'my', '{{enrollment_id}}'] }
      }
    },
    {
      name: 'Admin List / Search Enrollments',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/admin/enrollments?status=pending&search=student&page=1&limit=10',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'enrollments'],
          query: [
            { key: 'status', value: 'pending' },
            { key: 'search', value: 'student' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' }
          ]
        }
      }
    },
    {
      name: 'Admin Get Enrollment Detail',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/admin/enrollments/{{enrollment_id}}', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'enrollments', '{{enrollment_id}}'] }
      }
    },
    {
      name: 'Admin Approve Enrollment',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        url: { raw: '{{BASE_URL}}/api/admin/enrollments/{{enrollment_id}}/approve', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'enrollments', '{{enrollment_id}}', 'approve'] }
      }
    },
    {
      name: 'Admin Reject Enrollment',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ rejectionReason: 'Incomplete academic transcript uploaded.' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/enrollments/{{enrollment_id}}/reject', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'enrollments', '{{enrollment_id}}', 'reject'] }
      }
    }
  ]
};

// 5. Competitions
const competitionsFolder = {
  name: '5. Competitions',
  description: 'Public competition endpoints & admin lifecycle/review',
  item: [
    {
      name: 'List Active Competitions',
      event: [makeTest(200)],
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/competitions?category=steam_innovation&type=team&scope=national&page=1&limit=10',
          host: ['{{BASE_URL}}'],
          path: ['api', 'competitions'],
          query: [
            { key: 'category', value: 'steam_innovation' },
            { key: 'type', value: 'team' },
            { key: 'scope', value: 'national' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' }
          ]
        }
      }
    },
    {
      name: 'Get Competition Details by ID',
      event: [makeTest(200)],
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/competitions/{{competition_id}}', host: ['{{BASE_URL}}'], path: ['api', 'competitions', '{{competition_id}}'] }
      }
    },
    {
      name: 'Admin List All Competitions',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/admin/competitions?page=1&limit=10',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'competitions'],
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' }
          ]
        }
      }
    },
    {
      name: 'Register for Competition',
      event: [makeTest(201)],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            fullName: 'Postman Participant',
            email: 'postman_participant@example.com',
            phone: '+1234567890',
            academicFile: 'https://example.com/documents/academic-record.pdf',
            grade: '11th Grade',
            school: 'Central High School',
            skills: ['Python', 'Robotics'],
            motivation: 'I love coding and artificial intelligence!',
            teamName: 'Code Warriors',
            teamMembers: ['Alice', 'Bob']
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/competitions/{{competition_id}}/register', host: ['{{BASE_URL}}'], path: ['api', 'competitions', '{{competition_id}}', 'register'] }
      }
    },
    {
      name: 'Admin Create Competition',
      event: [makeTest(201)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            title: 'National AI Hackathon 2026',
            description: 'Annual machine learning hackathon for secondary students.',
            category: 'steam_innovation',
            type: 'team',
            scope: 'national',
            registrationOpenDate: '2026-08-01T00:00:00.000Z',
            registrationCloseDate: '2026-10-01T00:00:00.000Z',
            eventStartDate: '2026-10-15T00:00:00.000Z',
            eventEndDate: '2026-10-17T00:00:00.000Z',
            location: 'Main Science Hub, Addis Ababa',
            requirements: ['High school students grade 9-12', 'Basic Python programming', 'Laptop'],
            rounds: [
              { name: 'Qualifier', order: 1 },
              { name: 'Semifinal', order: 2 },
              { name: 'Final', order: 3 }
            ],
            maxRegistrations: 100,
            status: 'published',
            organizer: 'AFRISTEAM Platform',
            contactEmail: 'hackathon@afristeam.org'
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/competitions', host: ['{{BASE_URL}}'], path: ['api', 'competitions'] }
      }
    },
    {
      name: 'Admin Update Competition',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PUT',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ title: 'National AI Hackathon 2026 (Updated)', maxRegistrations: 150 }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/competitions/{{competition_id}}', host: ['{{BASE_URL}}'], path: ['api', 'competitions', '{{competition_id}}'] }
      }
    },
    {
      name: 'Admin Toggle Competition Status',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        url: { raw: '{{BASE_URL}}/api/competitions/{{competition_id}}/toggle-status', host: ['{{BASE_URL}}'], path: ['api', 'competitions', '{{competition_id}}', 'toggle-status'] }
      }
    },
    {
      name: 'Admin Delete Competition',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'DELETE',
        url: { raw: '{{BASE_URL}}/api/competitions/{{competition_id}}', host: ['{{BASE_URL}}'], path: ['api', 'competitions', '{{competition_id}}'] }
      }
    },
    {
      name: 'Admin List Registrations for Specific Competition',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/admin/competition-registrations?competitionId={{competition_id}}',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'competition-registrations'],
          query: [{ key: 'competitionId', value: '{{competition_id}}' }]
        }
      }
    },
    {
      name: 'Admin List / Search All Competition Registrations',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/admin/competition-registrations?status=pending&search=postman&page=1&limit=10',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'competition-registrations'],
          query: [
            { key: 'status', value: 'pending' },
            { key: 'search', value: 'postman' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' }
          ]
        }
      }
    },
    {
      name: 'Admin Approve Competition Registration',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        url: { raw: '{{BASE_URL}}/api/admin/competition-registrations/{{comp_reg_id}}/approve', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'competition-registrations', '{{comp_reg_id}}', 'approve'] }
      }
    },
    {
      name: 'Get My Competition Registrations (Student)',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/competitions/registrations/my', host: ['{{BASE_URL}}'], path: ['api', 'competitions', 'registrations', 'my'] }
      }
    },
    {
      name: 'Admin Reject Competition Registration',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ rejectionReason: 'Participant grade does not meet eligibility requirements.' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/competition-registrations/{{comp_reg_id}}/reject', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'competition-registrations', '{{comp_reg_id}}', 'reject'] }
      }
    },
    {
      name: 'Admin Pass Competition Registration Round',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        description: 'Send the currentRound value returned by the registration API as roundId. Do not send the round order; the backend selects the next round.',
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ roundId: '{{round_id}}' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/competition-registrations/{{comp_reg_id}}/round/pass', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'competition-registrations', '{{comp_reg_id}}', 'round', 'pass'] }
      }
    },
    {
      name: 'Admin Fail Competition Registration Round',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        description: 'Send the currentRound value returned by the registration API as roundId. Do not send the round order; the backend records elimination.',
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ roundId: '{{round_id}}' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/competition-registrations/{{comp_reg_id}}/round/fail', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'competition-registrations', '{{comp_reg_id}}', 'round', 'fail'] }
      }
    }
  ]
};

// 6. Sites
const sitesFolder = {
  name: '6. Sites',
  description: 'Physical training centers & location management',
  item: [
    {
      name: 'Get Active Sites (Public)',
      event: [makeTest(200)],
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/sites', host: ['{{BASE_URL}}'], path: ['api', 'sites'] }
      }
    },
    {
      name: 'Admin List All Sites',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/admin/sites?search=hub&page=1&limit=10',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'sites'],
          query: [
            { key: 'search', value: 'hub' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' }
          ]
        }
      }
    },
    {
      name: 'Admin Create Site',
      event: [makeTest(201)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            name: 'Hawassa Regional Tech Center',
            address: 'Main Highway, Hawassa, Ethiopia',
            description: 'Regional STEAM lab and training workshop center.'
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/sites', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'sites'] }
      }
    },
    {
      name: 'Admin Update Site',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PUT',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ name: 'Hawassa Regional Tech Center (Updated)' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/sites/{{site_id}}', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'sites', '{{site_id}}'] }
      }
    },
    {
      name: 'Admin Toggle Site Active Status',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        url: { raw: '{{BASE_URL}}/api/admin/sites/{{site_id}}/toggle-status', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'sites', '{{site_id}}', 'toggle-status'] }
      }
    }
  ]
};

// 7. Notifications
const notificationsFolder = {
  name: '7. Notifications',
  description: 'In-app notification management for students',
  item: [
    {
      name: 'Get Student Notifications',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/notifications?isRead=false&page=1&limit=10',
          host: ['{{BASE_URL}}'],
          path: ['api', 'notifications'],
          query: [
            { key: 'isRead', value: 'false' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' }
          ]
        }
      }
    },
    {
      name: 'Get Unread Notification Count',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/notifications/unread-count', host: ['{{BASE_URL}}'], path: ['api', 'notifications', 'unread-count'] }
      }
    },
    {
      name: 'Mark All Notifications as Read',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'PATCH',
        url: { raw: '{{BASE_URL}}/api/notifications/read-all', host: ['{{BASE_URL}}'], path: ['api', 'notifications', 'read-all'] }
      }
    },
    {
      name: 'Mark Single Notification as Read',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'PATCH',
        url: { raw: '{{BASE_URL}}/api/notifications/{{notification_id}}/read', host: ['{{BASE_URL}}'], path: ['api', 'notifications', '{{notification_id}}', 'read'] }
      }
    },
    {
      name: 'Delete Notification',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'DELETE',
        url: { raw: '{{BASE_URL}}/api/notifications/{{notification_id}}', host: ['{{BASE_URL}}'], path: ['api', 'notifications', '{{notification_id}}'] }
      }
    }
  ]
};

// 8. Certificates
const certificatesFolder = {
  name: '8. Digital Certificates',
  description: 'Credential verification, retrieval & admin issuance',
  item: [
    {
      name: 'Public Verify Certificate',
      event: [makeTest(200)],
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/certificates/verify/{{certificate_number}}', host: ['{{BASE_URL}}'], path: ['api', 'certificates', 'verify', '{{certificate_number}}'] }
      }
    },
    {
      name: 'Get My Digital Certificates (Student)',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/certificates/my', host: ['{{BASE_URL}}'], path: ['api', 'certificates', 'my'] }
      }
    },
    {
      name: 'Get Certificate Details by ID',
      event: [makeTest(200)],
      auth: bearerAuth('student_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/certificates/{{certificate_id}}', host: ['{{BASE_URL}}'], path: ['api', 'certificates', '{{certificate_id}}'] }
      }
    },
    {
      name: 'Admin Issue Digital Certificate',
      event: [makeTest(201)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            studentId: '{{student_id}}',
            type: 'course_completion',
            title: 'Certificate of Excellence in Python Programming',
            courseId: '{{course_id}}',
            gradeOrRank: 'Distinction'
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/certificates', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'certificates'] }
      }
    },
    {
      name: 'Admin List Issued Certificates',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/admin/certificates?status=valid&search=excellence&page=1&limit=10',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'certificates'],
          query: [
            { key: 'status', value: 'valid' },
            { key: 'search', value: 'excellence' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' }
          ]
        }
      }
    },
    {
      name: 'Admin Revoke Certificate',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        url: { raw: '{{BASE_URL}}/api/admin/certificates/{{certificate_id}}/revoke', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'certificates', '{{certificate_id}}', 'revoke'] }
      }
    }
  ]
};

// 9. Admin Core
const adminCoreFolder = {
  name: '9. Admin — Core & Student Management',
  description: 'Dashboard analytics, student management & administrative tools',
  item: [
    {
      name: 'Admin Dashboard Analytics',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/admin/dashboard', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'dashboard'] }
      }
    },
    {
      name: 'Admin Get Contact Feedback Submissions',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/admin/feedback', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'feedback'] }
      }
    },
    {
      name: 'Admin Broadcast System Announcement',
      event: [makeTest(201)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            title: 'Platform Maintenance Scheduled',
            message: 'Scheduled maintenance will take place tonight at 12:00 AM UTC.'
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/announcements', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'announcements'] }
      }
    },
    {
      name: 'Admin List / Search Students',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/admin/students?search=student&page=1&limit=10',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'students'],
          query: [
            { key: 'search', value: 'student' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' }
          ]
        }
      }
    },
    {
      name: 'Admin Get Student Details by ID',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/admin/students/{{student_id}}', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'students', '{{student_id}}'] }
      }
    },
    {
      name: 'Admin Toggle Student Active Status',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'PATCH',
        url: { raw: '{{BASE_URL}}/api/admin/students/{{student_id}}/toggle-status', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'students', '{{student_id}}', 'toggle-status'] }
      }
    },
    {
      name: 'Admin Promote User to Admin',
      event: [makeTest(200)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({ email: 'postman_student@example.com' }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/admin/admins', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'admins'] }
      }
    }
  ]
};

// 10. CSV Exports
const csvExportsFolder = {
  name: '10. Admin — CSV Exports',
  description: 'Streaming CSV data exports for reporting',
  item: [
    {
      name: 'Export Students to CSV',
      event: [makeTest(200, false)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/admin/export/students', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'export', 'students'] }
      }
    },
    {
      name: 'Export Course Enrollments to CSV',
      event: [makeTest(200, false)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/admin/export/enrollments?status=accepted&search=student',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'export', 'enrollments'],
          query: [
            { key: 'status', value: 'accepted' },
            { key: 'search', value: 'student' }
          ]
        }
      }
    },
    {
      name: 'Export Competition Registrations to CSV',
      event: [makeTest(200, false)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: {
          raw: '{{BASE_URL}}/api/admin/export/competition-registrations?status=pending',
          host: ['{{BASE_URL}}'],
          path: ['api', 'admin', 'export', 'competition-registrations'],
          query: [{ key: 'status', value: 'pending' }]
        }
      }
    },
    {
      name: 'Export Courses to CSV',
      event: [makeTest(200, false)],
      auth: bearerAuth('admin_token'),
      request: {
        method: 'GET',
        url: { raw: '{{BASE_URL}}/api/admin/export/courses', host: ['{{BASE_URL}}'], path: ['api', 'admin', 'export', 'courses'] }
      }
    }
  ]
};

// 11. Contact Form
const contactFolder = {
  name: '11. Public Contact Form',
  description: 'Public contact & inquiry submission',
  item: [
    {
      name: 'Submit Contact Inquiry Form',
      event: [makeTest(201)],
      request: {
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            name: 'Jane Student',
            email: 'jane_student@example.com',
            subject: 'Question about Robotics Course',
            message: 'Hello, I would like to know if python background is strictly required for the robotics course.'
          }, null, 2)
        },
        url: { raw: '{{BASE_URL}}/api/contact', host: ['{{BASE_URL}}'], path: ['api', 'contact'] }
      }
    }
  ]
};

collection.item = [
  authFolder,
  coursesFolder,
  adminResourcesFolder,
  enrollmentsFolder,
  competitionsFolder,
  sitesFolder,
  notificationsFolder,
  certificatesFolder,
  adminCoreFolder,
  csvExportsFolder,
  contactFolder
];

const environment = {
  id: 'e-learning-platform-env-v1',
  name: 'E-Learning Platform Environment (Local / Render)',
  values: [
    { key: 'BASE_URL', value: 'http://localhost:5000', enabled: true },
    { key: 'API_URL', value: 'http://localhost:5000/api', enabled: true },
    { key: 'student_token', value: '', enabled: true },
    { key: 'admin_token', value: '', enabled: true },
    { key: 'verification_token', value: 'sample_raw_token', enabled: true },
    { key: 'reset_token', value: 'sample_raw_token', enabled: true },
    { key: 'course_id', value: '64a1b2c3d4e5f6789012abcd', enabled: true },
    { key: 'course_subcategory_id', value: '64a1b2c3d4e5f6789012abca', enabled: true },
    { key: 'resource_id', value: '64a1b2c3d4e5f6789012abce', enabled: true },
    { key: 'enrollment_id', value: '64a1b2c3d4e5f6789012abcf', enabled: true },
    { key: 'competition_id', value: '64a1b2c3d4e5f6789012abd0', enabled: true },
    { key: 'comp_reg_id', value: '64a1b2c3d4e5f6789012abd1', enabled: true },
    { key: 'round_id', value: '64a1b2c3d4e5f6789012abd6', enabled: true },
    { key: 'site_id', value: '64a1b2c3d4e5f6789012abd2', enabled: true },
    { key: 'notification_id', value: '64a1b2c3d4e5f6789012abd3', enabled: true },
    { key: 'certificate_id', value: '64a1b2c3d4e5f6789012abd4', enabled: true },
    { key: 'certificate_number', value: 'CERT-2026-A1B2C3D4', enabled: true },
    { key: 'student_id', value: '64a1b2c3d4e5f6789012abd5', enabled: true }
  ]
};

// Write files
const targetDir = path.join(__dirname, '..');
fs.writeFileSync(path.join(targetDir, 'postman_collection.json'), JSON.stringify(collection, null, 2));
fs.writeFileSync(path.join(targetDir, 'postman_environment.json'), JSON.stringify(environment, null, 2));

console.log('✅ Generated postman_collection.json and postman_environment.json successfully!');
