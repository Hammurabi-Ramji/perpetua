const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const request = require('supertest');

describe('LicenseVault backend API', () => {
  let createApp;
  let closeDatabase;
  let databaseDir;
  let app;
  let token;

  beforeAll(async () => {
    databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'licensevault-tests-'));

    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.SESSION_SECRET = 'test-session-secret';
    process.env.DATABASE_PATH = path.join(databaseDir, 'licensevault.test.db');

    for (const modulePath of ['../app', '../database', '../auth/passport']) {
      const resolved = require.resolve(modulePath, { paths: [__dirname] });
      delete require.cache[resolved];
    }

    ({ createApp } = require('../app'));
    ({ closeDatabase } = require('../database'));
    app = await createApp();
  });

  afterAll(async () => {
    if (closeDatabase) {
      await closeDatabase();
    }

    if (databaseDir) {
      fs.rmSync(databaseDir, { recursive: true, force: true });
    }
  });

  it('responds to the health endpoint', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('registers, logs in, and returns the current user', async () => {
    const email = 'suite@example.com';
    const password = 'Secret123!';

    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({ email, password, masterKey: 'abc' });

    expect(registerResponse.status).toBe(200);
    expect(registerResponse.body.user.email).toBe(email);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.email).toBe(email);

    token = loginResponse.body.token;

    const meResponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe(email);
  });

  it('creates and retrieves a license', async () => {
    const createResponse = await request(app)
      .post('/api/licenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        product_name: 'Lifetime Test Suite',
        license_key: 'AAAA-BBBB-CCCC-DDDD',
        purchase_date: '2026-01-01',
        expiry_date: '2026-12-31',
        product_url: 'https://example.com/product'
      });

    expect(createResponse.status).toBe(201);

    const detailResponse = await request(app)
      .get(`/api/licenses/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.product_name).toBe('Lifetime Test Suite');
  });

  it('keeps export and expiring routes reachable instead of shadowing them with /:id', async () => {
    const exportResponse = await request(app)
      .get('/api/licenses/export/csv')
      .set('Authorization', `Bearer ${token}`);

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers['content-type']).toContain('text/csv');
    expect(exportResponse.text).toContain('Product Name');

    const expiringResponse = await request(app)
      .get('/api/licenses/expiring/soon?days=400')
      .set('Authorization', `Bearer ${token}`);

    expect(expiringResponse.status).toBe(200);
    expect(Array.isArray(expiringResponse.body)).toBe(true);
  });

  it('allows browser clients to preflight PATCH requests', async () => {
    const response = await request(app)
      .options('/api/licenses/1/action')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PATCH');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('PATCH');
  });
});
