require('dotenv').config();

// Config validation — crashes immediately if any required env var is missing
const env = require('./src/config/env');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const swaggerUi = require('swagger-ui-express');

const { mongoSanitize } = require('./src/middleware/sanitize.middleware');

const connectDB = require('./src/config/database');
const swaggerSpec = require('./src/config/swagger');
const { errorMiddleware } = require('./src/middleware/error.middleware');

// ── Route imports ──────────────────────────────────────────────────────────
const authRoutes       = require('./src/routes/auth.routes');
const courseRoutes     = require('./src/routes/course.routes');
const enrollmentRoutes = require('./src/routes/enrollment.routes');
const adminRoutes      = require('./src/routes/admin.routes');

const app = express();

// ── Database ───────────────────────────────────────────────────────────────
connectDB();

// ── Security middleware ────────────────────────────────────────────────────

// Swagger UI needs relaxed CSP — apply helmet globally but override for /api-docs
// so the Swagger UI scripts/styles load correctly in the browser.
app.use((req, res, next) => {
  if (req.path.startsWith('/api-docs')) {
    // Swagger UI requires inline scripts and styles — disable CSP for this path only
    return helmet({
      contentSecurityPolicy: false,
    })(req, res, next);
  }
  return helmet()(req, res, next);
});

// Lock CORS to the frontend origin defined in .env
app.use(cors({
  origin: env.clientUrl,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Prevent NoSQL injection via $-operator keys in request body/params/query
app.use(mongoSanitize);

// ── Rate limiting ──────────────────────────────────────────────────────────

// Strict limit on auth routes — prevents brute-force and credential-stuffing attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,                    // max 20 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again in 15 minutes.',
  },
});

// Looser general limit for all other API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again later.',
  },
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ── General middleware ─────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));       // limit JSON body size
app.use(express.urlencoded({ extended: false }));
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

// ── Static file serving ────────────────────────────────────────────────────
// Uploaded academic PDFs are served at /uploads/<filename>
// In production, move this to cloud storage (Cloudinary / S3)
app.use('/uploads', express.static(path.join(__dirname, 'src/uploads')));

// ── Swagger Documentation ──────────────────────────────────────────────────
// Available at: http://localhost:5000/api-docs
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'E-Learning API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,   // keeps the JWT set between page refreshes
      docExpansion: 'none',          // all sections collapsed by default — cleaner view
      filter: true,                  // enables the search/filter bar
    },
  })
);

// Expose raw OpenAPI JSON for tooling (Postman import, code generators, etc.)
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy.',
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/courses',     courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/admin',       adminRoutes);

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ── Global error handler (must be last) ───────────────────────────────────
app.use(errorMiddleware);

// ── Start server ───────────────────────────────────────────────────────────
const server = app.listen(env.port, () => {
  console.log(`\n🚀 Server running in ${env.nodeEnv} mode on http://localhost:${env.port}`);
  console.log(`📋 Health check:  http://localhost:${env.port}/health`);
  console.log(`📖 API Docs:      http://localhost:${env.port}/api-docs\n`);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
// Render (and other cloud platforms) send SIGTERM before force-killing the process.
// Without this handler, in-flight requests are dropped and DB connections leak.
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('✅ HTTP server closed.');
    // Mongoose closes its own connection pool on process exit,
    // but closing explicitly ensures clean shutdown in all cases.
    const mongoose = require('mongoose');
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed.');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
