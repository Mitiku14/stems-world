/**
 * Full API + Email Test Script
 * Run: node scripts/test-api.js
 * Requires the server to be running on http://localhost:5000
 *
 * Auth contract (matches frontend forms):
 *   Register: { fullName, email, password }
 *   Login:    { email, password }
 *   Enroll:   { studentName, email, courseType } + optional academicPdf file
 */
require('dotenv').config();

const http = require('http');

// ── Colours ────────────────────────────────────────────────────────────────
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m',
      C = '\x1b[36m', X = '\x1b[0m',  B = '\x1b[1m';

let passed = 0, failed = 0;
let studentToken = '', adminToken = '', studentId = '', courseId = '', enrollmentId = '';

const ts           = Date.now();
const TEST_FULL    = 'Test User Integration';
const TEST_EMAIL   = `testuser_${ts}@example.com`;
const TEST_PASS    = 'testpass1';  // minLength:6, matches frontend rule

// ── HTTP helper ────────────────────────────────────────────────────────────
const req = (method, path, body = null, token = null) =>
  new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 5000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
        ...(token   && { Authorization: `Bearer ${token}` }),
      },
    };
    const r = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', e => resolve({ status: 0, body: { message: e.message } }));
    if (payload) r.write(payload);
    r.end();
  });

const ok = (name, pass, expected, actual, extra = '') => {
  if (pass) { passed++; console.log(`  ${G}✔${X} ${name}`); }
  else {
    failed++;
    console.log(`  ${R}✘${X} ${name}`);
    console.log(`    ${Y}Expected ${expected}, got ${actual}${X}`);
    if (extra) console.log(`    ${Y}${extra}${X}`);
  }
};

const section = (t) => {
  const line = '─'.repeat(Math.max(0, 50 - t.length));
  console.log(`\n${B}${C}── ${t} ${line}${X}`);
};

// ── Email diagnostic ───────────────────────────────────────────────────────
const testEmail = async () => {
  section('EMAIL DIAGNOSTIC');
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({
    host: process.env.EMAIL_HOST, port: Number(process.env.EMAIL_PORT),
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  try {
    await t.verify();
    passed++;
    console.log(`  ${G}✔${X} SMTP connection OK (${process.env.EMAIL_HOST})`);
  } catch (e) {
    failed++;
    console.log(`  ${R}✘${X} SMTP connection FAILED: ${e.message}`);
    console.log(`    ${Y}Emails will silently fail. Update EMAIL_* in .env${X}`);
  }
};

// ── Main ───────────────────────────────────────────────────────────────────
const run = async () => {
  console.log(`\n${B}E-Learning Platform — Full API Test Suite${X}`);
  console.log(`Test account: ${TEST_EMAIL}\n`);

  // 1. Health
  section('HEALTH CHECK');
  {
    const r = await req('GET', '/health');
    ok('GET /health → 200', r.status === 200, 200, r.status);
    if (r.status !== 200) { console.log(`\n  ${R}Server not running. Start with: npm run dev${X}\n`); process.exit(1); }
  }

  // 2. Email
  await testEmail();

  // 3. Register — frontend shape: { fullName, email, password }
  section('AUTH — REGISTER');
  {
    const r = await req('POST', '/api/auth/register', { fullName: TEST_FULL, email: TEST_EMAIL, password: TEST_PASS });
    ok('POST /register → 201', r.status === 201, 201, r.status,
       r.status !== 201 ? JSON.stringify(r.body?.errors || r.body?.message) : '');
    if (r.status === 201) console.log(`    ${Y}→ Verification email sent (check Mailtrap)${X}`);

    const r2 = await req('POST', '/api/auth/register', { fullName: TEST_FULL, email: TEST_EMAIL, password: TEST_PASS });
    ok('POST /register duplicate → 409', r2.status === 409, 409, r2.status);

    const r3 = await req('POST', '/api/auth/register', { email: TEST_EMAIL });
    ok('POST /register missing fields → 422', r3.status === 422, 422, r3.status);
  }

  // 4. Resend verification
  section('AUTH — RESEND VERIFICATION');
  {
    const r = await req('POST', '/api/auth/resend-verification', { email: TEST_EMAIL });
    ok('POST /resend-verification → 200', r.status === 200, 200, r.status);
    const r2 = await req('POST', '/api/auth/resend-verification', { email: 'nobody@x.com' });
    ok('POST /resend-verification unknown → 200 (generic)', r2.status === 200, 200, r2.status);
  }

  // 5. Login before verification
  section('AUTH — LOGIN (before verify)');
  {
    const r = await req('POST', '/api/auth/login', { email: TEST_EMAIL, password: TEST_PASS });
    ok('POST /login unverified → 403', r.status === 403, 403, r.status);
  }

  // 6. Force-verify in DB so tests can continue
  section('SETUP — FORCE VERIFY USER');
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
      studentId = updated._id.toString();
      console.log(`  ${G}✔${X} User force-verified in DB`);
    } else {
      failed++;
      console.log(`  ${R}✘${X} User not found in DB`);
    }
  }

  // 7. Login after verification — frontend shape: { email, password }
  section('AUTH — LOGIN (after verify)');
  {
    const r = await req('POST', '/api/auth/login', { email: TEST_EMAIL, password: TEST_PASS });
    ok('POST /login with email → 200', r.status === 200, 200, r.status);
    if (r.body.data) studentToken = r.body.data.token;

    const r2 = await req('POST', '/api/auth/login', { email: TEST_EMAIL, password: 'wrongpass' });
    ok('POST /login wrong password → 401', r2.status === 401, 401, r2.status);

    const r3 = await req('POST', '/api/auth/login', {});
    ok('POST /login missing fields → 422', r3.status === 422, 422, r3.status);
  }

  // 8. Admin login
  section('AUTH — ADMIN LOGIN');
  {
    const r = await req('POST', '/api/auth/login', {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    });
    ok('POST /login admin → 200', r.status === 200, 200, r.status,
       r.status !== 200 ? 'Run: node seed/admin.seed.js first' : '');
    if (r.body.data) adminToken = r.body.data.token;
  }

  // 9. Profile
  section('AUTH — PROFILE');
  {
    const r = await req('GET', '/api/auth/me', null, studentToken);
    ok('GET /me → 200', r.status === 200, 200, r.status);

    const r2 = await req('GET', '/api/auth/me', null, 'bad.token');
    ok('GET /me invalid token → 401', r2.status === 401, 401, r2.status);

    const r3 = await req('PUT', '/api/auth/me', { name: 'Updated Name' }, studentToken);
    ok('PUT /me update name → 200', r3.status === 200, 200, r3.status);
  }

  // 10. Forgot/Reset password
  section('AUTH — FORGOT / RESET PASSWORD');
  {
    const r = await req('POST', '/api/auth/forgot-password', { email: TEST_EMAIL });
    ok('POST /forgot-password → 200', r.status === 200, 200, r.status);
    if (r.status === 200) console.log(`    ${Y}→ Reset email sent (check Mailtrap)${X}`);

    const r2 = await req('POST', '/api/auth/forgot-password', { email: 'nobody@x.com' });
    ok('POST /forgot-password unknown → 200 (generic)', r2.status === 200, 200, r2.status);

    const r3 = await req('POST', '/api/auth/reset-password/badtoken', {
      password: 'newpass1', confirmPassword: 'newpass1',
    });
    ok('POST /reset-password bad token → 400', r3.status === 400, 400, r3.status);
  }

  // 11. Change password
  section('AUTH — CHANGE PASSWORD');
  {
    const r = await req('PUT', '/api/auth/me/change-password', {
      currentPassword: 'wrongpass', newPassword: 'newpass1',
    }, studentToken);
    ok('PUT /change-password wrong current → 401', r.status === 401, 401, r.status);

    const r2 = await req('PUT', '/api/auth/me/change-password', {
      currentPassword: TEST_PASS, newPassword: 'newpass1',
    }, studentToken);
    ok('PUT /change-password correct → 200', r2.status === 200, 200, r2.status);

    // Re-login with new password
    const r3 = await req('POST', '/api/auth/login', { email: TEST_EMAIL, password: 'newpass1' });
    if (r3.body.data) studentToken = r3.body.data.token;
    ok('Re-login with new password → 200', r3.status === 200, 200, r3.status);
  }

  // 12. Logout
  section('AUTH — LOGOUT');
  {
    const r = await req('POST', '/api/auth/logout', null, studentToken);
    ok('POST /logout → 200', r.status === 200, 200, r.status);
  }

  // 13. Courses — public
  section('COURSES — PUBLIC');
  {
    const r = await req('GET', '/api/courses');
    ok('GET /courses → 200', r.status === 200, 200, r.status);
    if (r.body.data?.courses?.length > 0) {
      courseId = r.body.data.courses[0]._id;
      console.log(`    ${Y}→ Using: "${r.body.data.courses[0].title}"${X}`);
    } else {
      console.log(`    ${Y}⚠ No courses. Run: node seed/course.seed.js${X}`);
    }

    const r2 = await req('GET', '/api/courses?search=programming');
    ok('GET /courses?search=programming → 200', r2.status === 200, 200, r2.status);

    const r3 = await req('GET', '/api/courses?category=mathematics');
    ok('GET /courses?category=mathematics → 200', r3.status === 200, 200, r3.status);

    const r4 = await req('GET', '/api/courses?category=invalid');
    ok('GET /courses?category=invalid → 422', r4.status === 422, 422, r4.status);

    if (courseId) {
      const r5 = await req('GET', `/api/courses/${courseId}`);
      ok('GET /courses/:id → 200', r5.status === 200, 200, r5.status);
    }

    const r6 = await req('GET', '/api/courses/not-a-valid-id');
    ok('GET /courses/invalid-id → 422', r6.status === 422, 422, r6.status);
  }

  // 14. Courses — admin CRUD
  section('COURSES — ADMIN CRUD');
  let newCourseId = '';
  {
    // Create course with a valid relative imageUrl
    const r = await req('POST', '/api/courses', {
      title: `Test Course ${ts}`, description: 'Created by test script',
      category: 'programming', level: 'beginner', requiresDocument: false,
      imageUrl: '/cs/programming.jpg',
    }, adminToken);
    ok('POST /courses (admin) → 201', r.status === 201, 201, r.status);
    if (r.body.data) {
      newCourseId = r.body.data._id;
      ok('POST /courses includes imageUrl', r.body.data.imageUrl === '/cs/programming.jpg', true, r.body.data.imageUrl);
    }

    // Test validation for bad imageUrl
    const rVal = await req('POST', '/api/courses', {
      title: `Test Course Bad URL ${ts}`, description: 'Created by test script',
      category: 'programming', level: 'beginner', requiresDocument: false,
      imageUrl: 'not-a-valid-url-and-not-starting-with-slash'
    }, adminToken);
    ok('POST /courses with bad imageUrl → 422', rVal.status === 422, 422, rVal.status);

    const r2 = await req('POST', '/api/courses', { title: 'Unauthorized' }, studentToken);
    ok('POST /courses (student) → 403', r2.status === 403, 403, r2.status);

    if (newCourseId) {
      // Update course with a valid absolute imageUrl
      const r3 = await req('PUT', `/api/courses/${newCourseId}`, {
        description: 'Updated',
        imageUrl: 'https://example.com/another-image.png'
      }, adminToken);
      ok('PUT /courses/:id (admin) → 200', r3.status === 200, 200, r3.status);
      if (r3.body.data) {
        ok('PUT /courses/:id includes updated imageUrl', r3.body.data.imageUrl === 'https://example.com/another-image.png', true, r3.body.data.imageUrl);
      }

      const r4 = await req('PATCH', `/api/courses/${newCourseId}/toggle-status`, null, adminToken);
      ok('PATCH /courses/:id/toggle-status → 200', r4.status === 200, 200, r4.status);
      await req('PATCH', `/api/courses/${newCourseId}/toggle-status`, null, adminToken); // toggle back

      const r5 = await req('DELETE', `/api/courses/${newCourseId}`, null, adminToken);
      ok('DELETE /courses/:id → 200', r5.status === 200, 200, r5.status);
    }
  }

  // 15. Enrollments — anonymous (frontend form shape)
  section('ENROLLMENTS — ANONYMOUS (frontend form)');
  {
    if (!courseId) {
      console.log(`  ${Y}⚠ Skipping — no courses in DB${X}`);
    } else {
      // Use frontendId if available, else fall back to MongoDB ObjectId
      const courseType = 'cs-1'; // frontendId from seed

      const r = await req('POST', '/api/enrollments', {
        studentName: TEST_FULL, email: TEST_EMAIL, courseType,
      });
      ok('POST /enrollments (anonymous, frontendId) → 201 or 409',
        r.status === 201 || r.status === 409, '201 or 409', r.status,
        r.status !== 201 && r.status !== 409 ? JSON.stringify(r.body?.errors || r.body?.message) : '');
      if (r.body.data) enrollmentId = r.body.data.id;

      // Duplicate
      const r2 = await req('POST', '/api/enrollments', {
        studentName: TEST_FULL, email: TEST_EMAIL, courseType,
      });
      ok('POST /enrollments duplicate → 409', r2.status === 409, 409, r2.status);

      // Enroll using MongoDB ObjectId directly — use a course that doesn't require PDF
      // First find cs-3 (Computer Basics) which has requiresDocument:false
      const coursesRes = await req('GET', '/api/courses?search=Computer+Basics');
      const cs3Id = coursesRes.body.data?.courses?.[0]?._id || courseId;
      const r3 = await req('POST', '/api/enrollments', {
        studentName: 'Different Student', email: `different_${ts}@example.com`, courseType: cs3Id,
      });
      ok('POST /enrollments (ObjectId courseType) → 201 or 409',
        r3.status === 201 || r3.status === 409, '201 or 409', r3.status);

      // Missing fields
      const r4 = await req('POST', '/api/enrollments', { courseType });
      ok('POST /enrollments missing fields → 422', r4.status === 422, 422, r4.status);
    }
  }

  // 16. Contact form (public)
  section('CONTACT FORM');
  {
    const r = await req('POST', '/api/contact', {
      name: 'Test Contact', email: 'contact@test.com',
      subject: 'Test subject', message: 'This is a test message from the test script.',
    });
    ok('POST /api/contact → 201', r.status === 201, 201, r.status);

    const r2 = await req('POST', '/api/contact', { name: 'Missing fields' });
    ok('POST /api/contact missing fields → 422', r2.status === 422, 422, r2.status);
  }

  // 17. Admin dashboard
  section('ADMIN — DASHBOARD');
  {
    const r = await req('GET', '/api/admin/dashboard', null, adminToken);
    ok('GET /admin/dashboard → 200', r.status === 200, 200, r.status);
    if (r.body.data) {
      const d = r.body.data;
      console.log(`    ${Y}→ Students: ${d.totalStudents} | Courses: ${d.totalCourses} | Enrollments: ${d.enrollments?.total}${X}`);
      console.log(`    ${Y}→ Status keys: ${Object.keys(d.enrollments || {}).join(', ')}${X}`);
    }

    const r2 = await req('GET', '/api/admin/dashboard', null, studentToken);
    ok('GET /admin/dashboard (student) → 403', r2.status === 403, 403, r2.status);
  }

  // 18. Admin feedback (contact submissions)
  section('ADMIN — FEEDBACK');
  {
    const r = await req('GET', '/api/admin/feedback', null, adminToken);
    ok('GET /admin/feedback → 200', r.status === 200, 200, r.status);
    if (r.body.data) {
      console.log(`    ${Y}→ Feedback count: ${r.body.data.feedback?.length}${X}`);
      if (r.body.data.feedback?.[0]) {
        const keys = Object.keys(r.body.data.feedback[0]);
        console.log(`    ${Y}→ Feedback fields: ${keys.join(', ')}${X}`);
      }
    }

    const r2 = await req('GET', '/api/admin/feedback', null, studentToken);
    ok('GET /admin/feedback (student) → 403', r2.status === 403, 403, r2.status);
  }

  // 19. Admin enrollments
  section('ADMIN — ENROLLMENTS');
  {
    const r = await req('GET', '/api/admin/enrollments', null, adminToken);
    ok('GET /admin/enrollments → 200', r.status === 200, 200, r.status);
    if (r.body.data?.enrollments?.[0]) {
      const keys = Object.keys(r.body.data.enrollments[0]);
      console.log(`    ${Y}→ Enrollment fields: ${keys.join(', ')}${X}`);
      enrollmentId = r.body.data.enrollments[0].id || enrollmentId;
    }

    const r2 = await req('GET', '/api/admin/enrollments?status=pending', null, adminToken);
    ok('GET /admin/enrollments?status=pending → 200', r2.status === 200, 200, r2.status);

    const r3 = await req('GET', '/api/admin/enrollments?status=accepted', null, adminToken);
    ok('GET /admin/enrollments?status=accepted → 200', r3.status === 200, 200, r3.status);

    const r4 = await req('GET', '/api/admin/enrollments?search=test', null, adminToken);
    ok('GET /admin/enrollments?search=test → 200', r4.status === 200, 200, r4.status);

    if (enrollmentId) {
      const r5 = await req('GET', `/api/admin/enrollments/${enrollmentId}`, null, adminToken);
      ok('GET /admin/enrollments/:id → 200', r5.status === 200, 200, r5.status);

      const r6 = await req('PATCH', `/api/admin/enrollments/${enrollmentId}/approve`, null, adminToken);
      ok('PATCH /admin/enrollments/:id/approve → 200', r6.status === 200, 200, r6.status,
         r6.status !== 200 ? JSON.stringify(r6.body?.message) : '');
      if (r6.status === 200) {
        console.log(`    ${Y}→ Status is now: ${r6.body.data?.status}${X}`);
        console.log(`    ${Y}→ Approval email sent (check Mailtrap)${X}`);
      }

      const r7 = await req('PATCH', `/api/admin/enrollments/${enrollmentId}/approve`, null, adminToken);
      ok('PATCH approve already-accepted → 409', r7.status === 409, 409, r7.status);
    }
  }

  // 20. Admin reject (using a new enrollment)
  section('ADMIN — REJECT ENROLLMENT');
  {
    // Create a second enrollment with a different email so we have a fresh pending one
    const secondEmail = `second_${ts}@example.com`;
    const newEnroll = await req('POST', '/api/enrollments', {
      studentName: 'Second Student', email: secondEmail, courseType: 'cs-1',
    });
    if (newEnroll.status === 201) {
      const newId = newEnroll.body.data?.id;
      const r = await req('PATCH', `/api/admin/enrollments/${newId}/reject`, {
        rejectionReason: 'Documents are incomplete.',
      }, adminToken);
      ok('PATCH /admin/enrollments/:id/reject → 200', r.status === 200, 200, r.status);
      if (r.status === 200) console.log(`    ${Y}→ Status: ${r.body.data?.status}${X}`);

      // Test reject without reason (should still work — rejectionReason is optional)
      const newEnroll2 = await req('POST', '/api/enrollments', {
        studentName: 'Third Student', email: `third_${ts}@example.com`, courseType: 'cs-3',
      });
      if (newEnroll2.status === 201) {
        const r2 = await req('PATCH', `/api/admin/enrollments/${newEnroll2.body.data?.id}/reject`, {}, adminToken);
        ok('PATCH /reject without reason → 422 (rejectionReason is required)', r2.status === 422, 422, r2.status);
      }
    } else {
      console.log(`  ${Y}⚠ Skipping reject tests — could not create fresh enrollment${X}`);
    }
  }

  // 21. Admin students
  section('ADMIN — STUDENTS');
  {
    const r = await req('GET', '/api/admin/students', null, adminToken);
    ok('GET /admin/students → 200', r.status === 200, 200, r.status);

    const r2 = await req('GET', '/api/admin/students?search=test', null, adminToken);
    ok('GET /admin/students?search=test → 200', r2.status === 200, 200, r2.status);

    if (studentId) {
      const r3 = await req('GET', `/api/admin/students/${studentId}`, null, adminToken);
      ok('GET /admin/students/:id → 200', r3.status === 200, 200, r3.status);

      const r4 = await req('PATCH', `/api/admin/students/${studentId}/toggle-status`, null, adminToken);
      ok('PATCH /admin/students/:id/toggle-status → 200', r4.status === 200, 200, r4.status);
      await req('PATCH', `/api/admin/students/${studentId}/toggle-status`, null, adminToken); // re-enable
    }

    const r5 = await req('GET', '/api/admin/students/not-valid-id', null, adminToken);
    ok('GET /admin/students/invalid-id → 422', r5.status === 422, 422, r5.status);
  }

  // 22. Security checks
  section('SECURITY CHECKS');
  {
    const r1 = await req('GET', '/api/auth/me');
    ok('GET /me no token → 401', r1.status === 401, 401, r1.status);

    const r2 = await req('GET', '/api/admin/students', null, studentToken);
    ok('GET /admin/students (student) → 403', r2.status === 403, 403, r2.status);

    const r3 = await req('POST', '/api/auth/login', {
      email: { $gt: '' }, password: { $gt: '' },
    });
    ok('POST /login NoSQL injection → 422 or 400', r3.status === 422 || r3.status === 400, '422|400', r3.status);

    const r4 = await req('GET', '/api/nonexistent');
    ok('GET unknown route → 404', r4.status === 404, 404, r4.status);
  }

  // 23. Cleanup
  section('CLEANUP');
  {
    if (studentId && adminToken) {
      const r = await req('DELETE', `/api/admin/students/${studentId}`, null, adminToken);
      ok('DELETE test student → 200', r.status === 200, 200, r.status);
    }
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) await mongoose.connection.close();
  }

  // ── Final report ────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${B}${'═'.repeat(60)}${X}`);
  console.log(`${B}RESULTS: ${G}${passed} passed${X} ${B}| ${R}${failed} failed${X} ${B}| ${total} total${X}`);
  console.log(`${B}${'═'.repeat(60)}${X}`);

  if (failed === 0) {
    console.log(`\n${G}${B}✅ All tests passed!${X}`);
  } else {
    console.log(`\n${R}${B}❌ ${failed} test(s) failed. Review above.${X}`);
  }

  console.log(`\n${Y}${B}📧 Email:${X} Check Mailtrap inbox at mailtrap.io for sent emails.\n`);
  process.exit(failed > 0 ? 1 : 0);
};

run().catch((err) => {
  console.error(`\n${R}Fatal: ${err.message}${X}`);
  process.exit(1);
});
