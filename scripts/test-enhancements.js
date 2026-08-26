require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');

const BASE_URL = 'http://localhost:5000';
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m', X = '\x1b[0m', B = '\x1b[1m';
let passed = 0, failed = 0;

function ok(name, pass, detail = '') {
  if (pass) {
    passed++;
    console.log(`  ${G}✔${X} ${name}`);
  } else {
    failed++;
    console.log(`  ${R}✘${X} ${name}`);
    if (detail) console.log(`    ${Y}${detail}${X}`);
  }
}

function section(t) {
  console.log(`\n${B}${C}── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}${X}`);
}

const request = (method, path, body = null, token = null) => {
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        const isCSV = res.headers['content-type']?.includes('text/csv');
        if (!isCSV) {
          try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, body: null, error: err.message });
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

async function runEnhancementTests() {
  console.log(`\n${B}═════════════════════════════════════════════════════════════${X}`);
  console.log(`${B}   BACKEND ENHANCEMENT TEST SUITE — 5 NEW FEATURES   ${X}`);
  console.log(`${B}═════════════════════════════════════════════════════════════${X}\n`);

  const ts = Date.now();
  const studentEmail = `student_enh_${ts}@example.com`;
  const studentPass = 'StudentPass@123';
  let studentToken = null;
  let studentId = null;
  let adminToken = null;

  // 1. Setup Student Account & Admin Token
  section('SETUP: AUTHENTICATION');
  const regRes = await request('POST', '/api/auth/register', {
    fullName: 'Enhancement Test Student',
    email: studentEmail,
    password: studentPass,
  });
  ok('Register student', regRes.status === 201);

  // Force verify student in DB
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../src/models/User');
  const studentUser = await User.findOne({ email: studentEmail });
  if (studentUser) {
    studentUser.isEmailVerified = true;
    await studentUser.save();
    studentId = studentUser._id.toString();
  }

  const loginRes = await request('POST', '/api/auth/login', { email: studentEmail, password: studentPass });
  studentToken = loginRes.body.data?.token;
  ok('Login student', loginRes.status === 200 && !!studentToken);

  const adminLoginRes = await request('POST', '/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@elearning.com',
    password: process.env.ADMIN_PASSWORD || 'AdminPass@123',
  });
  adminToken = adminLoginRes.body.data?.token;
  ok('Login admin', adminLoginRes.status === 200 && !!adminToken);

  // --------------------------------------------------------------------------
  // FEATURE 1: IN-APP NOTIFICATIONS
  // --------------------------------------------------------------------------
  section('FEATURE 1: IN-APP NOTIFICATIONS');

  // Trigger notification via enrollment
  const coursesRes = await request('GET', '/api/courses');
  const firstCourse = coursesRes.body.data?.courses?.[0];
  let enrollId = null;

  if (firstCourse) {
    const courseId = firstCourse._id.toString();
    const enrollRes = await request('POST', '/api/enrollments', {
      studentName: 'Enhancement Test Student',
      email: studentEmail,
      courseType: courseId,
      academicPdf: 'https://example.com/test-document.pdf',
    }, studentToken);
    enrollId = enrollRes.body.data?.id;
    ok('Submit enrollment triggers notification', enrollRes.status === 201);
  }

  // Get student notifications
  const notifListRes = await request('GET', '/api/notifications', null, studentToken);
  ok('GET /api/notifications returns list', notifListRes.status === 200 && Array.isArray(notifListRes.body.data?.notifications));
  const latestNotif = notifListRes.body.data?.notifications?.[0];
  ok('Notification created with title & unread state', latestNotif && latestNotif.isRead === false);

  // Get unread count
  const unreadRes = await request('GET', '/api/notifications/unread-count', null, studentToken);
  ok('GET /api/notifications/unread-count', unreadRes.status === 200 && unreadRes.body.data?.unreadCount >= 1);

  // Admin Broadcast Announcement
  const announceRes = await request('POST', '/api/admin/announcements', {
    title: 'Platform Maintenance',
    message: 'Scheduled maintenance tonight at 12:00 AM UTC.',
  }, adminToken);
  ok('POST /api/admin/announcements (Admin only)', announceRes.status === 201);

  // Mark single read
  if (latestNotif) {
    const markRes = await request('PATCH', `/api/notifications/${latestNotif.id}/read`, null, studentToken);
    ok('PATCH /api/notifications/:id/read', markRes.status === 200 && markRes.body.data?.isRead === true);
  }

  // Mark all read
  const markAllRes = await request('PATCH', '/api/notifications/read-all', null, studentToken);
  ok('PATCH /api/notifications/read-all', markAllRes.status === 200);

  // Delete notification
  if (latestNotif) {
    const delNotifRes = await request('DELETE', `/api/notifications/${latestNotif.id}`, null, studentToken);
    ok('DELETE /api/notifications/:id', delNotifRes.status === 200);
  }

  // --------------------------------------------------------------------------
  // FEATURE 2: ENHANCED ADMIN ANALYTICS
  // --------------------------------------------------------------------------
  section('FEATURE 2: ENHANCED ADMIN ANALYTICS');

  const dashRes = await request('GET', '/api/admin/dashboard', null, adminToken);
  ok('GET /api/admin/dashboard returns 200', dashRes.status === 200);
  ok('Includes activeStudents count', typeof dashRes.body.data?.activeStudents === 'number');
  ok('Includes activeCourses count', typeof dashRes.body.data?.activeCourses === 'number');
  ok('Includes enrollments.byCourse aggregation', Array.isArray(dashRes.body.data?.enrollments?.byCourse));
  ok('Includes enrollments.bySite aggregation', Array.isArray(dashRes.body.data?.enrollments?.bySite));
  ok('Includes enrollments.byStatus breakdown', typeof dashRes.body.data?.enrollments?.byStatus === 'object');

  const studentDashRes = await request('GET', '/api/admin/dashboard', null, studentToken);
  ok('Student blocked from admin dashboard (HTTP 403)', studentDashRes.status === 403);

  // --------------------------------------------------------------------------
  // FEATURE 3: CSV EXPORT
  // --------------------------------------------------------------------------
  section('FEATURE 3: CSV DATA EXPORT');

  const csvStudentsRes = await request('GET', '/api/admin/export/students', null, adminToken);
  ok('Export students returns text/csv', csvStudentsRes.status === 200 && csvStudentsRes.headers['content-type']?.includes('text/csv'));
  ok('CSV contains header column ID,Name,Email', typeof csvStudentsRes.body === 'string' && csvStudentsRes.body.includes('"ID","Name","Email"'));

  const csvEnrollRes = await request('GET', '/api/admin/export/enrollments', null, adminToken);
  ok('Export enrollments returns text/csv', csvEnrollRes.status === 200 && csvEnrollRes.headers['content-type']?.includes('text/csv'));

  const csvCompRes = await request('GET', '/api/admin/export/competition-registrations', null, adminToken);
  ok('Export competition registrations returns text/csv', csvCompRes.status === 200 && csvCompRes.headers['content-type']?.includes('text/csv'));

  const csvCoursesRes = await request('GET', '/api/admin/export/courses', null, adminToken);
  ok('Export courses returns text/csv', csvCoursesRes.status === 200 && csvCoursesRes.headers['content-type']?.includes('text/csv'));
  ok('Course CSV contains Category and Subcategory columns', typeof csvCoursesRes.body === 'string' && csvCoursesRes.body.includes('"Category","Subcategory"'));

  const studentExportRes = await request('GET', '/api/admin/export/students', null, studentToken);
  ok('Student blocked from CSV export (HTTP 403)', studentExportRes.status === 403);

  // --------------------------------------------------------------------------
  // FEATURE 4: DIGITAL CERTIFICATES
  // --------------------------------------------------------------------------
  section('FEATURE 4: DIGITAL CERTIFICATES');

  let certNumber = null;
  let certId = null;

  if (studentId && firstCourse) {
    const courseIdStr = firstCourse._id.toString();
    // Issue certificate
    const issueRes = await request('POST', '/api/admin/certificates', {
      studentId,
      type: 'course_completion',
      title: `Certificate of Completion - ${firstCourse.title}`,
      courseId: courseIdStr,
      gradeOrRank: 'Distinction',
    }, adminToken);

    ok('Admin issue certificate (HTTP 201)', issueRes.status === 201);
    certNumber = issueRes.body.data?.certificateNumber;
    certId = issueRes.body.data?.id;
    ok('Generated unique certificateNumber (e.g. CERT-2026-...)', !!certNumber && certNumber.startsWith('CERT-'));

    // Duplicate check
    const dupCertRes = await request('POST', '/api/admin/certificates', {
      studentId,
      type: 'course_completion',
      title: `Certificate of Completion - ${firstCourse.title}`,
      courseId: courseIdStr,
    }, adminToken);
    ok('Duplicate certificate prevented (HTTP 409)', dupCertRes.status === 409);

    // Student fetch my certificates
    const myCertRes = await request('GET', '/api/certificates/my', null, studentToken);
    ok('Student fetch my certificates', myCertRes.status === 200 && myCertRes.body.data?.length >= 1);

    // Public verification
    if (certNumber) {
      const verifyRes = await request('GET', `/api/certificates/verify/${certNumber}`);
      ok('Public verification endpoint (unauthenticated HTTP 200)', verifyRes.status === 200 && verifyRes.body.data?.status === 'valid');
      ok('Exposes studentName and title', verifyRes.body.data?.studentName === 'Enhancement Test Student');
    }

    // Revoke certificate
    if (certId) {
      const revokeRes = await request('PATCH', `/api/admin/certificates/${certId}/revoke`, null, adminToken);
      ok('Admin revoke certificate (HTTP 200)', revokeRes.status === 200 && revokeRes.body.data?.status === 'revoked');

      const reVerifyRes = await request('GET', `/api/certificates/verify/${certNumber}`);
      ok('Verification of revoked certificate returns HTTP 400', reVerifyRes.status === 400 && reVerifyRes.body.data?.status === 'revoked');
    }
  }

  // --------------------------------------------------------------------------
  // FEATURE 5: COURSE RESOURCES
  // --------------------------------------------------------------------------
  section('FEATURE 5: COURSE RESOURCES');

  if (firstCourse) {
    const courseIdStr = firstCourse._id.toString();
    // Add resource
    const addResRes = await request('POST', `/api/admin/courses/${courseIdStr}/resources`, {
      title: 'Course Syllabus PDF',
      description: 'Downloadable complete curriculum',
      type: 'pdf',
      url: 'https://example.com/resources/syllabus.pdf',
      position: 1,
    }, adminToken);

    ok('Admin add course resource (HTTP 201)', addResRes.status === 201);
    const resourceId = addResRes.body.data?._id;

    // Add second resource
    const addResRes2 = await request('POST', `/api/admin/courses/${courseIdStr}/resources`, {
      title: 'GitHub Starter Repo',
      description: 'Template project files',
      type: 'github_repo',
      url: 'https://github.com/example/starter-repo',
      position: 2,
    }, adminToken);
    const resourceId2 = addResRes2.body.data?._id;

    // URL validation test
    const badUrlRes = await request('POST', `/api/admin/courses/${courseIdStr}/resources`, {
      title: 'Bad Resource',
      type: 'pdf',
      url: 'ftp://not-http-url',
    }, adminToken);
    ok('Invalid URL rejected (HTTP 422)', badUrlRes.status === 422);

    // Student fetch resources
    const getRes = await request('GET', `/api/courses/${courseIdStr}/resources`);
    ok('Public/Student fetch course resources', getRes.status === 200 && Array.isArray(getRes.body.data));
    const hasSyllabus = getRes.body.data?.some((r) => r.url === 'https://example.com/resources/syllabus.pdf');
    ok('Resource contains title & url', hasSyllabus);

    // Update resource
    if (resourceId) {
      const updateRes = await request('PUT', `/api/admin/courses/${courseIdStr}/resources/${resourceId}`, {
        title: 'Updated Syllabus PDF v2',
      }, adminToken);
      ok('Admin update course resource (HTTP 200)', updateRes.status === 200 && updateRes.body.data?.title === 'Updated Syllabus PDF v2');
    }

    // Reorder resources
    if (resourceId && resourceId2) {
      const reorderRes = await request('PATCH', `/api/admin/courses/${courseIdStr}/resources/reorder`, {
        resourceOrders: [
          { resourceId: resourceId, position: 2 },
          { resourceId: resourceId2, position: 1 },
        ],
      }, adminToken);
      ok('Admin reorder resources', reorderRes.status === 200);
    }

    // Delete resource
    if (resourceId) {
      const delRes = await request('DELETE', `/api/admin/courses/${courseIdStr}/resources/${resourceId}`, null, adminToken);
      ok('Admin delete resource (HTTP 200)', delRes.status === 200);
    }
  }

  // Cleanup DB connection
  await mongoose.connection.close();

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log(`\n${B}${'═'.repeat(60)}${X}`);
  console.log(`${B}TEST RESULTS: ${G}${passed} passed${X} ${B}| ${R}${failed} failed${X} ${B}| ${passed + failed} total${X}`);
  console.log(`${B}${'═'.repeat(60)}${X}\n`);

  if (failed > 0) process.exit(1);
}

runEnhancementTests().catch((err) => {
  console.error('Fatal Enhancement Test Error:', err);
  process.exit(1);
});
