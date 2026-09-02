const StudentProfile = require('../models/StudentProfile');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const {
  normalizeNameComponent,
  serializeStudentProfile,
  buildPossibleDuplicate,
} = require('../utils/studentProfile');

const MAX_PROFILE_SLOTS = 5;
const ALLOWED_UPDATE_FIELDS = Object.freeze([
  'givenName',
  'fatherName',
  'grandfatherName',
  'grade',
  'school',
  'isActive',
]);
const NAME_FIELDS = new Set(['givenName', 'fatherName', 'grandfatherName']);

const metadataKeys = (value) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value)
    : []
);

const hasExactParentSlotKeys = (value) => {
  const keys = metadataKeys(value);
  return keys.length === 2 && keys.includes('parentUser') && keys.includes('slot');
};

const isParentSlotDuplicate = (error) => {
  if (error?.code !== 11000) return false;

  const patternKeys = metadataKeys(error.keyPattern);
  if (patternKeys.length > 0) {
    return hasExactParentSlotKeys(error.keyPattern)
      && error.keyPattern.parentUser === 1
      && error.keyPattern.slot === 1;
  }

  return hasExactParentSlotKeys(error.keyValue)
    && error.keyValue.parentUser !== null
    && error.keyValue.parentUser !== undefined
    && Number.isInteger(error.keyValue.slot)
    && error.keyValue.slot >= 1
    && error.keyValue.slot <= MAX_PROFILE_SLOTS;
};

const findParentProfiles = async (parentUser) => StudentProfile.find({ parentUser })
  .sort({ slot: 1 })
  .lean();

const findOccupiedSlots = async (parentUser) => {
  const profiles = await StudentProfile.find({ parentUser })
    .select('slot')
    .lean();
  return new Set(profiles.map(({ slot }) => Number(slot)));
};

const lowestFreeSlot = (occupiedSlots) => {
  for (let slot = 1; slot <= MAX_PROFILE_SLOTS; slot += 1) {
    if (!occupiedSlots.has(slot)) return slot;
  }
  return null;
};

const capacityError = () => new ApiError(
  409,
  'A user may own at most five student profiles.'
);

const createWithReservedSlot = async (parentUser, attributes) => {
  for (let attempt = 0; attempt < MAX_PROFILE_SLOTS; attempt += 1) {
    const occupiedSlots = await findOccupiedSlots(parentUser);
    const slot = lowestFreeSlot(occupiedSlots);
    if (slot === null) throw capacityError();

    try {
      return await StudentProfile.create({
        ...attributes,
        parentUser,
        slot,
        isActive: true,
      });
    } catch (error) {
      if (!isParentSlotDuplicate(error)) throw error;
    }
  }

  const occupiedSlots = await findOccupiedSlots(parentUser);
  if (lowestFreeSlot(occupiedSlots) === null) throw capacityError();
  throw new ApiError(409, 'Unable to reserve a student profile slot. Please try again.');
};

exports.createStudentProfile = asyncHandler(async (req, res) => {
  const attributes = {
    givenName: req.body.givenName,
    fatherName: req.body.fatherName,
    grandfatherName: req.body.grandfatherName,
    ...(req.body.grade !== undefined && { grade: req.body.grade }),
    ...(req.body.school !== undefined && { school: req.body.school }),
  };

  const created = await createWithReservedSlot(req.user._id, attributes);
  const profiles = await findParentProfiles(req.user._id);

  return res.status(201).json(new ApiResponse(201, 'Student profile created successfully.', {
    student: serializeStudentProfile(created, profiles),
    possibleDuplicate: buildPossibleDuplicate(created, profiles),
  }));
});

exports.getStudentProfiles = asyncHandler(async (req, res) => {
  const profiles = await findParentProfiles(req.user._id);
  return res.json(new ApiResponse(200, 'Student profiles fetched successfully.', {
    students: profiles.map((profile) => serializeStudentProfile(profile, profiles)),
  }));
});

exports.getStudentProfile = asyncHandler(async (req, res) => {
  const ownershipFilter = { _id: req.params.id, parentUser: req.user._id };
  const profile = await StudentProfile.findOne(ownershipFilter);
  if (!profile) throw new ApiError(404, 'Student profile not found.');

  const profiles = await findParentProfiles(req.user._id);
  return res.json(new ApiResponse(200, 'Student profile fetched successfully.', {
    student: serializeStudentProfile(profile, profiles),
  }));
});

exports.updateStudentProfile = asyncHandler(async (req, res) => {
  const ownershipFilter = { _id: req.params.id, parentUser: req.user._id };
  const profile = await StudentProfile.findOne(ownershipFilter);
  if (!profile) throw new ApiError(404, 'Student profile not found.');

  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (req.body[field] === undefined) continue;
    profile[field] = NAME_FIELDS.has(field)
      ? normalizeNameComponent(req.body[field])
      : req.body[field];
  }
  await profile.save();

  const profiles = await findParentProfiles(req.user._id);
  return res.json(new ApiResponse(200, 'Student profile updated successfully.', {
    student: serializeStudentProfile(profile, profiles),
    possibleDuplicate: buildPossibleDuplicate(profile, profiles),
  }));
});

exports.MAX_PROFILE_SLOTS = MAX_PROFILE_SLOTS;
exports.ALLOWED_UPDATE_FIELDS = ALLOWED_UPDATE_FIELDS;
exports.lowestFreeSlot = lowestFreeSlot;
exports.isParentSlotDuplicate = isParentSlotDuplicate;
exports.createWithReservedSlot = createWithReservedSlot;
