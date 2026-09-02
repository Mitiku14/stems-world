const DISPLAY_SEPARATOR = ' — ';

const normalizeNameComponent = (value) => {
  if (typeof value !== 'string') return value;
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
};

const fullNameFor = (profile) => [
  profile?.givenName,
  profile?.fatherName,
  profile?.grandfatherName,
].map(normalizeNameComponent).filter(Boolean).join(' ');

const nameComparisonKey = (profile) => [
  profile?.givenName,
  profile?.fatherName,
  profile?.grandfatherName,
].map((part) => String(normalizeNameComponent(part) || '').toLocaleLowerCase()).join('\u0000');

const baseDisplayLabelFor = (profile) => [
  fullNameFor(profile),
  profile?.grade,
  profile?.school,
].filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
  .join(DISPLAY_SEPARATOR);

const idString = (value) => String(value?._id ?? value ?? '');
const sameId = (left, right) => idString(left) === idString(right);
const sameParent = (left, right) => sameId(left?.parentUser, right?.parentUser);

const toPlainProfile = (profile) => {
  if (profile && typeof profile.toObject === 'function') {
    return profile.toObject({ virtuals: false });
  }
  return profile || {};
};

const hasDisplayCollision = (profile, siblingProfiles = []) => {
  const baseLabel = baseDisplayLabelFor(profile);
  return siblingProfiles.some((candidate) => (
    !sameId(candidate, profile)
    && sameParent(candidate, profile)
    && baseDisplayLabelFor(candidate) === baseLabel
  ));
};

const displayLabelFor = (profile, siblingProfiles = []) => {
  const baseLabel = baseDisplayLabelFor(profile);
  return hasDisplayCollision(profile, siblingProfiles)
    ? `${baseLabel}${DISPLAY_SEPARATOR}Profile ${profile.slot}`
    : baseLabel;
};

const serializeStudentProfile = (profile, siblingProfiles = []) => {
  const plain = toPlainProfile(profile);
  return {
    _id: plain._id,
    givenName: plain.givenName,
    fatherName: plain.fatherName,
    grandfatherName: plain.grandfatherName,
    fullName: fullNameFor(plain),
    displayLabel: displayLabelFor(plain, siblingProfiles),
    slot: plain.slot,
    profileNumber: plain.slot,
    grade: plain.grade ?? null,
    school: plain.school ?? null,
    isActive: plain.isActive,
    ...(plain.createdAt && { createdAt: plain.createdAt }),
    ...(plain.updatedAt && { updatedAt: plain.updatedAt }),
  };
};

const duplicateProfilesFor = (profile, siblingProfiles = []) => {
  const comparisonKey = nameComparisonKey(profile);
  return siblingProfiles.filter((candidate) => (
    !sameId(candidate, profile)
    && sameParent(candidate, profile)
    && nameComparisonKey(candidate) === comparisonKey
  ));
};

const buildPossibleDuplicate = (profile, siblingProfiles = []) => {
  const matches = duplicateProfilesFor(profile, siblingProfiles);
  return {
    matched: matches.length > 0,
    profiles: matches.map((match) => {
      const serialized = serializeStudentProfile(match, siblingProfiles);
      return {
        _id: serialized._id,
        fullName: serialized.fullName,
        displayLabel: serialized.displayLabel,
        slot: serialized.slot,
        profileNumber: serialized.profileNumber,
      };
    }),
  };
};

module.exports = {
  normalizeNameComponent,
  fullNameFor,
  nameComparisonKey,
  baseDisplayLabelFor,
  displayLabelFor,
  serializeStudentProfile,
  duplicateProfilesFor,
  buildPossibleDuplicate,
};
