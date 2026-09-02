require('dotenv').config();

// Ensure test env variables are set if not loaded from .env
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';

const { describe, it, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Certificate = require('../src/models/Certificate');
const StudentProfile = require('../src/models/StudentProfile');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Competition = require('../src/models/Competition');
const Notification = require('../src/models/Notification');

const certificateController = require('../src/controllers/certificate.controller');
const notificationService = require('../src/services/notification.service');
const { ROLES } = require('../src/constants');
const { fullNameFor } = require('../src/utils/studentProfile');

// ── Helper to create ObjectIds ────────────────────────────────────────────────
const oid = () => new mongoose.Types.ObjectId();

// ── Mock Req/Res Helper ───────────────────────────────────────────────────────
function createMockReqRes({ user = null, params = {}, query = {}, body = {} } = {}) {
  const req = {
    user,
    params,
    query,
    body,
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get data() {
      return responseData;
    },
  };

  return { req, res };
}

describe('Phase D — Certificate Ownership & StudentProfile Integration', () => {
  const parentA = oid();
  const parentB = oid();
  const adminId = oid();
  const courseId = oid();
  const compId = oid();

  const profileA1 = {
    _id: oid(),
    parentUser: parentA,
    givenName: 'Abel',
    fatherName: 'Bekele',
    grandfatherName: 'Tesfaye',
    grade: 'Grade 7',
    school: 'School A',
    slot: 1,
    profileNumber: 1,
    isActive: true,
  };

  const profileA2 = {
    _id: oid(),
    parentUser: parentA,
    givenName: 'Abel',
    fatherName: 'Bekele',
    grandfatherName: 'Tesfaye',
    grade: 'Grade 5',
    school: 'School B',
    slot: 2,
    profileNumber: 2,
    isActive: true,
  };

  const profileInactive = {
    _id: oid(),
    parentUser: parentA,
    givenName: 'Bethlehem',
    fatherName: 'Bekele',
    grandfatherName: 'Tesfaye',
    grade: 'Grade 9',
    school: 'School C',
    slot: 3,
    profileNumber: 3,
    isActive: false,
  };

  const profileB1 = {
    _id: oid(),
    parentUser: parentB,
    givenName: 'Daniel',
    fatherName: 'Girma',
    grandfatherName: 'Kassahun',
    grade: 'Grade 6',
    school: 'Foreign School',
    slot: 1,
    profileNumber: 1,
    isActive: true,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. MODEL DECLARATIONS & CONSTRAINTS
  // ──────────────────────────────────────────────────────────────────────────
  describe('Model Declarations & Schema Audit', () => {
    it('1. studentProfile field exists on Certificate schema referencing StudentProfile', () => {
      const path = Certificate.schema.paths.studentProfile;
      assert.ok(path, 'studentProfile field must exist on Certificate schema');
      assert.equal(path.options.ref, 'StudentProfile');
      assert.equal(path.options.default, null);
    });

    it('2. legacy student field remains on Certificate schema referencing User as optional', () => {
      const path = Certificate.schema.paths.student;
      assert.ok(path, 'legacy student field must exist on Certificate schema');
      assert.equal(path.options.ref, 'User');
      assert.equal(path.options.default, null);
      assert.notEqual(path.options.required, true, 'legacy student must not be required');
    });

    it('3. recipientNameSnapshot field exists on Certificate schema', () => {
      const path = Certificate.schema.paths.recipientNameSnapshot;
      assert.ok(path, 'recipientNameSnapshot field must exist on Certificate schema');
      assert.equal(path.options.type, String);
      assert.equal(path.options.default, null);
    });

    it('4. certificateNumber uniqueness declaration preserved', () => {
      const path = Certificate.schema.paths.certificateNumber;
      assert.ok(path, 'certificateNumber field must exist');
      assert.equal(path.options.unique, true, 'certificateNumber must be unique');
    });

    it('5. no compound unique index introduced on Certificate schema', () => {
      const indexes = Certificate.schema.indexes();
      const uniqueCompoundIndexes = indexes.filter(
        ([fields, options]) => options && options.unique && Object.keys(fields).length > 1
      );
      assert.equal(
        uniqueCompoundIndexes.length,
        0,
        'No compound unique indexes should be defined on schema level in Phase D'
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. ADMIN ISSUANCE (POST /api/admin/certificates)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Admin Issuance (POST /api/admin/certificates)', () => {
    it('6-7. rejects invalid studentProfileId (422)', async () => {
      const { req, res } = createMockReqRes({
        user: { _id: adminId, role: ROLES.ADMIN },
        body: {
          studentProfileId: 'invalid-objectid',
          type: 'course_completion',
          title: 'Python Mastery',
          courseId: courseId.toString(),
        },
      });

      await assert.rejects(
        () => certificateController.issueCertificate(req, res),
        (err) => err.statusCode === 422 && /invalid/i.test(err.message)
      );
    });

    it('8. rejects non-existent studentProfileId (404)', async () => {
      const origFindById = StudentProfile.findById;
      StudentProfile.findById = mock.fn(async () => null);

      try {
        const { req, res } = createMockReqRes({
          user: { _id: adminId, role: ROLES.ADMIN },
          body: {
            studentProfileId: oid().toString(),
            type: 'course_completion',
            title: 'Python Mastery',
            courseId: courseId.toString(),
          },
        });

        await assert.rejects(
          () => certificateController.issueCertificate(req, res),
          (err) => err.statusCode === 404 && /student profile not found/i.test(err.message)
        );
      } finally {
        StudentProfile.findById = origFindById;
      }
    });

    it('9, 11-16. issues certificate for active profile, snapshot derived server-side, parent notified, spoofed name ignored', async () => {
      const origProfileFind = StudentProfile.findById;
      const origCourseFind = Course.findById;
      const origCertFindOne = Certificate.findOne;
      const origCertExists = Certificate.exists;
      const origCertCreate = Certificate.create;
      const origCreateNotif = notificationService.createNotification;

      StudentProfile.findById = mock.fn(async () => profileA1);
      Course.findById = mock.fn(async () => ({ _id: courseId, title: 'Python Course' }));
      Certificate.findOne = mock.fn(async () => null);
      Certificate.exists = mock.fn(async () => false);

      let createdCertData = null;
      Certificate.create = mock.fn(async (data) => {
        createdCertData = data;
        return {
          _id: oid(),
          issueDate: new Date(),
          ...data,
        };
      });

      let notifData = null;
      notificationService.createNotification = mock.fn(async (data) => {
        notifData = data;
      });

      try {
        const { req, res } = createMockReqRes({
          user: { _id: adminId, role: ROLES.ADMIN },
          body: {
            studentProfileId: profileA1._id.toString(),
            type: 'course_completion',
            title: 'Python Essentials Certificate',
            courseId: courseId.toString(),
            recipientNameSnapshot: 'SPOOFED NAME THAT SHOULD BE IGNORED',
          },
        });

        await certificateController.issueCertificate(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.data.success, true);
        assert.equal(res.data.data.studentName, fullNameFor(profileA1));
        assert.equal(createdCertData.studentProfile, profileA1._id.toString());
        assert.equal(createdCertData.student, null);
        assert.equal(createdCertData.recipientNameSnapshot, fullNameFor(profileA1));
        assert.equal(createdCertData.issuedBy.toString(), adminId.toString());

        // Verify parent user received notification
        assert.ok(notifData, 'Notification should be generated');
        assert.equal(notifData.recipient.toString(), parentA.toString());
        assert.ok(notifData.message.includes(fullNameFor(profileA1)));
      } finally {
        StudentProfile.findById = origProfileFind;
        Course.findById = origCourseFind;
        Certificate.findOne = origCertFindOne;
        Certificate.exists = origCertExists;
        Certificate.create = origCertCreate;
        notificationService.createNotification = origCreateNotif;
      }
    });

    it('10. allows issuing certificate to an INACTIVE profile (historical completion permitted)', async () => {
      const origProfileFind = StudentProfile.findById;
      const origCourseFind = Course.findById;
      const origCertFindOne = Certificate.findOne;
      const origCertExists = Certificate.exists;
      const origCertCreate = Certificate.create;
      const origCreateNotif = notificationService.createNotification;

      StudentProfile.findById = mock.fn(async () => profileInactive);
      Course.findById = mock.fn(async () => ({ _id: courseId, title: 'Python Course' }));
      Certificate.findOne = mock.fn(async () => null);
      Certificate.exists = mock.fn(async () => false);
      Certificate.create = mock.fn(async (data) => ({
        _id: oid(),
        issueDate: new Date(),
        ...data,
      }));
      notificationService.createNotification = mock.fn(async () => {});

      try {
        const { req, res } = createMockReqRes({
          user: { _id: adminId, role: ROLES.ADMIN },
          body: {
            studentProfileId: profileInactive._id.toString(),
            type: 'course_completion',
            title: 'Historical Python Certificate',
            courseId: courseId.toString(),
          },
        });

        await certificateController.issueCertificate(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.data.data.studentName, fullNameFor(profileInactive));
      } finally {
        StudentProfile.findById = origProfileFind;
        Course.findById = origCourseFind;
        Certificate.findOne = origCertFindOne;
        Certificate.exists = origCertExists;
        Certificate.create = origCertCreate;
        notificationService.createNotification = origCreateNotif;
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. DUPLICATE BEHAVIOR
  // ──────────────────────────────────────────────────────────────────────────
  describe('Duplicate Prevention Rules', () => {
    it('17. allowDuplicate=false rejects issuance if matching valid certificate exists for studentProfile', async () => {
      const origProfileFind = StudentProfile.findById;
      const origCourseFind = Course.findById;
      const origCertFindOne = Certificate.findOne;

      StudentProfile.findById = mock.fn(async () => profileA1);
      Course.findById = mock.fn(async () => ({ _id: courseId }));
      Certificate.findOne = mock.fn(async () => ({ _id: oid(), status: 'valid' }));

      try {
        const { req, res } = createMockReqRes({
          user: { _id: adminId, role: ROLES.ADMIN },
          body: {
            studentProfileId: profileA1._id.toString(),
            type: 'course_completion',
            title: 'Python Essentials',
            courseId: courseId.toString(),
            allowDuplicate: false,
          },
        });

        await assert.rejects(
          () => certificateController.issueCertificate(req, res),
          (err) => err.statusCode === 409 && /already been issued/i.test(err.message)
        );
      } finally {
        StudentProfile.findById = origProfileFind;
        Course.findById = origCourseFind;
        Certificate.findOne = origCertFindOne;
      }
    });

    it('18-19. same-name sibling does NOT conflict (different studentProfileId)', async () => {
      const origProfileFind = StudentProfile.findById;
      const origCourseFind = Course.findById;
      const origCertFindOne = Certificate.findOne;
      const origCertExists = Certificate.exists;
      const origCertCreate = Certificate.create;
      const origCreateNotif = notificationService.createNotification;

      StudentProfile.findById = mock.fn(async (id) => {
        if (id === profileA2._id.toString()) return profileA2;
        return profileA1;
      });
      Course.findById = mock.fn(async () => ({ _id: courseId }));
      // Certificate.findOne checks matching filter { studentProfile: studentProfileId, ... }
      Certificate.findOne = mock.fn(async (filter) => {
        // If checking for profileA2, return null (no duplicate for profileA2)
        if (filter.studentProfile === profileA2._id.toString()) return null;
        return { _id: oid() };
      });
      Certificate.exists = mock.fn(async () => false);
      Certificate.create = mock.fn(async (data) => ({ _id: oid(), issueDate: new Date(), ...data }));
      notificationService.createNotification = mock.fn(async () => {});

      try {
        const { req, res } = createMockReqRes({
          user: { _id: adminId, role: ROLES.ADMIN },
          body: {
            studentProfileId: profileA2._id.toString(),
            type: 'course_completion',
            title: 'Python Essentials',
            courseId: courseId.toString(),
            allowDuplicate: false,
          },
        });

        await certificateController.issueCertificate(req, res);
        assert.equal(res.statusCode, 201);
      } finally {
        StudentProfile.findById = origProfileFind;
        Course.findById = origCourseFind;
        Certificate.findOne = origCertFindOne;
        Certificate.exists = origCertExists;
        Certificate.create = origCertCreate;
        notificationService.createNotification = origCreateNotif;
      }
    });

    it('20. allowDuplicate=true bypasses duplicate check', async () => {
      const origProfileFind = StudentProfile.findById;
      const origCourseFind = Course.findById;
      const origCertFindOne = Certificate.findOne;
      const origCertExists = Certificate.exists;
      const origCertCreate = Certificate.create;
      const origCreateNotif = notificationService.createNotification;

      StudentProfile.findById = mock.fn(async () => profileA1);
      Course.findById = mock.fn(async () => ({ _id: courseId }));
      Certificate.findOne = mock.fn(async () => ({ _id: oid() })); // existing exists
      Certificate.exists = mock.fn(async () => false);
      Certificate.create = mock.fn(async (data) => ({ _id: oid(), issueDate: new Date(), ...data }));
      notificationService.createNotification = mock.fn(async () => {});

      try {
        const { req, res } = createMockReqRes({
          user: { _id: adminId, role: ROLES.ADMIN },
          body: {
            studentProfileId: profileA1._id.toString(),
            type: 'course_completion',
            title: 'Python Essentials Honors',
            courseId: courseId.toString(),
            allowDuplicate: true,
          },
        });

        await certificateController.issueCertificate(req, res);
        assert.equal(res.statusCode, 201);
      } finally {
        StudentProfile.findById = origProfileFind;
        Course.findById = origCourseFind;
        Certificate.findOne = origCertFindOne;
        Certificate.exists = origCertExists;
        Certificate.create = origCertCreate;
        notificationService.createNotification = origCreateNotif;
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. PARENT GET /MY ACCESS & PER-CHILD FILTERING
  // ──────────────────────────────────────────────────────────────────────────
  describe('Parent GET /my Access & Filtering', () => {
    it('22-25. unfiltered /my returns all owned child certificates (active, inactive, legacy) and excludes foreign profiles', async () => {
      const origProfileFind = StudentProfile.find;
      const origCertFind = Certificate.find;

      StudentProfile.find = mock.fn(() => ({
        select: () => ({
          lean: async () => [{ _id: profileA1._id }, { _id: profileA2._id }, { _id: profileInactive._id }],
        }),
      }));

      const mockCerts = [
        { _id: oid(), studentProfile: profileA1, title: 'Cert A1' },
        { _id: oid(), studentProfile: profileA2, title: 'Cert A2' },
        { _id: oid(), studentProfile: profileInactive, title: 'Cert Inactive' },
        { _id: oid(), student: parentA, title: 'Legacy Cert Parent' },
      ];

      Certificate.find = mock.fn((filter) => {
        // Assert query structure uses $or with legacy student and studentProfile $in owned profile IDs
        assert.ok(filter.$or, 'Filter must contain $or clause');
        const mockChain = {
          populate: () => mockChain,
          sort: () => mockChain,
          lean: async () => mockCerts,
        };
        return mockChain;
      });

      try {
        const { req, res } = createMockReqRes({
          user: { _id: parentA, role: ROLES.STUDENT },
        });

        await certificateController.getMyCertificates(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.data.length, 4);
      } finally {
        StudentProfile.find = origProfileFind;
        Certificate.find = origCertFind;
      }
    });

    it('26-28. filtered /my?studentProfileId=<id> returns only certificates for specified profile (active or inactive)', async () => {
      const origProfileFindOne = StudentProfile.findOne;
      const origCertFind = Certificate.find;

      StudentProfile.findOne = mock.fn(async () => profileInactive);

      const mockCerts = [{ _id: oid(), studentProfile: profileInactive, title: 'Inactive Child Cert' }];

      Certificate.find = mock.fn((filter) => {
        assert.equal(filter.studentProfile.toString(), profileInactive._id.toString());
        assert.equal(filter.status, 'valid');
        const mockChain = {
          populate: () => mockChain,
          sort: () => mockChain,
          lean: async () => mockCerts,
        };
        return mockChain;
      });

      try {
        const { req, res } = createMockReqRes({
          user: { _id: parentA, role: ROLES.STUDENT },
          query: { studentProfileId: profileInactive._id.toString() },
        });

        await certificateController.getMyCertificates(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.data.data.length, 1);
      } finally {
        StudentProfile.findOne = origProfileFindOne;
        Certificate.find = origCertFind;
      }
    });

    it('29-30. foreign or non-existent studentProfileId in /my query is rejected (404)', async () => {
      const origProfileFindOne = StudentProfile.findOne;
      StudentProfile.findOne = mock.fn(async () => null);

      try {
        const { req, res } = createMockReqRes({
          user: { _id: parentA, role: ROLES.STUDENT },
          query: { studentProfileId: profileB1._id.toString() },
        });

        await assert.rejects(
          () => certificateController.getMyCertificates(req, res),
          (err) => err.statusCode === 404 && /student profile not found/i.test(err.message)
        );
      } finally {
        StudentProfile.findOne = origProfileFindOne;
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. GET CERTIFICATE BY ID ACCESS CONTROL
  // ──────────────────────────────────────────────────────────────────────────
  describe('GET Certificate By ID Access Control', () => {
    it('31-35. parent can view owned child cert & legacy cert, blocked from foreign child cert (403), admin views all', async () => {
      const origCertFindById = Certificate.findById;

      const certChildOwned = {
        _id: oid(),
        studentProfile: { _id: profileA1._id, parentUser: parentA },
        title: 'Child Cert',
      };

      const certForeign = {
        _id: oid(),
        studentProfile: { _id: profileB1._id, parentUser: parentB },
        title: 'Foreign Child Cert',
      };

      const legacyCert = {
        _id: oid(),
        student: { _id: parentA },
        title: 'Legacy Cert',
      };

      Certificate.findById = mock.fn((id) => {
        let cert = certChildOwned;
        if (id === certForeign._id.toString()) cert = certForeign;
        if (id === legacyCert._id.toString()) cert = legacyCert;

        const mockChain = {
          populate: () => mockChain,
          lean: async () => cert,
        };
        return mockChain;
      });

      try {
        // Parent views owned child cert -> 200
        const { req: req1, res: res1 } = createMockReqRes({
          user: { _id: parentA, role: ROLES.STUDENT },
          params: { id: certChildOwned._id.toString() },
        });
        await certificateController.getCertificateById(req1, res1);
        assert.equal(res1.statusCode, 200);

        // Parent views legacy cert -> 200
        const { req: req2, res: res2 } = createMockReqRes({
          user: { _id: parentA, role: ROLES.STUDENT },
          params: { id: legacyCert._id.toString() },
        });
        await certificateController.getCertificateById(req2, res2);
        assert.equal(res2.statusCode, 200);

        // Parent views foreign child cert -> 403
        const { req: req3, res: res3 } = createMockReqRes({
          user: { _id: parentA, role: ROLES.STUDENT },
          params: { id: certForeign._id.toString() },
        });
        await assert.rejects(
          () => certificateController.getCertificateById(req3, res3),
          (err) => err.statusCode === 403
        );

        // Admin views foreign child cert -> 200
        const { req: req4, res: res4 } = createMockReqRes({
          user: { _id: adminId, role: ROLES.ADMIN },
          params: { id: certForeign._id.toString() },
        });
        await certificateController.getCertificateById(req4, res4);
        assert.equal(res4.statusCode, 200);
      } finally {
        Certificate.findById = origCertFindById;
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. PUBLIC VERIFICATION & PRIVACY
  // ──────────────────────────────────────────────────────────────────────────
  describe('Public Verification (GET /api/certificates/verify/:certificateNumber)', () => {
    it('36-40. uses recipientNameSnapshot, preserves privacy (no parent user/email), handles revoked (400)', async () => {
      const origCertFindOne = Certificate.findOne;

      const certValid = {
        certificateNumber: 'CERT-PUBLIC-001',
        recipientNameSnapshot: 'Abel Bekele Tesfaye',
        studentProfile: profileA1,
        title: 'Public Verified Cert',
        type: 'course_completion',
        status: 'valid',
        issueDate: new Date(),
      };

      const certRevoked = {
        certificateNumber: 'CERT-REVOKED-001',
        recipientNameSnapshot: 'Abel Bekele Tesfaye',
        title: 'Revoked Cert',
        status: 'revoked',
        issueDate: new Date(),
      };

      Certificate.findOne = mock.fn(({ certificateNumber }) => {
        let cert = certValid;
        if (certificateNumber === 'CERT-REVOKED-001') cert = certRevoked;

        const mockChain = {
          populate: () => mockChain,
          lean: async () => cert,
        };
        return mockChain;
      });

      try {
        // Valid cert verification
        const { req: req1, res: res1 } = createMockReqRes({
          params: { certificateNumber: 'CERT-PUBLIC-001' },
        });
        await certificateController.verifyCertificate(req1, res1);

        assert.equal(res1.statusCode, 200);
        assert.equal(res1.data.data.studentName, 'Abel Bekele Tesfaye');
        assert.equal(res1.data.data.parentUser, undefined);
        assert.equal(res1.data.data.email, undefined);

        // Revoked cert verification
        const { req: req2, res: res2 } = createMockReqRes({
          params: { certificateNumber: 'CERT-REVOKED-001' },
        });
        await certificateController.verifyCertificate(req2, res2);

        assert.equal(res2.statusCode, 400);
        assert.equal(res2.data.data.status, 'revoked');
      } finally {
        Certificate.findOne = origCertFindOne;
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. REGRESSIONS & TYPE CONTEXT REQUIREMENTS
  // ──────────────────────────────────────────────────────────────────────────
  describe('Type Context Requirements', () => {
    it('43-45. course_completion requires courseId, competition_achievement requires competitionId', async () => {
      const origProfileFind = StudentProfile.findById;
      StudentProfile.findById = mock.fn(async () => profileA1);

      try {
        // course_completion without courseId
        const { req: req1, res: res1 } = createMockReqRes({
          user: { _id: adminId, role: ROLES.ADMIN },
          body: {
            studentProfileId: profileA1._id.toString(),
            type: 'course_completion',
            title: 'Course Cert Without Course ID',
          },
        });
        await assert.rejects(
          () => certificateController.issueCertificate(req1, res1),
          (err) => err.statusCode === 400 && /course is required/i.test(err.message)
        );

        // competition_achievement without competitionId
        const { req: req2, res: res2 } = createMockReqRes({
          user: { _id: adminId, role: ROLES.ADMIN },
          body: {
            studentProfileId: profileA1._id.toString(),
            type: 'competition_achievement',
            title: 'Comp Cert Without Comp ID',
          },
        });
        await assert.rejects(
          () => certificateController.issueCertificate(req2, res2),
          (err) => err.statusCode === 400 && /competition is required/i.test(err.message)
        );
      } finally {
        StudentProfile.findById = origProfileFind;
      }
    });
  });
});
