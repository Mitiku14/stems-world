const smsEnabled = /^(true|1)$/i.test(process.env.SMS_ENABLED || 'false');

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
];

if (smsEnabled) {
  required.push(
    'OTP_SECRET',
    'SMS_PROVIDER'
  );
}

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n  ${missing.join('\n  ')}\n`);
  process.exit(1);
}

module.exports = {
  port:    parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI,

  jwt: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE || '7d',
  },

  email: {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM,
  },

  clientUrl: process.env.CLIENT_URL,

  google: {
    clientId:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },

  otp: {
    secret: process.env.OTP_SECRET || '',
  },

  sms: {
    enabled: smsEnabled,
    provider: process.env.SMS_PROVIDER || '',
    apiBaseUrl: process.env.SMS_API_BASE_URL || '',
    apiKey: process.env.SMS_API_KEY || '',
    username: process.env.SMS_USERNAME || '',
    senderId: process.env.SMS_SENDER_ID || '',
    timeoutMs: parseInt(process.env.SMS_TIMEOUT_MS, 10) || 5000,
  },
};
