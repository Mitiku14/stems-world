require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Site = require('../src/models/Site');
const Competition = require('../src/models/Competition');
const CompetitionRegistration = require('../src/models/CompetitionRegistration');
const Enrollment = require('../src/models/Enrollment');
const Notification = require('../src/models/Notification');
const Certificate = require('../src/models/Certificate');
const { ensureInitialCourseSubcategories } = require('../seed/courseSubcategory.seed');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');

const collectionPath = path.join(__dirname, '../postman_collection.json');
const rawCollection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

const BASE_URL = process.env.API_URL ? process.env.API_URL.replace('/api', '') : 'http://localhost:5000';

let studentToken = '';
let adminToken = '';
let studentId = '';
let adminId = '';
let studentEmail = '';
let courseId = '';
let deleteCourseId = '';
let resourceId = '';
let siteId = '';
let competitionId = '';
let compRegId = '';
let enrollmentId = '';
let notificationId = '';
let certificateId = '';
let certificateNumber = `CERT-2026-${Date.now().toString(16).toUpperCase()}`;

let totalRequests = 0;
let passedRequests = 0;
let failedRequests = 0;
const failureDetails = [];

const setupFixtures = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('📦 Connected to DB for Postman verification fixtures...');
  await ensureInitialCourseSubcategories();

  const hashedPassword = await bcrypt.hash('Password123!', 10);

  // 1. Setup Student & Token
  studentEmail = `postman_student@example.com`;
  let student = await User.findOne({ email: studentEmail });
  if (student) {
    student.password = hashedPassword;
    student.role = 'student';
    student.isEmailVerified = true;
    student.isActive = true;
    await student.save();
  } else {
    student = await User.create({
      username: `postman_student_${Date.now()}`,
      name: 'Postman Test Student',
      email: studentEmail,
      password: hashedPassword,
      role: 'student',
      isEmailVerified: true,
      isActive: true
    });
  }
  studentId = student._id.toString();
  studentToken = jwt.sign({ id: student._id, role: student.role }, env.jwt.secret, { expiresIn: env.jwt.expire });

  // 2. Setup Admin & Token
  let admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    admin = await User.create({
      username: 'postman_admin',
      name: 'Postman Admin',
      email: 'postman_admin@example.com',
      password: hashedPassword,
      role: 'admin',
      isEmailVerified: true,
      isActive: true
    });
  }
  adminId = admin._id.toString();
  adminToken = jwt.sign({ id: admin._id, role: admin.role }, env.jwt.secret, { expiresIn: env.jwt.expire });

  // 3. Setup Course & Resource
  let course = await Course.findOne({ isActive: true });
  if (!course) {
    course = await Course.create({
      title: `Postman Test Course ${Date.now()}`,
      description: 'Course created for Postman automated testing',
      category: 'technology',
      subcategory: 'programming',
      level: 'beginner',
      duration: '4 weeks',
      isActive: true,
      resources: [
        {
          title: 'Postman Resource Guide',
          description: 'PDF Guide',
          type: 'pdf',
          url: 'https://example.com/guide.pdf',
          position: 1,
          isActive: true
        }
      ]
    });
  } else if (!course.resources || course.resources.length === 0) {
    course.resources.push({
      title: 'Postman Resource Guide',
      description: 'PDF Guide',
      type: 'pdf',
      url: 'https://example.com/guide.pdf',
      position: 1,
      isActive: true
    });
    await course.save();
  }
  courseId = course._id.toString();
  resourceId = course.resources[0]._id.toString();

  // Create course dedicated for deletion test (no active enrollments)
  const delCourse = await Course.create({
    title: `Postman Course To Delete ${Date.now()}`,
    description: 'Temporary course for delete test',
    category: 'technology',
    subcategory: 'programming',
    level: 'beginner',
    isActive: true
  });
  deleteCourseId = delCourse._id.toString();

  // 4. Setup Site
  let site = await Site.findOne({ isActive: true });
  if (!site) {
    site = await Site.create({
      name: `Postman Site Hub ${Date.now()}`,
      address: 'Bole Road, Addis Ababa',
      description: 'Hub for postman verification tests',
      isActive: true
    });
  }
  siteId = site._id.toString();

  // 5. Setup Competition
  let comp = await Competition.findOne({ status: 'published', isActive: true });
  if (!comp) {
    comp = await Competition.create({
      title: `Postman Hackathon ${Date.now()}`,
      description: 'Postman hackathon test event',
      category: 'steam_innovation',
      type: 'team',
      scope: 'national',
      registrationOpenDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      registrationCloseDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      eventStartDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      eventEndDate: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
      status: 'published',
      isActive: true
    });
  }
  competitionId = comp._id.toString();

  // 6. Setup Competition Registration
  const compReg = await CompetitionRegistration.create({
    competition: competitionId,
    student: studentId,
    fullName: 'Postman Participant',
    email: studentEmail,
    phone: '+1234567890',
    grade: '12th Grade',
    status: 'pending'
  });
  compRegId = compReg._id.toString();

  // 7. Setup Enrollment
  const enrollment = await Enrollment.create({
    student: studentId,
    studentName: 'Postman Test Student',
    studentEmail: studentEmail,
    course: courseId,
    site: siteId,
    grade: '12th Grade',
    status: 'pending'
  });
  enrollmentId = enrollment._id.toString();

  // 8. Setup Notification
  const notification = await Notification.create({
    recipient: studentId,
    title: 'Postman Verification Notification',
    message: 'Test notification message',
    type: 'general',
    isRead: false
  });
  notificationId = notification._id.toString();

  // 9. Setup Certificate
  const cert = await Certificate.create({
    student: studentId,
    certificateNumber,
    type: 'course_completion',
    title: 'Postman Certificate of Mastery',
    course: courseId,
    issuedBy: adminId,
    status: 'valid'
  });
  certificateId = cert._id.toString();

  console.log('✅ Fixtures populated cleanly.');
};

const resolveUrl = (rawUrl, itemName) => {
  let resolved = rawUrl
    .replace('{{BASE_URL}}', BASE_URL)
    .replace('{{course_id}}', itemName === 'Admin Delete Course' ? deleteCourseId : courseId)
    .replace('{{resource_id}}', resourceId)
    .replace('{{enrollment_id}}', enrollmentId)
    .replace('{{competition_id}}', competitionId)
    .replace('{{comp_reg_id}}', compRegId)
    .replace('{{site_id}}', siteId)
    .replace('{{notification_id}}', notificationId)
    .replace('{{certificate_id}}', certificateId)
    .replace('{{certificate_number}}', certificateNumber)
    .replace('{{student_id}}', studentId);
  return resolved;
};

const runRequest = async (folderName, item) => {
  totalRequests++;
  const req = item.request;
  const url = resolveUrl(req.url.raw, item.name);
  const method = req.method;

  const headers = {
    'Content-Type': 'application/json'
  };

  // Auth check
  if (item.auth && item.auth.type === 'bearer') {
    const tokenVar = item.auth.bearer[0].value;
    if (tokenVar.includes('admin_token')) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    } else {
      headers['Authorization'] = `Bearer ${studentToken}`;
    }
  }

  let body = null;
  if (req.body && req.body.raw) {
    let rawBody = req.body.raw
      .replace('{{course_id}}', courseId)
      .replace('{{resource_id}}', resourceId)
      .replace('{{enrollment_id}}', enrollmentId)
      .replace('{{competition_id}}', competitionId)
      .replace('{{comp_reg_id}}', compRegId)
      .replace('{{site_id}}', siteId)
      .replace('{{notification_id}}', notificationId)
      .replace('{{certificate_id}}', certificateId)
      .replace('{{student_id}}', studentId);

    if (url.includes('/api/auth/register')) {
      const parsed = JSON.parse(rawBody);
      parsed.email = `reg_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      rawBody = JSON.stringify(parsed);
    }

    if (item.name === 'Admin Create Course') {
      const parsed = JSON.parse(rawBody);
      parsed.title = `Advanced Robotics & Automation ${Date.now()}`;
      parsed.frontendId = `robotics-adv-${Date.now()}`;
      rawBody = JSON.stringify(parsed);
    }

    if (item.name === 'Admin Update Course') {
      const parsed = JSON.parse(rawBody);
      parsed.title = `Advanced Robotics & Automation Updated ${Date.now()}`;
      rawBody = JSON.stringify(parsed);
    }

    if (item.name === 'Admin Create Competition') {
      const parsed = JSON.parse(rawBody);
      parsed.title = `National AI Hackathon ${Date.now()}`;
      rawBody = JSON.stringify(parsed);
    }

    if (item.name === 'Admin Create Site') {
      const parsed = JSON.parse(rawBody);
      parsed.name = `Hawassa Regional Tech Center ${Date.now()}`;
      rawBody = JSON.stringify(parsed);
    }

    if (item.name === 'Admin Update Site') {
      const parsed = JSON.parse(rawBody);
      parsed.name = `Hawassa Regional Tech Center Updated ${Date.now()}`;
      rawBody = JSON.stringify(parsed);
    }

    if (item.name === 'Admin Issue Digital Certificate') {
      const parsed = JSON.parse(rawBody);
      parsed.type = 'competition_achievement'; // use non-duplicate valid type for test user
      rawBody = JSON.stringify(parsed);
    }

    if (item.name === 'Admin Promote User to Admin') {
      const promoteEmail = `promote_candidate_${Date.now()}@example.com`;
      await User.create({
        username: `candidate_${Date.now()}`,
        name: 'Promotion Candidate',
        email: promoteEmail,
        password: '$2a$10$abcdefghijklmnopqrstuv',
        role: 'student',
        isEmailVerified: true,
        isActive: true
      });
      const parsed = JSON.parse(rawBody);
      parsed.email = promoteEmail;
      rawBody = JSON.stringify(parsed);
    }

    body = rawBody;
  }

  if (item.name === 'Submit Course Enrollment (Auth / Anon)') {
    // Ensure course is active for enrollment
    const activeCourse = await Course.findOne({ isActive: true });
    let activeCourseId = courseId;
    if (activeCourse) {
      activeCourseId = activeCourse._id.toString();
    } else {
      const newActiveCourse = await Course.create({
        title: `Active Course For Enrollment ${Date.now()}`,
        category: 'technology',
        subcategory: 'programming',
        level: 'beginner',
        isActive: true
      });
      activeCourseId = newActiveCourse._id.toString();
    }
    const parsedBody = JSON.parse(body || '{}');
    parsedBody.courseType = activeCourseId;
    body = JSON.stringify(parsedBody);
  }

  // Pre-condition state management for specific sequential test steps
  if (item.name === 'Admin Reject Enrollment') {
    // Create a fresh pending enrollment so reject test doesn't conflict with approve test
    const pendingEnr = await Enrollment.create({
      student: studentId,
      studentName: 'Postman Test Student',
      studentEmail: studentEmail,
      course: courseId,
      site: siteId,
      grade: '12th Grade',
      status: 'pending'
    });
    const testUrl = `${BASE_URL}/api/admin/enrollments/${pendingEnr._id}/reject`;
    return executeHttpCall(folderName, item, method, testUrl, headers, body);
  }

  if (item.name === 'Register for Competition') {
    // Create a fresh competition so registration test doesn't duplicate
    const freshComp = await Competition.create({
      title: `Registration Competition ${Date.now()}`,
      category: 'steam_innovation',
      type: 'team',
      scope: 'national',
      registrationOpenDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      registrationCloseDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      eventStartDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      eventEndDate: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
      status: 'published',
      isActive: true
    });
    const testUrl = `${BASE_URL}/api/competitions/${freshComp._id}/register`;
    return executeHttpCall(folderName, item, method, testUrl, headers, body);
  }

  if (item.name === 'Admin Reject Competition Registration') {
    // Create a fresh pending competition registration so reject test doesn't conflict
    const pendingCompReg = await CompetitionRegistration.create({
      competition: competitionId,
      student: studentId,
      fullName: 'Postman Reject Participant',
      email: `reject_${Date.now()}@example.com`,
      phone: '+1234567890',
      grade: '12th Grade',
      status: 'pending'
    });
    const testUrl = `${BASE_URL}/api/admin/competition-registrations/${pendingCompReg._id}/reject`;
    return executeHttpCall(folderName, item, method, testUrl, headers, body);
  }

  return executeHttpCall(folderName, item, method, url, headers, body);
};

const executeHttpCall = async (folderName, item, method, url, headers, body) => {
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? null : body
    });

    const isCSV = res.headers.get('content-type')?.includes('text/csv');
    let responseData = null;

    if (isCSV) {
      responseData = await res.text();
    } else {
      responseData = await res.json().catch(() => null);
    }

    const isSuccess = res.status >= 200 && res.status < 300;
    const isExpectedMock = (url.includes('/reset-password') || url.includes('/verify-email') || url.includes('/google')) && res.status >= 400 && res.status < 500;

    if (isSuccess || isExpectedMock) {
      passedRequests++;
      console.log(`  ✔ [${folderName}] ${item.name} (${method} ${res.status})`);
    } else {
      failedRequests++;
      console.log(`  ✘ [${folderName}] ${item.name} (${method} ${res.status}) - ${JSON.stringify(responseData)}`);
      failureDetails.push({ folder: folderName, request: item.name, status: res.status, url, response: responseData });
    }
  } catch (err) {
    failedRequests++;
    console.log(`  ✘ [${folderName}] ${item.name} ERROR: ${err.message}`);
    failureDetails.push({ folder: folderName, request: item.name, error: err.message, url });
  }
};

const runAll = async () => {
  await setupFixtures();
  console.log('\n🚀 Executing Postman Collection Request Verifications against live server...\n');

  for (const folder of rawCollection.item) {
    console.log(`\n📂 ${folder.name}`);
    for (const item of folder.item) {
      await runRequest(folder.name, item);
    }
  }

  console.log('\n============================================================');
  console.log(`SUMMARY: Total Requests: ${totalRequests} | Passed: ${passedRequests} | Failed: ${failedRequests}`);
  console.log('============================================================\n');

  if (failureDetails.length > 0) {
    console.log('Failure details:', JSON.stringify(failureDetails, null, 2));
  }

  await mongoose.connection.close();
  process.exit(failedRequests > 0 ? 1 : 0);
};

runAll().catch(err => {
  console.error(err);
  process.exit(1);
});
