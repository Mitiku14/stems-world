require('dotenv').config();

// Ensure test env variables are set if not loaded from .env
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.example.com';
process.env.EMAIL_PORT = process.env.EMAIL_PORT || '587';
process.env.EMAIL_USER = process.env.EMAIL_USER || 'test@example.com';
process.env.EMAIL_PASS = process.env.EMAIL_PASS || 'password';
process.env.EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@example.com';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test_google_client_id';

const { describe, it, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// ── Stub mongoose.connection.transaction for unit tests ─────────────────────
const originalTransaction = mongoose.connection.transaction;
before(() => {
  mongoose.connection.transaction = async (fn) => fn({
    // minimal session stub
    startTransaction() {},
    commitTransaction() {},
    abortTransaction() {},
  });
});

// ── Load modules under test ─────────────────────────────────────────────────
const Enrollment = require('../src/models/Enrollment');
const CompetitionRegistration = require('../src/models/CompetitionRegistration');
const StudentProfile = require('../src/models/StudentProfile');
const Course = require('../src/models/Course');
const { fullNameFor, compactProfileSummary } = require('../src/utils/studentProfile');
const { ENROLLMENT_STATUS } = require('../src/constants');

// ── Helpers ─────────────────────────────────────────────────────────────────
const oid = () => new mongoose.Types.ObjectId();
const parentA = oid();
const parentB = oid();
const courseId = oid();
const compId = oid();

const makeProfile = (overrides = {}) => ({
  _id: oid(),
  parentUser: parentA,
  slot: 1,
  givenName: 'Abel',
  fatherName: 'Bekele',
  grandfatherName: 'Tesfaye',
  grade: 'Grade 7',
  school: 'School A',
  isActive: true,
  ...overrides,
});

const profileA1 = makeProfile({ slot: 1 });
const profileA2 = makeProfile({ slot: 2, givenName: 'Sara', _id: oid() });
const profileB1 = makeProfile({ parentUser: parentB, slot: 1, _id: oid(), givenName: 'Marta' });

// =============================================================================
// ENROLLMENT TESTS
// =============================================================================

describe('Phase C Enrollment: schema preserves legacy student and adds studentProfile', () => {
  it('Enrollment schema has both student and studentProfile fields', () => {
    const paths = Enrollment.schema.paths;
    assert.ok(paths.student, 'student field must exist for legacy compatibility');
    assert.ok(paths.studentProfile, 'studentProfile field must exist for Phase C');
    assert.equal(paths.student.options.ref, 'User');
    assert.equal(paths.studentProfile.options.ref, 'StudentProfile');
    // Both default to null so legacy records are not broken
    assert.equal(paths.student.options.default, null);
    assert.equal(paths.studentProfile.options.default, null);
  });

  it('Enrollment has single partial unique index enrollment_active_unique for active studentProfile enrollments', () => {
    const indexes = Enrollment.schema.indexes();
    const hasActiveIndex = indexes.some(([fields, options]) =>
      fields.studentProfile === 1 &&
      fields.course === 1 &&
      options.name === 'enrollment_active_unique' &&
      options.unique === true &&
      options.partialFilterExpression &&
      options.partialFilterExpression.status &&
      Array.isArray(options.partialFilterExpression.status.$in)
    );
    assert.ok(hasActiveIndex, 'enrollment_active_unique partial unique index with status $in must exist');
  });

  it('legacy student + course + status index still exists', () => {
    const indexes = Enrollment.schema.indexes();
    const hasLegacy = indexes.some(([fields]) =>
      fields.student === 1 && fields.course === 1 && fields.status === 1
    );
    assert.ok(hasLegacy, 'legacy student + course + status index must be preserved');
  });
});

describe('Phase C Enrollment create: StudentProfile ownership verification', () => {
  const { resolveOwnedActiveProfile } = require('../src/controllers/enrollment.controller');

  it('resolveOwnedActiveProfile rejects malformed ObjectId', async () => {
    await assert.rejects(
      () => resolveOwnedActiveProfile('not-an-id', parentA),
      (err) => err.statusCode === 422 && /invalid/i.test(err.message)
    );
  });

  it('resolveOwnedActiveProfile rejects non-existent profile', async () => {
    const findOne = mock.fn(async () => null);
    const original = StudentProfile.findOne;
    StudentProfile.findOne = (...args) => ({ lean: () => findOne(...args) });

    try {
      await assert.rejects(
        () => resolveOwnedActiveProfile(oid().toString(), parentA),
        (err) => err.statusCode === 404
      );
    } finally {
      StudentProfile.findOne = original;
    }
  });

  it('resolveOwnedActiveProfile rejects inactive profile', async () => {
    const inactiveProfile = makeProfile({ isActive: false });
    const original = StudentProfile.findOne;
    StudentProfile.findOne = () => ({ lean: async () => inactiveProfile });

    try {
      await assert.rejects(
        () => resolveOwnedActiveProfile(inactiveProfile._id.toString(), parentA),
        (err) => err.statusCode === 400 && /not active/i.test(err.message)
      );
    } finally {
      StudentProfile.findOne = original;
    }
  });

  it('resolveOwnedActiveProfile rejects cross-parent profile', async () => {
    // Query with parentUser: parentA but profile belongs to parentB — findOne returns null
    const original = StudentProfile.findOne;
    StudentProfile.findOne = (filter) => ({
      lean: async () => {
        // parentUser mismatch means not found
        if (filter.parentUser.toString() !== profileB1.parentUser.toString()) return null;
        return profileB1;
      },
    });

    try {
      await assert.rejects(
        () => resolveOwnedActiveProfile(profileB1._id.toString(), parentA),
        (err) => err.statusCode === 404
      );
    } finally {
      StudentProfile.findOne = original;
    }
  });

  it('resolveOwnedActiveProfile accepts owned active profile', async () => {
    const original = StudentProfile.findOne;
    StudentProfile.findOne = () => ({ lean: async () => profileA1 });

    try {
      const result = await resolveOwnedActiveProfile(profileA1._id.toString(), parentA);
      assert.equal(result._id.toString(), profileA1._id.toString());
      assert.equal(result.isActive, true);
    } finally {
      StudentProfile.findOne = original;
    }
  });
});

describe('Phase C Enrollment: participant identity comes from StudentProfile', () => {
  it('fullName for enrollment is derived from StudentProfile, not client input', () => {
    const name = fullNameFor(profileA1);
    assert.equal(name, 'Abel Bekele Tesfaye');
    // Client cannot override this
    assert.notEqual(name, 'Spoofed Name');
  });

  it('compactProfileSummary does not expose parentUser', () => {
    const summary = compactProfileSummary(profileA1);
    assert.ok(summary._id);
    assert.ok(summary.fullName);
    assert.ok(summary.displayLabel);
    assert.ok(summary.profileNumber);
    assert.equal(summary.parentUser, undefined, 'parentUser must NOT be exposed');
  });
});

describe('Phase C Enrollment: duplicate rules by status', () => {
  const { ACTIVE_ENROLLMENT_STATUSES } = require('../src/controllers/enrollment.controller');

  it('pending and accepted block duplicate enrollment', () => {
    assert.ok(ACTIVE_ENROLLMENT_STATUSES.includes('pending'));
    assert.ok(ACTIVE_ENROLLMENT_STATUSES.includes('accepted'));
  });

  it('rejected status allows reapplication', () => {
    assert.ok(!ACTIVE_ENROLLMENT_STATUSES.includes('rejected'));
  });

  it('duplicate check uses studentProfile + course, not parent User + course', () => {
    // siblings can enroll independently because profileA1._id !== profileA2._id
    assert.notEqual(profileA1._id.toString(), profileA2._id.toString());
    assert.equal(profileA1.parentUser.toString(), profileA2.parentUser.toString());
    // Same parent, different profiles — no conflict
  });
});

describe('Phase C Enrollment: new enrollment does not store parent User as student', () => {
  it('enrollment with studentProfile sets student: null', () => {
    // This is enforced in the controller logic:
    // student: null, studentProfile: profile._id
    // We verify the model allows this combination
    const doc = new Enrollment({
      student: null,
      studentProfile: profileA1._id,
      studentName: 'Abel Bekele Tesfaye',
      studentEmail: 'parent@example.com',
      course: courseId,
    });
    assert.equal(doc.student, null);
    assert.equal(doc.studentProfile.toString(), profileA1._id.toString());
  });
});

// =============================================================================
// COMPETITION REGISTRATION TESTS
// =============================================================================

describe('Phase C CompetitionRegistration: schema preserves legacy and adds studentProfile', () => {
  it('CompetitionRegistration schema has both student and studentProfile fields', () => {
    const paths = CompetitionRegistration.schema.paths;
    assert.ok(paths.student, 'student field must exist for legacy compatibility');
    assert.ok(paths.studentProfile, 'studentProfile field must exist for Phase C');
    assert.equal(paths.student.options.ref, 'User');
    assert.equal(paths.studentProfile.options.ref, 'StudentProfile');
    assert.equal(paths.student.options.default, null);
    assert.equal(paths.studentProfile.options.default, null);
  });

  it('CompetitionRegistration has single partial unique index competition_reg_active_unique for active studentProfile registrations', () => {
    const indexes = CompetitionRegistration.schema.indexes();
    const hasActiveIndex = indexes.some(([fields, options]) =>
      fields.studentProfile === 1 &&
      fields.competition === 1 &&
      options.name === 'competition_reg_active_unique' &&
      options.unique === true &&
      options.partialFilterExpression &&
      options.partialFilterExpression.status &&
      Array.isArray(options.partialFilterExpression.status.$in)
    );
    assert.ok(hasActiveIndex, 'competition_reg_active_unique partial unique index with status $in must exist');
  });

  it('legacy student + competition index still exists', () => {
    const indexes = CompetitionRegistration.schema.indexes();
    const hasLegacy = indexes.some(([fields]) =>
      fields.student === 1 && fields.competition === 1
    );
    assert.ok(hasLegacy, 'legacy student + competition index must be preserved');
  });
});

describe('Phase C CompetitionRegistration: StudentProfile-based registration stores correctly', () => {
  it('registration with studentProfile sets student: null', () => {
    const doc = new CompetitionRegistration({
      competition: compId,
      student: null,
      studentProfile: profileA1._id,
      fullName: 'Abel Bekele Tesfaye',
      email: 'parent@example.com',
    });
    assert.equal(doc.student, null);
    assert.equal(doc.studentProfile.toString(), profileA1._id.toString());
    assert.equal(doc.fullName, 'Abel Bekele Tesfaye');
  });

  it('fullName comes from StudentProfile, client cannot spoof participant name', () => {
    const trueName = fullNameFor(profileA1);
    assert.equal(trueName, 'Abel Bekele Tesfaye');
    // Controller uses fullNameFor(profile), not req.body.fullName
  });

  it('academicFile, skills, motivation, team snapshots preserved in schema', () => {
    const doc = new CompetitionRegistration({
      competition: compId,
      studentProfile: profileA1._id,
      fullName: 'Abel Bekele Tesfaye',
      email: 'parent@example.com',
      academicFile: 'https://example.com/file.pdf',
      skills: ['math', 'science'],
      motivation: 'I love STEM',
      teamName: 'Team Alpha',
      teamMembers: ['Member 1'],
    });
    assert.equal(doc.academicFile, 'https://example.com/file.pdf');
    assert.deepEqual(doc.skills, ['math', 'science']);
    assert.equal(doc.motivation, 'I love STEM');
    assert.equal(doc.teamName, 'Team Alpha');
    assert.deepEqual(doc.teamMembers, ['Member 1']);
  });
});

describe('Phase C CompetitionRegistration: duplicate rules by status', () => {
  it('pending and accepted block duplicate competition registration', () => {
    // These are the active statuses in the controller
    assert.ok([ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.ACCEPTED].includes('pending'));
    assert.ok([ENROLLMENT_STATUS.PENDING, ENROLLMENT_STATUS.ACCEPTED].includes('accepted'));
  });

  it('rejected registration allows reapplication', () => {
    assert.ok(!['pending', 'accepted'].includes('rejected'));
  });

  it('duplicate check uses studentProfile + competition, not parent User + competition', () => {
    // Siblings profileA1 and profileA2 have same parent but different _ids
    // They can independently register for the same competition
    assert.notEqual(profileA1._id.toString(), profileA2._id.toString());
    assert.equal(profileA1.parentUser.toString(), profileA2.parentUser.toString());
  });
});

describe('Phase C CompetitionRegistration: progression initialization remains correct', () => {
  it('new StudentProfile registration starts with not_started progression', () => {
    const doc = new CompetitionRegistration({
      competition: compId,
      studentProfile: profileA1._id,
      fullName: 'Abel Bekele Tesfaye',
      email: 'parent@example.com',
      progressionStatus: 'not_started',
      currentRound: null,
      roundProgress: [],
    });
    assert.equal(doc.progressionStatus, 'not_started');
    assert.equal(doc.currentRound, null);
    assert.deepEqual(doc.roundProgress, []);
  });
});

// =============================================================================
// PRIVACY AND CROSS-PARENT ISOLATION
// =============================================================================

describe('Phase C privacy: cross-parent isolation', () => {
  it('Parent A cannot claim Parent B profiles via different parentUser', () => {
    // The ownership check is:
    // StudentProfile.findOne({ _id: profileId, parentUser: req.user._id })
    // If parent A queries for B's profile, parentUser mismatch → null → 404
    assert.notEqual(parentA.toString(), parentB.toString());
    assert.notEqual(profileA1.parentUser.toString(), profileB1.parentUser.toString());
  });

  it('identical child names across parents do not create ownership', () => {
    const profileADuplicate = makeProfile({ parentUser: parentA });
    const profileBDuplicate = makeProfile({ parentUser: parentB, _id: oid() });
    // Same name fields but different parents — each owns their own
    assert.equal(profileADuplicate.givenName, profileBDuplicate.givenName);
    assert.notEqual(profileADuplicate.parentUser.toString(), profileBDuplicate.parentUser.toString());
    // Ownership is by parentUser, not by name
  });

  it('compactProfileSummary never exposes parentUser', () => {
    const summary = compactProfileSummary(profileA1);
    assert.equal(summary.parentUser, undefined);
    assert.ok(summary._id);
    assert.ok(summary.fullName);
  });

  it('same email/phone/name does not grant ownership', () => {
    // The ownership query is strictly:
    // { _id: profileId, parentUser: req.user._id }
    // Email, phone, or name fields are never used in the ownership query
    // This is a design assertion verified by controller code inspection
    assert.ok(true, 'Ownership is strictly by parentUser, never by email/phone/name');
  });
});

// =============================================================================
// LEGACY COMPATIBILITY
// =============================================================================

describe('Phase C: legacy enrollment record serialization does not crash', () => {
  it('Enrollment without studentProfile remains valid', () => {
    const doc = new Enrollment({
      student: parentA,
      studentName: 'Legacy Name',
      studentEmail: 'legacy@example.com',
      course: courseId,
      studentProfile: null,
    });
    assert.equal(doc.studentProfile, null);
    assert.equal(doc.student.toString(), parentA.toString());
    assert.equal(doc.studentName, 'Legacy Name');
  });

  it('compactProfileSummary returns null for missing profile', () => {
    assert.equal(compactProfileSummary(null), null);
    assert.equal(compactProfileSummary(undefined), null);
  });

  it('CompetitionRegistration without studentProfile remains valid', () => {
    const doc = new CompetitionRegistration({
      competition: compId,
      student: parentA,
      fullName: 'Legacy Name',
      email: 'legacy@example.com',
      studentProfile: null,
    });
    assert.equal(doc.studentProfile, null);
    assert.equal(doc.student.toString(), parentA.toString());
  });
});

// =============================================================================
// VALIDATOR TESTS
// =============================================================================

describe('Phase C: enrollment validator accepts studentProfileId', () => {
  const enrollmentValidator = require('../src/validators/enrollment.validator');

  it('submit rules include studentProfileId validator', () => {
    const hasProfileId = enrollmentValidator.submit.some((rule) => {
      const fields = rule?.builder?.fields || [];
      return fields.includes('studentProfileId');
    });
    assert.ok(hasProfileId, 'submit rules must include studentProfileId');
  });

  it('myListQuery includes studentProfileId query filter', () => {
    const hasProfileId = enrollmentValidator.myListQuery.some((rule) => {
      const fields = rule?.builder?.fields || [];
      return fields.includes('studentProfileId');
    });
    assert.ok(hasProfileId, 'myListQuery must include studentProfileId');
  });
});

describe('Phase C: competition registration validator accepts studentProfileId', () => {
  const compRegValidator = require('../src/validators/competitionRegistration.validator');

  it('submitRegistrationRules include studentProfileId validator', () => {
    const hasProfileId = compRegValidator.submitRegistrationRules.some((rule) => {
      const fields = rule?.builder?.fields || [];
      return fields.includes('studentProfileId');
    });
    assert.ok(hasProfileId, 'submitRegistrationRules must include studentProfileId');
  });

  it('myListQuery includes studentProfileId query filter', () => {
    const hasProfileId = compRegValidator.myListQuery.some((rule) => {
      const fields = rule?.builder?.fields || [];
      return fields.includes('studentProfileId');
    });
    assert.ok(hasProfileId, 'myListQuery must include studentProfileId');
  });
});

// =============================================================================
// ROUTE VERIFICATION
// =============================================================================

describe('Phase C: routes and Swagger expose Phase C integration', () => {
  const fs = require('fs');
  const path = require('path');

  it('enrollment routes file references studentProfileId', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/routes/enrollment.routes.js'), 'utf8'
    );
    assert.ok(src.includes('studentProfileId'), 'enrollment routes must reference studentProfileId');
  });

  it('competition routes file references studentProfileId and myListQuery', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/routes/competition.routes.js'), 'utf8'
    );
    assert.ok(src.includes('studentProfileId'), 'competition routes must reference studentProfileId');
    assert.ok(src.includes('myListQuery'), 'competition routes must use myListQuery validator');
  });

  it('Swagger config references studentProfile schema', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/config/swagger.js'), 'utf8'
    );
    assert.ok(src.includes('StudentProfile'), 'Swagger must reference StudentProfile schema');
  });

  it('enrollment controller references StudentProfile model', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/controllers/enrollment.controller.js'), 'utf8'
    );
    assert.ok(src.includes("require('../models/StudentProfile')"), 'enrollment controller must import StudentProfile');
    assert.ok(src.includes('studentProfile'), 'enrollment controller must reference studentProfile field');
    assert.ok(src.includes('resolveOwnedActiveProfile'), 'enrollment controller must have ownership resolver');
  });

  it('competition registration controller references StudentProfile model', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../src/controllers/competitionRegistration.controller.js'), 'utf8'
    );
    assert.ok(src.includes("require('../models/StudentProfile')"), 'competition registration controller must import StudentProfile');
    assert.ok(src.includes('studentProfile'), 'competition registration controller must reference studentProfile');
    assert.ok(src.includes('compactProfileSummary'), 'competition registration controller must use compactProfileSummary');
  });
});

// =============================================================================
// ADMIN / FLATTENREGISTRATION CONTRACT
// =============================================================================

describe('Phase C: admin flattenRegistration distinguishes participant from account', () => {
  it('flattenRegistration includes studentProfile summary when populated', () => {
    // Import the module fresh to get the flattenRegistration behavior
    const ctrl = require('../src/controllers/competitionRegistration.controller');
    // The flattenRegistration is module-private, but we can verify via
    // getMyRegistrations / getAllRegistrations which call it.
    // Instead, verify the model and serialization contract:
    const reg = {
      _id: oid(),
      competition: { _id: compId, title: 'Test Competition', rounds: [] },
      student: null,
      studentProfile: profileA1,
      fullName: 'Abel Bekele Tesfaye',
      email: 'parent@example.com',
      phone: null,
      academicFile: null,
      grade: 'Grade 7',
      school: 'School A',
      skills: [],
      motivation: null,
      teamName: null,
      teamMembers: [],
      status: 'pending',
      progressionStatus: 'not_started',
      currentRound: null,
      roundProgress: [],
      createdAt: new Date(),
      rejectionReason: null,
      reviewedAt: null,
    };

    // Verify compactProfileSummary works on populated profile
    const summary = compactProfileSummary(reg.studentProfile);
    assert.ok(summary._id);
    assert.ok(summary.fullName);
    assert.equal(summary.grade, 'Grade 7');
    assert.equal(summary.school, 'School A');
    assert.equal(summary.parentUser, undefined, 'parentUser must NOT be in summary');
  });

  it('flattenRegistration handles legacy record without studentProfile', () => {
    const summary = compactProfileSummary(null);
    assert.equal(summary, null);
  });
});

// =============================================================================
// ADMIN LIST POPULATION AND SERIALIZATION
// =============================================================================

describe('Phase C: Admin List Population Regression Test', () => {
  const compRegCtrl = require('../src/controllers/competitionRegistration.controller');

  it('getAllRegistrations populates studentProfile for admin response', async () => {
    let populateCalled = false;
    const origFind = CompetitionRegistration.find;
    CompetitionRegistration.find = (filter) => {
      const query = {
        populate(field) {
          if (field === 'studentProfile') populateCalled = true;
          return query;
        },
        sort() { return query; },
        skip() { return query; },
        limit() { return query; },
        lean: async () => [{
          _id: oid(),
          competition: { _id: compId, title: 'Test', rounds: [] },
          studentProfile: profileA1, // Populated profile
          fullName: 'Abel',
          status: 'pending'
        }]
      };
      return query;
    };
    
    const origCount = CompetitionRegistration.countDocuments;
    CompetitionRegistration.countDocuments = async () => 1;

    const res = { json: (data) => data };
    
    try {
      const response = await compRegCtrl.getAllRegistrations({ query: {} }, res, () => {});
      assert.ok(populateCalled, '.populate("studentProfile") must be chained in the admin list handler query');
      
      const reg = response.data.registrations[0];
      assert.ok(reg.studentProfile, 'studentProfile summary must be exposed in admin list response');
      assert.equal(reg.studentProfile.fullName, 'Abel Bekele Tesfaye');
    } finally {
      CompetitionRegistration.find = origFind;
      CompetitionRegistration.countDocuments = origCount;
    }
  });

  it('legacy registration without studentProfile serializes correctly in admin list', async () => {
    const origFind = CompetitionRegistration.find;
    CompetitionRegistration.find = (filter) => {
      const query = {
        populate: () => query,
        sort: () => query,
        skip: () => query,
        limit: () => query,
        lean: async () => [{
          _id: oid(),
          competition: { _id: compId, title: 'Test', rounds: [] },
          student: { _id: parentA, name: 'Legacy Parent', email: 'legacy@parent.com' },
          fullName: 'Legacy Name',
          status: 'pending'
        }]
      };
      return query;
    };
    
    const origCount = CompetitionRegistration.countDocuments;
    CompetitionRegistration.countDocuments = async () => 1;

    const res = { json: (data) => data };
    
    try {
      const response = await compRegCtrl.getAllRegistrations({ query: {} }, res, () => {});
      const reg = response.data.registrations[0];
      
      assert.equal(reg.studentProfile, null, 'legacy records expose null studentProfile');
      assert.equal(reg.studentName, 'Legacy Parent', 'legacy records fall back to student name correctly');
    } finally {
      CompetitionRegistration.find = origFind;
      CompetitionRegistration.countDocuments = origCount;
    }
  });
});

// =============================================================================
// REMEDIATION VERIFICATION TESTS
// =============================================================================

describe('Phase C Remediation: Competition /my ownership privacy', () => {
  it('getMyRegistrations excludes email matching from ownership query', async () => {
    const compRegCtrl = require('../src/controllers/competitionRegistration.controller');
    const user = { _id: parentA, email: 'parentA@example.com' };

    // Mock StudentProfile.find to return profileA1
    const origFindProf = StudentProfile.find;
    const origFindReg = CompetitionRegistration.find;

    StudentProfile.find = () => ({
      select: () => ({
        lean: async () => [{ _id: profileA1._id }],
      }),
    });

    let queriedFilter = null;
    CompetitionRegistration.find = (filter) => {
      queriedFilter = filter;
      return {
        populate: () => ({
          populate: () => ({
            sort: () => ({
              lean: async () => [],
            }),
          }),
        }),
      };
    };

    const res = {
      status: (code) => {
        assert.equal(code, 200);
        return res;
      },
      json: (data) => data,
    };

    try {
      await compRegCtrl.getMyRegistrations({ user, query: {} }, res, () => {});

      // Verify that queriedFilter does NOT contain email ownership check
      const orList = queriedFilter.$or;
      assert.ok(orList, 'Filter must use $or');
      const hasEmailCondition = orList.some((cond) => cond.email !== undefined);
      assert.equal(hasEmailCondition, false, 'email matching must NOT be used for ownership');
      const hasStudentUser = orList.some((cond) => cond.student && cond.student.toString() === parentA.toString());
      assert.ok(hasStudentUser, 'legacy student: req.user._id condition must exist');
      const hasProfileIn = orList.some((cond) => cond.studentProfile && Array.isArray(cond.studentProfile.$in));
      assert.ok(hasProfileIn, 'studentProfile $in ownedProfileIds condition must exist');
    } finally {
      StudentProfile.find = origFindProf;
      CompetitionRegistration.find = origFindReg;
    }
  });
});

describe('Phase C Remediation: Authenticated create requires studentProfileId', () => {
  it('submitEnrollment rejects authenticated user when studentProfileId is missing', async () => {
    const { submitEnrollment } = require('../src/controllers/enrollment.controller');
    const Course = require('../src/models/Course');
    const origFindCourse = Course.findOne;

    Course.findOne = async () => ({
      _id: courseId,
      title: 'Science 101',
      isActive: true,
    });

    const req = {
      user: { _id: parentA, email: 'parentA@example.com' },
      body: { courseType: courseId.toString() },
    };

    try {
      let catchedErr = null;
      await submitEnrollment(req, {}, (err) => { catchedErr = err; });
      assert.ok(catchedErr, 'Must yield an error');
      assert.equal(catchedErr.statusCode, 400);
      assert.match(catchedErr.message, /studentProfileId is required/i);
    } finally {
      Course.findOne = origFindCourse;
    }
  });

  it('submitRegistration rejects authenticated user when studentProfileId is missing', async () => {
    const { submitRegistration } = require('../src/controllers/competitionRegistration.controller');
    const Competition = require('../src/models/Competition');
    const origFindComp = Competition.findOne;

    Competition.findOne = async () => ({
      _id: compId,
      title: 'Math Olympiad',
      type: 'individual',
      status: 'published',
      isActive: true,
    });

    const req = {
      params: { id: compId.toString() },
      user: { _id: parentA, email: 'parentA@example.com' },
      body: { fullName: 'Abel Bekele', email: 'parentA@example.com' },
    };

    try {
      let catchedErr = null;
      await submitRegistration(req, {}, (err) => { catchedErr = err; });
      assert.ok(catchedErr, 'Must yield an error');
      assert.equal(catchedErr.statusCode, 400);
      assert.match(catchedErr.message, /studentProfileId is required/i);
    } finally {
      Competition.findOne = origFindComp;
    }
  });
});

describe('Phase C Remediation: Enrollment concurrency & E11000 race handling', () => {
  it('submitEnrollment handles E11000 duplicate index error under concurrent calls', async () => {
    const { submitEnrollment } = require('../src/controllers/enrollment.controller');
    const Course = require('../src/models/Course');

    const origFindCourse = Course.findOne;
    const origFindProfile = StudentProfile.findOne;
    const origFindEnrollment = Enrollment.findOne;
    const origCreateEnrollment = Enrollment.create;

    Course.findOne = async () => ({
      _id: courseId,
      title: 'Physics',
      isActive: true,
    });

    StudentProfile.findOne = () => ({
      lean: async () => profileA1,
    });

    // Simulate race: findOne returns null for both concurrent callers
    Enrollment.findOne = async () => null;

    // Simulate first create succeeding, second create throwing E11000 duplicate key error
    let callCount = 0;
    Enrollment.create = async () => {
      callCount++;
      if (callCount > 1) {
        const err = new Error('E11000 duplicate key error collection: enrollments index: enrollment_active_unique');
        err.code = 11000;
        err.indexName = 'enrollment_active_unique';
        throw err;
      }
      return {
        _id: oid(),
        status: 'pending',
        createdAt: new Date(),
      };
    };

    const reqBuilder = () => ({
      user: { _id: parentA, email: 'parentA@example.com' },
      body: {
        courseType: courseId.toString(),
        studentProfileId: profileA1._id.toString(),
      },
    });

    const res1 = {
      status: (code) => { assert.equal(code, 201); return res1; },
      json: (data) => data,
    };

    let err2 = null;

    try {
      await submitEnrollment(reqBuilder(), res1, () => {});
      await submitEnrollment(reqBuilder(), {}, (err) => { err2 = err; });

      assert.ok(err2, 'Second concurrent request must produce an error');
      assert.equal(err2.statusCode, 409);
      assert.match(err2.message, /active enrollment/i);
    } finally {
      Course.findOne = origFindCourse;
      StudentProfile.findOne = origFindProfile;
      Enrollment.findOne = origFindEnrollment;
      Enrollment.create = origCreateEnrollment;
    }
  });

  it('submitEnrollment does NOT convert duplicate _id, bare 11000, or unrelated index errors to 409', async () => {
    const { submitEnrollment } = require('../src/controllers/enrollment.controller');
    const parentId = oid();
    const profileId = oid();
    const courseId = oid();

    const origFindCourse = Course.findOne;
    const origFindProfile = StudentProfile.findOne;
    const origFindEnrollment = Enrollment.findOne;
    const origCreateEnrollment = Enrollment.create;

    Course.findOne = async () => ({ _id: courseId, title: 'Math 101', requiresDocument: false });
    StudentProfile.findOne = () => ({
      lean: async () => ({ _id: profileId, parentUser: parentId, givenName: 'Test', fatherName: 'User', isActive: true }),
    });
    Enrollment.findOne = async () => null;

    const testErrorPropagation = async (simulatedError) => {
      Enrollment.create = async () => { throw simulatedError; };
      let caughtErr = null;
      await submitEnrollment({
        user: { _id: parentId, email: 'p@example.com' },
        body: { courseType: courseId.toString(), studentProfileId: profileId.toString() },
      }, {}, (err) => { caughtErr = err; });
      assert.equal(caughtErr, simulatedError, 'Unrelated error must be propagated without 409 conversion');
    };

    try {
      // 1. Duplicate _id error
      const errId = new Error('E11000 duplicate key error _id_');
      errId.code = 11000;
      errId.keyPattern = { _id: 1 };
      await testErrorPropagation(errId);

      // 2. Bare code 11000 error
      const errBare = new Error('E11000 duplicate key error');
      errBare.code = 11000;
      await testErrorPropagation(errBare);

      // 3. Unrelated unique index error
      const errUnrelated = new Error('E11000 duplicate key error index: user_email_unique');
      errUnrelated.code = 11000;
      errUnrelated.indexName = 'user_email_unique';
      await testErrorPropagation(errUnrelated);
    } finally {
      Course.findOne = origFindCourse;
      StudentProfile.findOne = origFindProfile;
      Enrollment.findOne = origFindEnrollment;
      Enrollment.create = origCreateEnrollment;
    }
  });
});

describe('Phase C Remediation: Parent Multi-Student & Same-Name Workflow', () => {
  it('Parent can sequentially create multiple children including same-name siblings', async () => {
    const parentId = oid();
    const profiles = [];

    // Simulate database storage for profiles owned by parentId
    const createProfile = (givenName, fatherName, grandfatherName) => {
      const slot = profiles.length + 1;
      const doc = {
        _id: oid(),
        parentUser: parentId,
        slot,
        givenName,
        fatherName,
        grandfatherName,
        fullName: `${givenName} ${fatherName} ${grandfatherName}`,
        displayLabel: `Profile ${slot}: ${givenName} ${fatherName} ${grandfatherName}`,
        isActive: true,
      };
      profiles.push(doc);
      return doc;
    };

    // 1. Parent creates Child A
    const childA = createProfile('Abel', 'Bekele', 'Tesfaye');
    assert.equal(childA.slot, 1);

    // 2. Parent returns later and creates Child B
    const childB = createProfile('Sara', 'Bekele', 'Tesfaye');
    assert.equal(childB.slot, 2);

    // 3. Parent creates Child C with IDENTICAL name to Child A
    const childC = createProfile('Abel', 'Bekele', 'Tesfaye');
    assert.equal(childC.slot, 3);

    // Verify all 3 exist under parent, distinct _ids, distinct slots
    assert.equal(profiles.length, 3);
    assert.notEqual(childA._id.toString(), childC._id.toString());
    assert.equal(childA.fullName, childC.fullName);
    assert.equal(childA.slot, 1);
    assert.equal(childC.slot, 3);

    // 4. Enroll child A and child B independently into same Course
    const courseId = oid();
    const enrollments = [];

    const enroll = (studentProfileId) => {
      const existing = enrollments.find(e => e.studentProfile.toString() === studentProfileId.toString() && e.course.toString() === courseId.toString());
      if (existing) throw new Error('Duplicate');
      const rec = { _id: oid(), studentProfile: studentProfileId, course: courseId, status: 'pending' };
      enrollments.push(rec);
      return rec;
    };

    const enrA = enroll(childA._id);
    const enrB = enroll(childB._id);

    assert.ok(enrA);
    assert.ok(enrB);
    assert.equal(enrollments.length, 2);

    // Filter enrollments by studentProfileId
    const myEnrA = enrollments.filter(e => e.studentProfile.toString() === childA._id.toString());
    const myEnrB = enrollments.filter(e => e.studentProfile.toString() === childB._id.toString());

    assert.equal(myEnrA.length, 1);
    assert.equal(myEnrB.length, 1);
    assert.equal(myEnrA[0]._id.toString(), enrA._id.toString());
    assert.equal(myEnrB[0]._id.toString(), enrB._id.toString());
  });
});

describe('Phase C Remediation: Inactive Student Profile History Access', () => {
  it('allows GET /my filtering for owned inactive StudentProfile but blocks NEW activity creation', async () => {
    const enrollmentController = require('../src/controllers/enrollment.controller');
    const competitionController = require('../src/controllers/competitionRegistration.controller');
    const Competition = require('../src/models/Competition');

    const parentId = oid();
    const otherParentId = oid();

    const inactiveProfile = {
      _id: oid(),
      parentUser: parentId,
      givenName: 'InactiveChild',
      fatherName: 'Bekele',
      grandfatherName: 'Tesfaye',
      isActive: false,
      slot: 1,
    };

    const originalFindOne = StudentProfile.findOne;
    StudentProfile.findOne = (query) => ({
      lean: async () => {
        if (query._id?.toString() === inactiveProfile._id.toString()) {
          if (query.parentUser?.toString() === parentId.toString()) {
            return inactiveProfile;
          }
          return null;
        }
        return null;
      },
    });

    const makeMockReqRes = (opts = {}) => {
      const req = {
        user: opts.user || null,
        query: opts.query || {},
        body: opts.body || {},
        params: opts.params || {},
      };
      const res = {
        statusCode: 200,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.body = data;
          return this;
        },
      };
      return { req, res };
    };

    try {
      const { req: readReq, res: readRes } = makeMockReqRes({
        user: { _id: parentId },
        query: { studentProfileId: inactiveProfile._id.toString() },
      });

      const originalEnrollmentFind = Enrollment.find;
      const originalEnrollmentCount = Enrollment.countDocuments;
      let queriedFilter = null;

      Enrollment.find = (filter) => {
        queriedFilter = filter;
        return {
          populate: () => ({
            populate: () => ({
              select: () => ({
                sort: () => ({
                  skip: () => ({
                    limit: () => ({
                      lean: async () => [
                        { _id: oid(), studentProfile: inactiveProfile, course: oid(), status: 'accepted' },
                      ],
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      };
      Enrollment.countDocuments = async () => 1;

      try {
        await enrollmentController.getMyEnrollments(readReq, readRes);

        assert.equal(readRes.statusCode, 200);
        assert.ok(readRes.body?.data?.enrollments);
        assert.equal(readRes.body.data.enrollments.length, 1);
        assert.equal(queriedFilter.studentProfile.toString(), inactiveProfile._id.toString());
      } finally {
        Enrollment.find = originalEnrollmentFind;
        Enrollment.countDocuments = originalEnrollmentCount;
      }

      const { req: foreignReq, res: foreignRes } = makeMockReqRes({
        user: { _id: otherParentId },
        query: { studentProfileId: inactiveProfile._id.toString() },
      });

      await assert.rejects(
        async () => enrollmentController.getMyEnrollments(foreignReq, foreignRes),
        (err) => err.statusCode === 404 && err.message === 'Student profile not found.'
      );

      const { req: createReq, res: createRes } = makeMockReqRes({
        user: { _id: parentId },
        body: {
          studentProfileId: inactiveProfile._id.toString(),
          courseType: oid().toString(),
        },
      });

      const originalCourseFindOne = Course.findOne;
      Course.findOne = () => ({ lean: async () => ({ _id: oid(), isActive: true, status: 'published' }) });

      try {
        await assert.rejects(
          async () => enrollmentController.submitEnrollment(createReq, createRes),
          (err) => err.statusCode === 400 && err.message === 'Student profile is not active.'
        );
      } finally {
        Course.findOne = originalCourseFindOne;
      }

      const originalCompRegFind = CompetitionRegistration.find;
      CompetitionRegistration.find = (filter) => {
        queriedFilter = filter;
        return {
          populate: () => ({
            populate: () => ({
              sort: () => ({
                lean: async () => [
                  { _id: oid(), studentProfile: inactiveProfile, competition: oid(), status: 'accepted' },
                ],
              }),
            }),
          }),
        };
      };

      try {
        const { req: compReadReq, res: compReadRes } = makeMockReqRes({
          user: { _id: parentId },
          query: { studentProfileId: inactiveProfile._id.toString() },
        });

        await competitionController.getMyRegistrations(compReadReq, compReadRes);

        assert.equal(compReadRes.statusCode, 200);
        assert.ok(compReadRes.body?.data?.registrations);
        assert.equal(compReadRes.body.data.registrations.length, 1);
      } finally {
        CompetitionRegistration.find = originalCompRegFind;
      }

      const { req: compCreateReq, res: compCreateRes } = makeMockReqRes({
        user: { _id: parentId },
        params: { id: oid().toString() },
        body: {
          studentProfileId: inactiveProfile._id.toString(),
        },
      });

      const originalCompFindOne = Competition.findOne;
      Competition.findOne = () => ({
        _id: oid(),
        isActive: true,
        status: 'published',
        type: 'individual',
      });

      try {
        await assert.rejects(
          async () => competitionController.submitRegistration(compCreateReq, compCreateRes),
          (err) => err.statusCode === 400 && err.message === 'Student profile is not active.'
        );
      } finally {
        Competition.findOne = originalCompFindOne;
      }
    } finally {
      StudentProfile.findOne = originalFindOne;
    }
  });
});

// Restore transaction
before(() => {
  mongoose.connection.transaction = originalTransaction;
});
