/**
 * Centralized environment variable config.
 * Validates all required env vars on startup — crashes fast with a clear message
 * if anything is missing, rather than failing silently at runtime.
 */

const required = [
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRE',
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USER',
  'EMAIL_PASS',
  'EMAIL_FROM',
  'CLIENT_URL',
  'GOOGLE_CLIENT_ID',
  // GOOGLE_CLIENT_SECRET is not required — the token-exchange flow only needs
  // GOOGLE_CLIENT_ID for verifyIdToken(). The secret is only needed for the
  // server-side redirect flow, which this project does not use.
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n  ${missing.join('\n  ')}\n`);
  process.exit(1);
}

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI,

  jwt: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE || '7d',
  },

  email: {
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM,
  },

  clientUrl: process.env.CLIENT_URL,

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
};
