const HomepageStatistics = require('../models/HomepageStatistics');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { STATISTIC_FIELDS } = require('../validators/statistics.validator');

const {
  HOMEPAGE_STATISTICS_KEY,
  DEFAULT_HOMEPAGE_STATISTICS,
} = HomepageStatistics;

const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
const isSingletonKeyDuplicate = (error) => (
  error?.code === 11000
  && (
    error.keyPattern?.key === 1
    || hasOwn(error.keyValue || {}, 'key')
    || /\bkey_1\b/.test(error.message || '')
  )
);

const configurationFrom = (document) => {
  const source = document && typeof document.toObject === 'function'
    ? document.toObject()
    : (document || {});

  return {
    registeredStudents: source.registeredStudents ?? DEFAULT_HOMEPAGE_STATISTICS.registeredStudents,
    totalCoursesGiven: source.totalCoursesGiven ?? DEFAULT_HOMEPAGE_STATISTICS.totalCoursesGiven,
    annualLearningCapacity: source.annualLearningCapacity ?? DEFAULT_HOMEPAGE_STATISTICS.annualLearningCapacity,
    competitionParticipants: source.competitionParticipants ?? DEFAULT_HOMEPAGE_STATISTICS.competitionParticipants,
    showPlus: {
      registeredStudents: source.showPlus?.registeredStudents
        ?? DEFAULT_HOMEPAGE_STATISTICS.showPlus.registeredStudents,
      totalCoursesGiven: source.showPlus?.totalCoursesGiven
        ?? DEFAULT_HOMEPAGE_STATISTICS.showPlus.totalCoursesGiven,
      annualLearningCapacity: source.showPlus?.annualLearningCapacity
        ?? DEFAULT_HOMEPAGE_STATISTICS.showPlus.annualLearningCapacity,
      competitionParticipants: source.showPlus?.competitionParticipants
        ?? DEFAULT_HOMEPAGE_STATISTICS.showPlus.competitionParticipants,
    },
  };
};

const publicDataFrom = (document) => {
  const configuration = configurationFrom(document);
  return Object.fromEntries(STATISTIC_FIELDS.map((field) => [field, {
    value: configuration[field],
    showPlus: configuration.showPlus[field],
  }]));
};

const adminDataFrom = (document) => {
  const source = document && typeof document.toObject === 'function'
    ? document.toObject()
    : document;

  return {
    configured: Boolean(document),
    ...configurationFrom(document),
    updatedBy: source?.updatedBy ?? null,
    updatedAt: source?.updatedAt ?? null,
  };
};

const findConfiguration = () => HomepageStatistics.findOne({
  key: HOMEPAGE_STATISTICS_KEY,
}).lean();

exports.getPublicStatistics = asyncHandler(async (_req, res) => {
  const statistics = await findConfiguration();
  return res.json(new ApiResponse(
    200,
    'Homepage statistics fetched successfully.',
    publicDataFrom(statistics)
  ));
});

exports.getAdminStatistics = asyncHandler(async (_req, res) => {
  const statistics = await findConfiguration();
  return res.json(new ApiResponse(
    200,
    'Homepage statistics configuration fetched successfully.',
    adminDataFrom(statistics)
  ));
});

exports.updateAdminStatistics = asyncHandler(async (req, res) => {
  const set = { updatedBy: req.user._id };
  const setOnInsert = { key: HOMEPAGE_STATISTICS_KEY };

  for (const field of STATISTIC_FIELDS) {
    if (hasOwn(req.body, field)) set[field] = req.body[field];
    else setOnInsert[field] = DEFAULT_HOMEPAGE_STATISTICS[field];
  }

  for (const field of STATISTIC_FIELDS) {
    const path = `showPlus.${field}`;
    if (req.body.showPlus && hasOwn(req.body.showPlus, field)) {
      set[path] = req.body.showPlus[field];
    } else {
      setOnInsert[path] = DEFAULT_HOMEPAGE_STATISTICS.showPlus[field];
    }
  }

  const update = { $set: set, $setOnInsert: setOnInsert };
  const options = {
    new: true,
    upsert: true,
    runValidators: true,
  };

  let statistics;
  try {
    statistics = await HomepageStatistics.findOneAndUpdate(
      { key: HOMEPAGE_STATISTICS_KEY },
      update,
      options
    );
  } catch (error) {
    if (!isSingletonKeyDuplicate(error)) throw error;
    statistics = await HomepageStatistics.findOneAndUpdate(
      { key: HOMEPAGE_STATISTICS_KEY },
      { $set: set },
      { new: true, runValidators: true }
    );
    if (!statistics) throw error;
  }

  return res.json(new ApiResponse(
    200,
    'Homepage statistics updated successfully.',
    adminDataFrom(statistics)
  ));
});
