/**
 * Full API + Email Test Script
 * Run: node scripts/test-api.js
 *
 * Tests every endpoint and diagnoses email delivery.
 * Requires the server to be running on http://localhost:5000
 */
require('dotenv').config();

const BASE_URL = 'http://localhost:5000';

// ── Colours for terminal output ────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

let passed = 0;
let failed = 0;
let studentToken = '';
let adminToken   = '';
let studentId    = '';
let courseId     = '';
let enrollmentId = '';

const timestamp = Date.now();
const TEST_EMAIL    = `testuser_${timestamp}@example.com`;
const TEST_USERNAME = `testuser_${timestamp}`;
const TEST_PASSWORD = 'TestPass@123';

// ── HTTP helper ────────────────────────────────────────────────────────────
const http = require('http');

const request = (method, path, body = null, token = null) => {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
        ...(token  && { Authorization: `Bearer ${token}` }),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (e) => resolve({ status: 0, body: { message: e.message } }));
    if (payload) req.write(payload);
    req.end();
  });
};

// ── Test runner helper ─────────────────────────────────────────────────────
const test = (name, result, expectedStatus, actualStatus, extra = '') => {
  if (result) {
    passed++;
    console.log(`  ${GREEN}✔${RESET} ${name}`);
  } else {
    failed++;
    console.log(`  ${RED}✘${RESET} ${name}`);
    console.log(`    ${YELLOW}Expected status ${expectedStatus}, got ${actualStatus}${RESET}`);
    if (extra) console.log(`    ${YELLOW}${extra}${RESET}`);
  }
};

const section = (title) => {
  const line = '─'.repeat(Math.max(0, 50 - title.length));
  console.log(`\n${BOLD}${CYAN}── ${title} ${line}${RESET}`);
};

// ── Email diagnostic ───────────────────────────────────────────────────────
const testEmailDirect = async () => {
  section('EMAIL DIAGNOSTIC');
  console.log('  Testing Nodemailer connection to Mailtrap directly...\n');

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.verify();
    passed++;
    console.log(`  ${GREEN}✔${RESET} Mailtrap SMTP connection verified successfully`);
    console.log(`    ${YELLOW}Host: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}${RESET}`);
    console.log(`    ${YELLOW}User: ${process.env.EMAIL_USER}${RESET}`);
  } catch (err) {
    failed++;
    console.log(`  ${RED}✘${RESET} Mailtrap SMTP connection FAILED`);
    console.log(`    ${RED}Error: ${err.message}${RESET}`);
    console.log(`    ${YELLOW}Check your EMAIL_USER and EMAIL_PASS in .env${RESET}`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: 'test@example.com',
      subject: 'Test Email from API Tester',
      html: '<p>This is a test email sent by the API test script.</p>',
    });
    passed++;
    console.log(`  ${GREEN}✔${RESET} Test email sent to Mailtrap sandbox successfully`);
    console.log(`    ${YELLOW}→ Check Mailtrap inbox at mailtrap.io to see it${RESET}`);
  } catch (err) {
    failed++;
    console.log(`  ${RED}✘${RESET} Failed to send test email`);
    console.log(`    ${RED}Error: ${err.message}${RESET}`);
    return false;
  }
  return true;
};

// ── Main test runner ───────────────────────────────────────────────────────
const runTests = async () => {
  console.log(`\n${BOLD}E-Learning Platform — Full API Test Suite${RESET}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test user: ${TEST_EMAIL}\n`);

  // ── 1. Health check ──────────────────────────────────────────────────────
  section('HEALTH CHECK');
  {
    const r = await request('GET', '/health');
    test('GET /health → 200', r.status === 200, 200, r.status);
    if (r.status !== 200) {
      console.log(`\n  ${RED}Server is not running. Start it with: npm run dev${RESET}\n`);
      process.exit(1);
    }
  }

  // ── 2. Email diagnostic ──────────────────────────────────────────────────
  await testEmailDirect();

  // ── 3. Auth — Registration ───────────────────────────────────────────────
  section('AUTH — REGISTER');
  {
    // Valid registration
    const r = await request('POST', '/api/auth/register', {
      username: TEST_USERNAME,
      name: 'Test User',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    test('POST /register → 201', r.status === 201, 201, r.status,
      r.body.message || JSON.stringify(r.body));
    if (r.status === 201) {
      console.log(`    ${YELLOW}→ Verification email sent to Mailtrap sandbox${RESET}`);
      console.log(`    ${YELLOW}→ Check mailtrap.io → Email Testing → My Sandbox${RESET}`);
    }

    // Duplicate registration
    const r2 = await request('POST', '/api/auth/register', {
      username: TEST_USERNAME,
      name: 'Test User',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    test('POST /register duplicate → 409', r2.status === 409, 409, r2.status);

    // Missing fields
    const r3 = await request('POST', '/api/auth/register', { username: 'x' });
    test('POST /register missing fields → 422', r3.status === 422, 422, r3.status);
  }

  // ── 4. Auth — Resend verification ────────────────────────────────────────
  section('AUTH — RESEND VERIFICATION');
  {
    const r = await request('POST', '/api/auth/resend-verification', { email: TEST_EMAIL });
    test('POST /resend-verification → 200', r.status === 200, 200, r.status);

    const r2 = await request('POST', '/api/auth/resend-verification', { email: 'notexist@x.com' });
    test('POST /resend-verification unknown email → 200 (generic)', r2.status === 200, 200, r2.status);
  }

  // ── 5. Auth — Login before verification ──────────────────────────────────
  section('AUTH — LOGIN (before email verify)');
  {
    const r = await request('POST', '/api/auth/login', {
      identifier: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    test('POST /login unverified → 403', r.status === 403, 403, r.status);
  }

  // ── 6. Manually verify the user via DB so tests can continue ─────────────
  section('SETUP — FORCE VERIFY USER (bypasses email for testing)');
  {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('../src/models/User');
    const updated = await User.findOneAndUpdate(
      { email: TEST_EMAIL },
      { isEmailVerified: true },
      { new: true }
    );
    if (updated) {
      passed++;
      console.log(`  ${GREEN}✔${RESET} User force-verified in DB for test continuation`);
      studentId = updated._id.toString();
    } else {
      failed++;
      console.log(`  ${RED}✘${RESET} Could not find test user in DB`);
    }
  }

  // ── 7. Auth — Login after verification ───────────────────────────────────
  section('AUTH — LOGIN (after verify)');
  {
    // Login with email
    const r = await request('POST', '/api/auth/login', {
      identifier: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    test('POST /login with email → 200', r.status === 200, 200, r.status);
    if (r.body.data) studentToken = r.body.data.token;

    // Login with username
    const r2 = await request('POST', '/api/auth/login', {
      identifier: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    test('POST /login with username → 200', r2.status === 200, 200, r2.status);

    // Wrong password
    const r3 = await request('POST', '/api/auth/login', {
      identifier: TEST_EMAIL,
      password: 'WrongPass@999',
    });
    test('POST /login wrong password → 401', r3.status === 401, 401, r3.status);

    // Missing fields
    const r4 = await request('POST', '/api/auth/login', {});
    test('POST /login missing fields → 422', r4.status === 422, 422, r4.status);
  }

  // ── 8. Auth — Admin login ─────────────────────────────────────────────────
  section('AUTH — ADMIN LOGIN');
  {
    const r = await request('POST', '/api/auth/login', {
      identifier: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
    test('POST /login admin → 200', r.status === 200, 200, r.status,
      r.status !== 200 ? 'Run: node seed/admin.seed.js first' : '');
    if (r.body.data) adminToken = r.body.data.token;
  }

  // ── 9. Auth — Profile ────────────────────────────────────────────────────
  section('AUTH — PROFILE');
  {
    const r = await request('GET', '/api/auth/me', null, studentToken);
    test('GET /me → 200', r.status === 200, 200, r.status);

    const r2 = await request('GET', '/api/auth/me', null, 'bad.token.here');
    test('GET /me invalid token → 401', r2.status === 401, 401, r2.status);

    const r3 = await request('PUT', '/api/auth/me', { name: 'Updated Name' }, studentToken);
    test('PUT /me update name → 200', r3.status === 200, 200, r3.status);
  }

  // ── 10. Auth — Forgot / Reset password ───────────────────────────────────
  section('AUTH — FORGOT / RESET PASSWORD');
  {
    const r = await request('POST', '/api/auth/forgot-password', { email: TEST_EMAIL });
    test('POST /forgot-password → 200 (generic)', r.status === 200, 200, r.status);
    if (r.status === 200) {
      console.log(`    ${YELLOW}→ Reset email sent to Mailtrap sandbox${RESET}`);
    }

    const r2 = await request('POST', '/api/auth/forgot-password', { email: 'nobody@x.com' });
    test('POST /forgot-password unknown email → 200 (generic)', r2.status === 200, 200, r2.status);

    const r3 = await request('POST', '/api/auth/reset-password/invalidtoken123', {
      password: 'NewPass@456',
      confirmPassword: 'NewPass@456',
    });
    test('POST /reset-password bad token → 400', r3.status === 400, 400, r3.status);
  }

  // ── 11. Auth — Change password ────────────────────────────────────────────
  section('AUTH — CHANGE PASSWORD');
  {
    const r = await request('PUT', '/api/auth/me/change-password', {
      currentPassword: 'WrongOldPass@1',
      newPassword: 'NewPass@456',
    }, studentToken);
    test('PUT /change-password wrong current → 401', r.status === 401, 401, r.status);

    const r2 = await request('PUT', '/api/auth/me/change-password', {
      currentPassword: TEST_PASSWORD,
      newPassword: 'NewPass@456',
    }, studentToken);
    test('PUT /change-password correct → 200', r2.status === 200, 200, r2.status);

    // Re-login with new password to restore token
    const r3 = await request('POST', '/api/auth/login', {
      identifier: TEST_EMAIL,
      password: 'NewPass@456',
    });
    if (r3.body.data) studentToken = r3.body.data.token;
    test('Re-login with new password → 200', r3.status === 200, 200, r3.status);
  }

  // ── 12. Auth — Logout ─────────────────────────────────────────────────────
  section('AUTH — LOGOUT');
  {
    const r = await request('POST', '/api/auth/logout', null, studentToken);
    test('POST /logout → 200', r.status === 200, 200, r.status);
  }

  // ── 13. Courses — Public ──────────────────────────────────────────────────
  section('COURSES — PUBLIC');
  {
    const r = await request('GET', '/api/courses');
    test('GET /courses → 200', r.status === 200, 200, r.status);
    if (r.body.data && r.body.data.courses && r.body.data.courses.length > 0) {
      courseId = r.body.data.courses[0]._id;
      console.log(`    ${YELLOW}→ Using course: "${r.body.data.courses[0].title}"${RESET}`);
    } else {
      console.log(`    ${YELLOW}⚠ No courses found. Run: node seed/course.seed.js${RESET}`);
    }

    // Search
    const r2 = await request('GET', '/api/courses?search=programming');
    test('GET /courses?search=programming → 200', r2.status === 200, 200, r2.status);

    // Filter
    const r3 = await request('GET', '/api/courses?category=mathematics');
    test('GET /courses?category=mathematics → 200', r3.status === 200, 200, r3.status);

    // Pagination
    const r4 = await request('GET', '/api/courses?page=1&limit=3');
    test('GET /courses?page=1&limit=3 → 200', r4.status === 200, 200, r4.status);

    // Invalid category
    const r5 = await request('GET', '/api/courses?category=invalid');
    test('GET /courses?category=invalid → 422', r5.status === 422, 422, r5.status);

    // Get single course
    if (courseId) {
      const r6 = await request('GET', `/api/courses/${courseId}`);
      test(`GET /courses/:id → 200`, r6.status === 200, 200, r6.status);
    }

    // Bad ObjectId
    const r7 = await request('GET', '/api/courses/not-a-valid-id');
    test('GET /courses/invalid-id → 422', r7.status === 422, 422, r7.status);
  }

  // ── 14. Courses — Admin CRUD ──────────────────────────────────────────────
  section('COURSES — ADMIN CRUD');
  let newCourseId = '';
  {
    // Create course (admin)
    const r = await request('POST', '/api/courses', {
      title: `Test Course ${timestamp}`,
      description: 'Created by automated test script',
      category: 'programming',
      level: 'beginner',
      requiresDocument: false,
    }, adminToken);
    test('POST /courses (admin) → 201', r.status === 201, 201, r.status);
    if (r.body.data) newCourseId = r.body.data._id;

    // Student cannot create course
    const r2 = await request('POST', '/api/courses', {
      title: 'Unauthorized Course',
    }, studentToken);
    test('POST /courses (student) → 403', r2.status === 403, 403, r2.status);

    // Update course
    if (newCourseId) {
      const r3 = await request('PUT', `/api/courses/${newCourseId}`, {
        description: 'Updated description',
      }, adminToken);
      test('PUT /courses/:id (admin) → 200', r3.status === 200, 200, r3.status);
    }

    // Toggle status
    if (newCourseId) {
      const r4 = await request('PATCH', `/api/courses/${newCourseId}/toggle-status`, null, adminToken);
      test('PATCH /courses/:id/toggle-status → 200', r4.status === 200, 200, r4.status);
      // Toggle back to active
      await request('PATCH', `/api/courses/${newCourseId}/toggle-status`, null, adminToken);
    }

    // Delete course (no enrollments so should succeed)
    if (newCourseId) {
      const r5 = await request('DELETE', `/api/courses/${newCourseId}`, null, adminToken);
      test('DELETE /courses/:id → 200', r5.status === 200, 200, r5.status);
    }
  }

  // ── 15. Enrollments ───────────────────────────────────────────────────────
  section('ENROLLMENTS');
  {
    if (!courseId) {
      console.log(`  ${YELLOW}⚠ Skipping enrollment tests — no courses in DB${RESET}`);
    } else {
      // Submit enrollment (no PDF — test with course that doesn't require one)
      const r = await request('POST', '/api/enrollments', { courseId }, studentToken);
      test('POST /enrollments → 201 or 409',
        r.status === 201 || r.status === 409, '201 or 409', r.status);
      if (r.body.data) enrollmentId = r.body.data.id;

      // Duplicate enrollment
      const r2 = await request('POST', '/api/enrollments', { courseId }, studentToken);
      test('POST /enrollments duplicate → 409', r2.status === 409, 409, r2.status);

      // Get my enrollments
      const r3 = await request('GET', '/api/enrollments/my', null, studentToken);
      test('GET /enrollments/my → 200', r3.status === 200, 200, r3.status);
      if (r3.body.data && r3.body.data.enrollments.length > 0) {
        enrollmentId = r3.body.data.enrollments[0]._id;
      }

      // Filter by status
      const r4 = await request('GET', '/api/enrollments/my?status=pending', null, studentToken);
      test('GET /enrollments/my?status=pending → 200', r4.status === 200, 200, r4.status);

      // Invalid status
      const r5 = await request('GET', '/api/enrollments/my?status=invalid', null, studentToken);
      test('GET /enrollments/my?status=invalid → 400', r5.status === 400, 400, r5.status);

      // Get single enrollment
      if (enrollmentId) {
        const r6 = await request('GET', `/api/enrollments/my/${enrollmentId}`, null, studentToken);
        test('GET /enrollments/my/:id → 200', r6.status === 200, 200, r6.status);
      }

      // Unauthenticated
      const r7 = await request('POST', '/api/enrollments', { courseId });
      test('POST /enrollments unauthenticated → 401', r7.status === 401, 401, r7.status);
    }
  }

  // ── 16. Admin — Dashboard ─────────────────────────────────────────────────
  section('ADMIN — DASHBOARD');
  {
    const r = await request('GET', '/api/admin/dashboard', null, adminToken);
    test('GET /admin/dashboard → 200', r.status === 200, 200, r.status);
    if (r.body.data) {
      const d = r.body.data;
      console.log(`    ${YELLOW}→ Students: ${d.totalStudents} | Courses: ${d.totalCourses} | Enrollments: ${d.enrollments?.total}${RESET}`);
    }

    // Student cannot access admin dashboard
    const r2 = await request('GET', '/api/admin/dashboard', null, studentToken);
    test('GET /admin/dashboard (student) → 403', r2.status === 403, 403, r2.status);
  }

  // ── 17. Admin — Enrollments ───────────────────────────────────────────────
  section('ADMIN — ENROLLMENTS');
  {
    const r = await request('GET', '/api/admin/enrollments', null, adminToken);
    test('GET /admin/enrollments → 200', r.status === 200, 200, r.status);

    // Filter by status
    const r2 = await request('GET', '/api/admin/enrollments?status=pending', null, adminToken);
    test('GET /admin/enrollments?status=pending → 200', r2.status === 200, 200, r2.status);

    // Search by student name
    const r3 = await request('GET', '/api/admin/enrollments?search=test', null, adminToken);
    test('GET /admin/enrollments?search=test → 200', r3.status === 200, 200, r3.status);

    if (enrollmentId) {
      // Get single
      const r4 = await request('GET', `/api/admin/enrollments/${enrollmentId}`, null, adminToken);
      test('GET /admin/enrollments/:id → 200', r4.status === 200, 200, r4.status);

      // Approve
      const r5 = await request('PATCH', `/api/admin/enrollments/${enrollmentId}/approve`, null, adminToken);
      test('PATCH /admin/enrollments/:id/approve → 200', r5.status === 200, 200, r5.status);
      if (r5.status === 200) {
        console.log(`    ${YELLOW}→ Approval email sent to Mailtrap sandbox${RESET}`);
      }

      // Try to approve again (already approved → 409)
      const r6 = await request('PATCH', `/api/admin/enrollments/${enrollmentId}/approve`, null, adminToken);
      test('PATCH approve already-approved → 409', r6.status === 409, 409, r6.status);
    }
  }

  // ── 18. Admin — Students ──────────────────────────────────────────────────
  section('ADMIN — STUDENTS');
  {
    const r = await request('GET', '/api/admin/students', null, adminToken);
    test('GET /admin/students → 200', r.status === 200, 200, r.status);

    // Search
    const r2 = await request('GET', '/api/admin/students?search=test', null, adminToken);
    test('GET /admin/students?search=test → 200', r2.status === 200, 200, r2.status);

    if (studentId) {
      // Get single student
      const r3 = await request('GET', `/api/admin/students/${studentId}`, null, adminToken);
      test('GET /admin/students/:id → 200', r3.status === 200, 200, r3.status);

      // Toggle status (disable)
      const r4 = await request('PATCH', `/api/admin/students/${studentId}/toggle-status`, null, adminToken);
      test('PATCH /admin/students/:id/toggle-status → 200', r4.status === 200, 200, r4.status);

      // Re-enable
      await request('PATCH', `/api/admin/students/${studentId}/toggle-status`, null, adminToken);
    }

    // Invalid ObjectId
    const r5 = await request('GET', '/api/admin/students/not-a-valid-id', null, adminToken);
    test('GET /admin/students/invalid-id → 422', r5.status === 422, 422, r5.status);
  }

  // ── 19. Security checks ───────────────────────────────────────────────────
  section('SECURITY CHECKS');
  {
    // No token on protected route
    const r1 = await request('GET', '/api/auth/me');
    test('GET /me no token → 401', r1.status === 401, 401, r1.status);

    // Student accessing admin route
    const r2 = await request('GET', '/api/admin/students', null, studentToken);
    test('GET /admin/students (student token) → 403', r2.status === 403, 403, r2.status);

    // NoSQL injection attempt in body
    const r3 = await request('POST', '/api/auth/login', {
      identifier: { '$gt': '' },
      password: { '$gt': '' },
    });
    test('POST /login NoSQL injection → 422 or 401', r3.status === 422 || r3.status === 401, '422 or 401', r3.status);

    // 404 for unknown route
    const r4 = await request('GET', '/api/nonexistent-route');
    test('GET unknown route → 404', r4.status === 404, 404, r4.status);
  }

  // ── 20. Cleanup — delete test user ────────────────────────────────────────
  section('CLEANUP');
  {
    if (studentId && adminToken) {
      const r = await request('DELETE', `/api/admin/students/${studentId}`, null, adminToken);
      test('DELETE test user → 200', r.status === 200, 200, r.status);
    }

    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }

  // ── Final report ───────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${BOLD}${'═'.repeat(60)}${RESET}`);
  console.log(`${BOLD}RESULTS: ${GREEN}${passed} passed${RESET} | ${RED}${failed} failed${RESET} | ${total} total${RESET}`);
  console.log(`${BOLD}${'═'.repeat(60)}${RESET}`);

  if (failed === 0) {
    console.log(`\n${GREEN}${BOLD}✅ All tests passed! Your API is working correctly.${RESET}`);
  } else {
    console.log(`\n${RED}${BOLD}❌ ${failed} test(s) failed. Review the output above.${RESET}`);
  }

  console.log(`\n${YELLOW}${BOLD}📧 Email check:${RESET}`);
  console.log(`  1. Go to mailtrap.io → Email Testing → My Sandbox`);
  console.log(`  2. You should see emails from the test run`);
  console.log(`  3. Open the verification email and click the link`);
  console.log(`  4. The link format is: http://localhost:3000/verify-email/<token>`);
  console.log(`     → To test directly, call: GET http://localhost:5000/api/auth/verify-email/<token>\n`);

  process.exit(failed > 0 ? 1 : 0);
};

runTests().catch((err) => {
  console.error(`\n${RED}Fatal error: ${err.message}${RESET}`);
  console.error(err.stack);
  process.exit(1);
});
