/**
 * Tests the full admin flow:
 *   1. Login as the seeded admin
 *   2. Use the JWT to create a second admin via POST /api/admin/admins
 *
 * Run:  node scripts/test-admin-flow.js
 */
const http = require('http');

const BASE = 'http://localhost:5000';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method, headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('  STEP 1 — Login as admin@elearning.com');
  console.log('═══════════════════════════════════════════════════\n');

  const login = await request('POST', '/api/auth/login', {
    email: 'admin@elearning.com',
    password: 'Admin@12345',
  });

  console.log(`Status: ${login.status}`);
  console.log('Response:', JSON.stringify(login.body, null, 2));

  if (login.status !== 200 || !login.body.data?.token) {
    console.error('\n❌ Login failed — cannot continue.');
    process.exit(1);
  }

  const token = login.body.data.token;
  console.log(`\n✅ Token received: ${token.substring(0, 30)}...`);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  STEP 2 — Create a second admin using the token');
  console.log('═══════════════════════════════════════════════════\n');

  const create = await request('POST', '/api/admin/admins', {
    name: 'Second Admin',
    username: 'secondadmin',
    email: 'secondadmin@elearning.com',
    password: 'SecondAdmin@123',
  }, token);

  console.log(`Status: ${create.status}`);
  console.log('Response:', JSON.stringify(create.body, null, 2));

  if (create.status === 201) {
    console.log('\n✅ Second admin created successfully!');
  } else {
    console.log('\n❌ Failed to create second admin.');
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  STEP 3 — Verify: Login as the new admin');
  console.log('═══════════════════════════════════════════════════\n');

  const login2 = await request('POST', '/api/auth/login', {
    email: 'secondadmin@elearning.com',
    password: 'SecondAdmin@123',
  });

  console.log(`Status: ${login2.status}`);
  console.log('Response:', JSON.stringify(login2.body, null, 2));

  if (login2.status === 200) {
    console.log('\n✅ New admin can log in — flow is fully working!');
  } else {
    console.log('\n❌ New admin login failed.');
  }
})().catch((err) => {
  console.error('❌ Test error:', err.message);
  process.exit(1);
});
