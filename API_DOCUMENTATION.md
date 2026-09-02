# E-Learning Platform Backend API Specification & Body Formats

This document provides a comprehensive specification of the E-Learning Platform REST API, including endpoint paths, HTTP methods, parameters, authentication requirements, and detailed JSON request body formats and response schemas.

---

## 1. Interactive API Documentation & Postman

- **Interactive Swagger UI**: Available at `/api-docs` (e.g., `http://localhost:5000/api-docs` or `https://<your-backend-domain>/api-docs`).
- **OpenAPI JSON Spec**: `http://localhost:5000/api-docs.json`
- **Postman Collection**: Pre-configured collection file at `postman_collection.json` and environment file at `postman_environment.json`.

---

## 2. Authentication & Authorization

All protected endpoints require a **Bearer JWT token** in the `Authorization` header:

```http
Authorization: Bearer <your_jwt_token>
```

### User Roles
- `student`: Standard authenticated user. Can view profile, register for courses/competitions, track enrollments.
- `admin`: Platform administrator. Full control over courses, students, enrollments, announcements, CSV exports, certificates, and site locations.

---

## 3. Course Taxonomy (STEAM Categories & Subcategories)

The platform enforces a canonical STEAM (Science, Technology, Engineering, Arts, Mathematics) taxonomy:

| Category (`category`) | Subcategories (`subcategory`) |
| :--- | :--- |
| `science` | `general_science`, `biology`, `chemistry`, `physics`, `environmental_science` |
| `technology` | `programming`, `machine_learning`, `computer_literacy` |
| `engineering` | `interdisciplinary` |
| `arts` | `language_arts` |
| `mathematics` | `elementary_mathematics`, `middle_school_mathematics`, `pre_algebra`, `algebra`, `geometry_trigonometry`, `pre_calculus`, `calculus` |

---

## 4. Course API Specification

### 4.1 Get Canonical Course Taxonomy
- **URL**: `/api/courses/taxonomy`
- **Method**: `GET`
- **Auth**: None
- **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Course taxonomy fetched successfully.",
  "data": {
    "science": [
      "general_science",
      "biology",
      "chemistry",
      "physics",
      "environmental_science"
    ],
    "technology": [
      "programming",
      "machine_learning",
      "computer_literacy"
    ],
    "engineering": [
      "interdisciplinary"
    ],
    "arts": [
      "language_arts"
    ],
    "mathematics": [
      "elementary_mathematics",
      "middle_school_mathematics",
      "pre_algebra",
      "algebra",
      "geometry_trigonometry",
      "pre_calculus",
      "calculus"
    ]
  }
}
```

---

### 4.2 List / Search Active Courses
- **URL**: `/api/courses`
- **Method**: `GET`
- **Auth**: None
- **Query Parameters**:
  - `search` (string, max 100 chars): Full-text search on course title and description.
  - `category` (string, optional): One of `science`, `technology`, `engineering`, `arts`, `mathematics`.
  - `subcategory` (string, optional): Controlled specialization matching selected category.
  - `level` (string, optional): One of `beginner`, `intermediate`, `advanced`, `all`.
  - `page` (integer, min 1, default 1): Page number.
  - `limit` (integer, min 1, max 50, default 10): Items per page.

- **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Courses fetched successfully.",
  "data": {
    "courses": [
      {
        "_id": "64a1b2c3d4e5f6789012abcd",
        "frontendId": "cs-1",
        "title": "Programming for Kids/Adults",
        "description": "Comprehensive introduction to fundamental computer programming...",
        "category": "technology",
        "subcategory": "programming",
        "level": "beginner",
        "requiresDocument": false,
        "imageUrl": "/cs/programming.jpg",
        "syllabus": [
          "Variables & Data Types",
          "Control Flow (if/else, loops)",
          "Functions & Reusability"
        ],
        "instructor": "Mr. Daniel Kebede",
        "duration": "10 weeks",
        "requirements": ["Basic computer skills"],
        "season": "Fall 2026",
        "maxStudents": 30,
        "isActive": true,
        "registrationOpenDate": "2026-08-01T00:00:00.000Z",
        "registrationCloseDate": "2026-09-30T23:59:59.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
}
```

---

### 4.3 Get Single Course Details
- **URL**: `/api/courses/:id`
- **Method**: `GET`
- **Auth**: None
- **Path Parameters**:
  - `id` (string, required): 24-character MongoDB ObjectId.

- **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Course fetched successfully.",
  "data": {
    "_id": "64a1b2c3d4e5f6789012abcd",
    "title": "Introduction to Machine Learning",
    "description": "An applied introduction to machine learning algorithms...",
    "category": "technology",
    "subcategory": "machine_learning",
    "level": "intermediate",
    "requiresDocument": true,
    "imageUrl": "/cs/ml.jpg",
    "syllabus": ["Python Review", "NumPy & Pandas", "Supervised Learning"],
    "instructor": "Dr. Abebe Tessema",
    "duration": "12 weeks",
    "requirements": ["Basic Python programming", "High school mathematics"],
    "season": "Fall 2026",
    "maxStudents": 25,
    "isActive": true,
    "sites": [
      {
        "_id": "64a987654321fedcba098765",
        "name": "Addis Ababa Training Hub",
        "address": "Bole Road, Addis Ababa",
        "isActive": true
      }
    ]
  }
}
```

---

### 4.4 Create Course (Admin Only)
- **URL**: `/api/courses`
- **Method**: `POST`
- **Auth**: Bearer JWT (Admin role required)
- **Content-Type**: `application/json`

#### **Request Body Format**:
| Field | Type | Required | Description / Constraints |
| :--- | :--- | :--- | :--- |
| `title` | `string` | **Yes** | Max 150 characters, unique course title. |
| `category` | `string` | **Yes** | Enum: `science`, `technology`, `engineering`, `arts`, `mathematics`. |
| `subcategory` | `string` | **Yes** | Must be a valid subcategory for the specified `category`. |
| `description` | `string` | No | Max 2000 characters. |
| `level` | `string` | No | Enum: `beginner`, `intermediate`, `advanced`, `all` (default: `all`). |
| `requiresDocument` | `boolean` | No | If `true`, student must upload PDF document upon enrollment. |
| `imageUrl` | `string` | No | HTTP/HTTPS URL or relative path starting with `/`. |
| `syllabus` | `string[]` | No | Array of non-empty strings representing course modules/topics. |
| `instructor` | `string` | No | Max 100 characters. |
| `duration` | `string` | No | Max 50 characters (e.g. `"12 weeks"`). |
| `requirements` | `string[]` | No | Array of prerequisite requirement strings. |
| `registrationOpenDate`| `string` | No | ISO 8601 Date string. |
| `registrationCloseDate`| `string` | No | ISO 8601 Date string (must be $\ge$ `registrationOpenDate`). |
| `season` | `string` | No | Max 50 characters (e.g. `"Fall 2026"`). |
| `maxStudents` | `integer` | No | Integer $\ge 1$. |
| `sites` | `string[]` | No | Array of active MongoDB Site ObjectIds. |

#### **Example Request JSON Body**:
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
    "Dynamic Programming",
    "Greedy Algorithms"
  ],
  "instructor": "Dr. Abebe Tessema",
  "duration": "12 weeks",
  "requirements": [
    "Programming for Kids/Adults or equivalent",
    "Basic Discrete Mathematics"
  ],
  "registrationOpenDate": "2026-09-01T00:00:00.000Z",
  "registrationCloseDate": "2026-10-15T23:59:59.000Z",
  "season": "Fall 2026",
  "maxStudents": 30,
  "sites": [
    "64a987654321fedcba098765"
  ]
}
```

- **Response `201 Created`**:
```json
{
  "success": true,
  "message": "Course created successfully.",
  "data": {
    "_id": "64a1b2c3d4e5f6789012abcd",
    "title": "Advanced Data Structures & Algorithms",
    "category": "technology",
    "subcategory": "programming",
    "level": "advanced",
    "requiresDocument": true,
    "isActive": true,
    "createdAt": "2026-08-26T10:00:00.000Z"
  }
}
```

---

### 4.5 Update Course (Admin Only)
- **URL**: `/api/courses/:id`
- **Method**: `PUT`
- **Auth**: Bearer JWT (Admin role required)
- **Content-Type**: `application/json`

#### **Request Body Format**:
All fields are optional. Only provided fields are updated. Partial category/subcategory updates safely preserve and validate against stored taxonomy pairs.

```json
{
  "title": "Advanced Data Structures & Algorithms (Updated)",
  "duration": "14 weeks",
  "maxStudents": 40
}
```

- **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Course updated successfully.",
  "data": {
    "_id": "64a1b2c3d4e5f6789012abcd",
    "title": "Advanced Data Structures & Algorithms (Updated)",
    "duration": "14 weeks",
    "maxStudents": 40
  }
}
```

---

### 4.6 Toggle Course Active/Inactive Status (Admin Only)
- **URL**: `/api/courses/:id/toggle-status`
- **Method**: `PATCH`
- **Auth**: Bearer JWT (Admin role required)

- **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Course deactivated successfully.",
  "data": {
    "isActive": false
  }
}
```

---

### 4.7 Delete Course (Admin Only)
- **URL**: `/api/courses/:id`
- **Method**: `DELETE`
- **Auth**: Bearer JWT (Admin role required)

> [!IMPORTANT]
> **Business Rule Protection**: A course with active approved enrollments (`status: accepted`) cannot be deleted. Deactivate it instead using `/toggle-status`.

- **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Course deleted successfully."
}
```
- **Error Response `409 Conflict`**:
```json
{
  "success": false,
  "message": "Cannot delete this course — it has 3 active approved enrollment(s). Deactivate it instead."
}
```

---

## 5. Competition API Contract

### 5.1 Scope values and listing order

The `scope` field and the public `scope` query filter accept exactly: `school_level`, `regional`, `national`, `continental`, and `international`. The `institutional` and `local` values are invalid and require manual review if found in legacy data. `GET /api/competitions` and `GET /api/admin/competitions` return newest-created competitions first (`createdAt` descending).

### 5.2 Round event dates

A Competition may remain roundless. When `rounds` is non-empty, every round requires the following fields in addition to its stable `_id`, `name`, and contiguous `order`:

| Field | Type | Required | Constraints |
| :--- | :--- | :--- | :--- |
| `eventStartsDate` | ISO 8601 date string | **Yes** | Must be strictly earlier than that round's `eventEndDate`. If the Competition has `eventStartDate`, the round cannot start before it. |
| `eventEndDate` | ISO 8601 date string | **Yes** | Must be strictly later than that round's `eventStartsDate`. If the Competition has `eventEndDate`, the round cannot end after it. |

```json
{
  "rounds": [
    {
      "name": "Qualifier",
      "order": 1,
      "eventStartsDate": "2026-10-15T09:00:00.000Z",
      "eventEndDate": "2026-10-15T12:00:00.000Z"
    }
  ]
}
```

The API does not require rounds to be non-overlapping or chronologically ordered by their dates. Round progression continues to use `order` and stable round `_id` values. Non-structural name/date edits preserve stored round IDs even when the update omits `_id`; legitimate pre-progression additions, removals, and intentional structural replacements retain their existing behavior. Partial Competition updates validate the final merged document, including unchanged stored rounds against any changed overall event boundary.

Round event dates are returned anywhere Competition rounds are returned, including public/admin Competition reads and student/admin Competition-registration responses.

### 5.3 Competition endpoints

- `GET /api/competitions` - Public active published/completed list; supports `category`, `type`, `scope`, `page`, and `limit`.
- `GET /api/competitions/:id` - Public Competition details.
- `POST /api/competitions` - Admin create; validates the complete Competition and round schedule.
- `PUT /api/competitions/:id` - Admin partial update; validates the final merged state.
- `GET /api/admin/competitions` - Admin list including drafts and inactive records.
- `GET /api/competitions/registrations/my` - Student registration/progression list with Competition round dates.
- `GET /api/admin/competition-registrations` - Admin registration list with Competition round dates.

### 5.4 Legacy metadata audit and deployment gate

The strict Competition scope and round-date schema must not be deployed over unreviewed legacy data. Run `npm run audit:competition-metadata` to produce a raw, read-only report of retired/unknown scopes, missing or invalid round dates, strict chronology failures, and overall event-boundary violations. The tool is audit-only: it performs no writes or index operations, rejects `--apply`/`--write`, and prints both Competition IDs and embedded round IDs for review.

Deployment order is mandatory:

1. Run the read-only legacy audit.
2. Classify every legacy `local`, missing, or unknown scope using approved business input.
3. Provide valid dates for every legacy round.
4. Preserve Competition IDs, embedded round IDs, round order, and progression references in a separately reviewed migration.
5. Apply that reviewed migration before the strict application release.
6. Verify the audit reports zero invalid records.
7. Deploy the strict Competition schema and validators.

The audit tool does not guess scope mappings or missing dates and does not make Phase A immediately deployable.

---

## 6. Summary of Other API Endpoints

### Auth Endpoints (`/api/auth`)
- `POST /api/auth/register` - Student registration (body: `username`, `name`, `email`, `password`, `phone`)
- `POST /api/auth/login` - User login (body: `identifier` [email or username], `password`)
- `POST /api/auth/google` - Google OAuth authentication (body: `idToken`)
- `POST /api/auth/verify-email` - Email verification (body: `token`)
- `POST /api/auth/forgot-password` - Request password reset (body: `email`)
- `POST /api/auth/reset-password` - Reset password (body: `token`, `newPassword`)
- `GET /api/auth/me` - Get current user profile (Bearer token)

### Enrollment Endpoints (`/api/enrollments`)
- `POST /api/enrollments` - Submit course enrollment (`multipart/form-data` or JSON body with `courseId`, `fullName`, `email`, `phone`, `grade`, `siteId`, `academicFile`)
- `GET /api/enrollments/my` - Get student's enrollments (Bearer token)

### Admin Management Endpoints (`/api/admin`)
- `GET /api/admin/dashboard` - Stats summary & recent registrations
- `GET /api/admin/enrollments` - List & search student enrollments
- `PATCH /api/admin/enrollments/:id` - Accept or reject enrollment (body: `status` [`accepted`|`rejected`], `rejectionReason`)
- `GET /api/admin/export/courses` - Download CSV export of all courses
- `GET /api/admin/export/enrollments` - Download CSV export of course enrollments
- `GET /api/admin/export/students` - Download CSV export of registered students

---

## 7. Seed Data & Scripts

- **Seed Courses**:
  ```bash
  npm run seed:courses
  ```
- **Seed Admin User**:
  ```bash
  npm run seed:admin
  ```
- **Generate Postman Collection**:
  ```bash
  node scripts/generate-postman.js
  ```
