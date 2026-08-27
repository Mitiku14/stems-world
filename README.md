# E-Learning Platform Backend API

A production-ready REST API for an E-Learning platform built with Node.js, Express, and MongoDB.

## Features & Highlights

- **Course Management & STEAM Taxonomy**: Support for Course categories (`science`, `technology`, `engineering`, `arts`, `mathematics`) and canonical subcategories, search, filtering, level selection, and intake windows.
- **Student Registration & Auth**: Email/password registration with token verification, Google OAuth sign-in, and role-based access control (`student` and `admin`).
- **Secure Phone Verification (OTP)**: Authenticated phone verification via 6-digit cryptographic OTPs with HMAC-SHA256 storage, 5-minute TTL, 5-attempt lockouts, 60s resend cooldowns, and provider-neutral transport boundary (`SmsService`).
- **Enrollment Management**: Student enrollment submission with optional PDF academic document uploads, site selection, and administrative accept/reject workflows.
- **Interactive Swagger Documentation**: Built-in Swagger UI available at `/api-docs`.
- **Postman Support**: Pre-configured `postman_collection.json` and `postman_environment.json`.
- **CSV Data Exports**: Admin reports for courses, enrollments, competition registrations, and student rosters.

---

## Quick Start

### 1. Installation
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and adjust database URI and secret keys:
```bash
cp .env.example .env
```

### 3. Seed Initial Data
```bash
npm run seed:courses
npm run seed:admin
```

### 4. Development Server
```bash
npm run dev
```
The server will start on `http://localhost:5000`.

---

## API Documentation & Body Formats

- **Full Specification**: Refer to [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md) for detailed JSON schemas, parameters, and example payloads.
- **Swagger UI**: Visit `http://localhost:5000/api-docs` when running locally.

### Key Course Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/courses/taxonomy` | Public | Returns canonical STEAM category-to-subcategory mapping |
| `GET` | `/api/courses` | Public | List & search active courses (supports `search`, `category`, `subcategory`, `level`, `page`, `limit`) |
| `GET` | `/api/courses/:id` | Public | Get single course details by ID |
| `POST` | `/api/courses` | Admin | Create a new course |
| `PUT` | `/api/courses/:id` | Admin | Update course details |
| `PATCH` | `/api/courses/:id/toggle-status` | Admin | Toggle active/inactive status |
| `DELETE` | `/api/courses/:id` | Admin | Delete a course (protected against active enrollments) |

#### Example Course Creation Body (`POST /api/courses`):
```json
{
  "title": "Advanced Data Structures & Algorithms",
  "description": "In-depth exploration of graph algorithms, dynamic programming, and complexity analysis.",
  "category": "technology",
  "subcategory": "programming",
  "level": "advanced",
  "requiresDocument": true,
  "imageUrl": "/cs/algo.jpg",
  "syllabus": [
    "Big-O & Complexity Analysis",
    "Trees and Graph Traversal",
    "Dynamic Programming"
  ],
  "instructor": "Dr. Abebe Tessema",
  "duration": "12 weeks",
  "requirements": [
    "Programming for Kids/Adults or equivalent"
  ],
  "registrationOpenDate": "2026-09-01T00:00:00.000Z",
  "registrationCloseDate": "2026-10-15T23:59:59.000Z",
  "season": "Fall 2026",
  "maxStudents": 30
}
```

## SMS Transport & Provider Readiness (Phase 3A)

The backend phone OTP architecture is provider-independent and fully verified. In development/staging environments, SMS transport remains disabled (`SMS_ENABLED=false`).

To enable real SMS delivery in production:
1. Set `SMS_ENABLED=true` in environment configuration.
2. Configure `SMS_PROVIDER`, `SMS_API_BASE_URL`, `SMS_API_KEY`, and `SMS_SENDER_ID`.
3. Refer to [`docs/SMS_PROVIDER_ACTIVATION.md`](./docs/SMS_PROVIDER_ACTIVATION.md) for the provider selection checklist and integration steps.

---

## Running Tests

Execute regression and unit tests:
```bash
npm test
```
