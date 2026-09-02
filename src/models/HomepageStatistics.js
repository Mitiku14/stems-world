const mongoose = require('mongoose');

const HOMEPAGE_STATISTICS_KEY = 'homepage';

const DEFAULT_HOMEPAGE_STATISTICS = Object.freeze({
  registeredStudents: 1500,
  totalCoursesGiven: 10,
  annualLearningCapacity: 3000,
  competitionParticipants: 10,
  showPlus: Object.freeze({
    registeredStudents: true,
    totalCoursesGiven: true,
    annualLearningCapacity: true,
    competitionParticipants: true,
  }),
});

const statisticNumber = (defaultValue, label) => ({
  type: Number,
  required: [true, `${label} is required`],
  default: defaultValue,
  min: [0, `${label} cannot be negative`],
  max: [Number.MAX_SAFE_INTEGER, `${label} cannot exceed Number.MAX_SAFE_INTEGER`],
  validate: {
    validator: Number.isSafeInteger,
    message: `${label} must be an integer`,
  },
});

const homepageStatisticsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      immutable: true,
      unique: true,
      required: true,
      default: HOMEPAGE_STATISTICS_KEY,
      enum: [HOMEPAGE_STATISTICS_KEY],
    },
    registeredStudents: statisticNumber(DEFAULT_HOMEPAGE_STATISTICS.registeredStudents, 'Registered students'),
    totalCoursesGiven: statisticNumber(DEFAULT_HOMEPAGE_STATISTICS.totalCoursesGiven, 'Total courses given'),
    annualLearningCapacity: statisticNumber(DEFAULT_HOMEPAGE_STATISTICS.annualLearningCapacity, 'Annual learning capacity'),
    competitionParticipants: statisticNumber(DEFAULT_HOMEPAGE_STATISTICS.competitionParticipants, 'Competition participants'),
    showPlus: {
      registeredStudents: { type: Boolean, default: true },
      totalCoursesGiven: { type: Boolean, default: true },
      annualLearningCapacity: { type: Boolean, default: true },
      competitionParticipants: { type: Boolean, default: true },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

const HomepageStatistics = mongoose.model('HomepageStatistics', homepageStatisticsSchema);

module.exports = HomepageStatistics;
module.exports.HOMEPAGE_STATISTICS_KEY = HOMEPAGE_STATISTICS_KEY;
module.exports.DEFAULT_HOMEPAGE_STATISTICS = DEFAULT_HOMEPAGE_STATISTICS;
