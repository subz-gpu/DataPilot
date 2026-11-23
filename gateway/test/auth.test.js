const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const jwt = require('jsonwebtoken');
const { startServer, testConfig } = require('../testsupport/helpers');

describe('auth', () => {
  let s;
  before(async () => {
    s = await startServer();
  });
  after(() => s.close());

  it('registers a user and returns tokens (never the password hash)', async () => {
    const r = await s.call('POST', '/api/auth/register', {
      body: { email: 'New@Example.com', password: 'GoodPassword1!', name: 'New' },
    });
    assert.equal(r.status, 201);
    assert.ok(r.json.accessToken && r.json.refreshToken);
    assert.equal(r.json.user.email, 'new@example.com'); // normalised
    assert.equal(r.json.user.passwordHash, undefined);
    assert.ok(!r.text.includes('passwordHash'));
  });

  it('rejects duplicate emails, weak passwords and bad emails', async () => {
    await s.register('dup@example.com');
    assert.equal((await s.call('POST', '/api/auth/register', { body: { name: 'Duplicate', email: 'DUP@example.com', password: 'AnotherPassword1!' } })).status, 409);
    const weak = await s.call('POST', '/api/auth/register', { body: { name: 'Weak User', email: 'w@example.com', password: 'short' } });
    assert.equal(weak.status, 400);
    assert.equal(weak.json.error.code, 'validation_error');
    assert.equal((await s.call('POST', '/api/auth/register', { body: { name: 'Bad Email', email: 'not-an-email', password: 'long-enough-pw' } })).status, 400);
    const longPw = await s.call('POST', '/api/auth/register', { body: { name: 'Long Password', email: 'l@example.com', password: 'Ã©'.repeat(50) } });
    assert.equal(longPw.status, 400); // more than 72 bytes
  });

  it('logs in with the right password; same error for wrong password and unknown email', async () => {
    await s.register('login@example.com', 'RightPassword1!');
    const ok = await s.call('POST', '/api/auth/login', { body: { email: 'login@example.com', password: 'RightPassword1!' } });
    assert.equal(ok.status, 200);
    const wrong = await s.call('POST', '/api/auth/login', { body: { email: 'login@example.com', password: 'wrong-password-1' } });
    const unknown = await s.call('POST', '/api/auth/login', { body: { email: 'ghost@example.com', password: 'wrong-password-1' } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.json.error.message, unknown.json.error.message);
  });

  it('protects /me and rejects missing, tampered and expired tokens', async () => {
    const t = await s.register('me@example.com');
    assert.equal((await s.call('GET', '/api/auth/me')).status, 401);
    const me = await s.call('GET', '/api/auth/me', { token: t.accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.json.email, 'me@example.com');
    assert.equal((await s.call('GET', '/api/auth/me', { token: t.accessToken + 'x' })).status, 401);
    const expired = jwt.sign({ sub: t.user.id }, s.cfg.jwtSecret, { expiresIn: -10 });
    assert.equal((await s.call('GET', '/api/auth/me', { token: expired })).status, 401);
    const wrongSecret = jwt.sign({ sub: t.user.id }, 'y'.repeat(48));
    assert.equal((await s.call('GET', '/api/auth/me', { token: wrongSecret })).status, 401);
    const noneAlg = jwt.sign({ sub: t.user.id }, '', { algorithm: 'none' });
    assert.equal((await s.call('GET', '/api/auth/me', { token: noneAlg })).status, 401);
  });

  it('rotates refresh tokens: each can be used once', async () => {
    const t = await s.register('rotate@example.com');
    const r1 = await s.call('POST', '/api/auth/refresh', { body: { refreshToken: t.refreshToken } });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.json.refreshToken, t.refreshToken);
    assert.equal((await s.call('POST', '/api/auth/refresh', { body: { refreshToken: t.refreshToken } })).status, 401);
    assert.equal((await s.call('POST', '/api/auth/refresh', { body: { refreshToken: r1.json.refreshToken } })).status, 200);
  });

  it('logout invalidates the refresh token', async () => {
    const t = await s.register('logout@example.com');
    assert.equal((await s.call('POST', '/api/auth/logout', { body: { refreshToken: t.refreshToken } })).status, 204);
    assert.equal((await s.call('POST', '/api/auth/refresh', { body: { refreshToken: t.refreshToken } })).status, 401);
  });

  it('returns JSON errors for bad JSON and unknown routes', async () => {
    const bad = await s.call('POST', '/api/auth/login', { body: undefined, headers: { 'Content-Type': 'application/json' } });
    assert.ok(bad.status === 400);
    const nf = await s.call('GET', '/api/nope');
    assert.equal(nf.status, 404);
    assert.equal(nf.json.error.code, 'not_found');
  });

  it('rate limits auth endpoints', async () => {
    const limited = await startServer({ cfg: testConfig({ authRateLimit: 3 }) });
    const codes = [];
    for (let i = 0; i < 5; i++) {
      codes.push((await limited.call('POST', '/api/auth/login', { body: { email: 'a@b.com', password: 'whatever1' } })).status);
    }
    await limited.close();
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  });
});


