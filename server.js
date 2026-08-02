require('dotenv').config();

const env = require('./src/config/env');

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const swaggerUi  = require('swagger-ui-express');

const { mongoSanitize } = require('./src/middleware/sanitize.middleware');
const connectDB          = require('./src/config/database');
const swaggerSpec        = require('./src/config/swagger');
const { errorMiddleware } = require('./src/middleware/error.middleware');

const authRoutes       = require('./src/routes/auth.routes');
const courseRoutes     = require('./src/routes/course.routes');
const enrollmentRoutes = require('./src/routes/enrollment.routes');
const adminRoutes      = require('./src/routes/admin.routes');
const contactRoutes    = require('./src/routes/contact.routes');

const app = express();

connectDB();

// Helmet — disable CSP only for Swagger UI (it loads inline scripts)
app.use((req, res, next) => {
  const helmetOptions = req.path.startsWith('/api-docs')
    ? { contentSecurityPolicy: false }
    : {};
  return helmet(helmetOptions)(req, res, next);
});

// CORS — allowed origins:
// • CLIENT_URL from .env (your frontend)
// • The API's own URL (allows Swagger UI "Try it out" to work on the deployed server)
// • localhost:3000 always included for local development
const allowedOrigins = [
  env.clientUrl,
  process.env.API_URL,
  'https://stem-frontend-delta.vercel.app', // production frontend on Vercel
  'http://localhost:3000',
  'http://localhost:5000', // Swagger UI "Try it out" sends requests from the server's own origin
  'http://localhost:5173',
].filter(Boolean); // remove undefined entries

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' is not allowed.`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(mongoSanitize);

// Rate limiting is production-only; dev uses a no-op to avoid blocking tests
const noop = (_req, _res, next) => next();
const isProduction = env.nodeEnv === 'production';

const authLimiter = isProduction
  ? rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
      message: { success: false, message: 'Too many requests from this IP. Please try again in 15 minutes.' } })
  : noop;

const apiLimiter = isProduction
  ? rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false,
      message: { success: false, message: 'Too many requests from this IP. Please try again later.' } })
  : noop;

app.use('/api/auth', authLimiter);
app.use('/api',      apiLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan(isProduction ? 'combined' : 'dev'));

app.use('/uploads', express.static(path.join(__dirname, 'src/uploads')));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'E-Learning API Docs',
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: { persistAuthorization: true, docExpansion: 'none', filter: true },
}));

app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'Server is healthy.', environment: env.nodeEnv, timestamp: new Date().toISOString() });
});

app.use('/api/auth',        authRoutes);
app.use('/api/courses',     courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/contact',     contactRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

app.use(errorMiddleware);

const server = app.listen(env.port, () => {
  console.log(`\n🚀 Server running in ${env.nodeEnv} mode on http://localhost:${env.port}`);
  console.log(`📋 Health check:  http://localhost:${env.port}/health`);
  console.log(`📖 API Docs:      http://localhost:${env.port}/api-docs\n`);
});

const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    const mongoose = require('mongoose');
    mongoose.connection.close(false, () => process.exit(0));
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
