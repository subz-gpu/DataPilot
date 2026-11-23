const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const { startServer } = require('../testsupport/helpers');

describe('datasets', () => {
  let s, alice, bob;
  before(async () => {
    s = await startServer();
    alice = await s.register('alice@example.com');
    bob = await s.register('bob@example.com');
  });
  after(() => s.close());

  it('requires authentication', async () => {
    assert.equal((await s.call('POST', '/api/datasets', { form: s.csvForm() })).status, 401);
    assert.equal((await s.call('GET', '/api/datasets')).status, 401);
  });

  it('uploads through to the agent and records ownership', async () => {
    const r = await s.call('POST', '/api/datasets', { token: alice.accessToken, form: s.csvForm('sales.csv') });
    assert.equal(r.status, 201);
    assert.equal(r.json.filename, 'sales.csv');
    assert.ok(r.json.sizeBytes > 0);
    assert.equal(r.json.agentDatasetId, undefined); // internal ids stay internal
    assert.equal(s.agent.datasets.size > 0, true);
  });

  it('lists only the caller\'s datasets and hides others\' (404, not 403)', async () => {
    const mine = await s.uploadDataset(alice.accessToken, 'mine.csv');
    const list = await s.call('GET', '/api/datasets', { token: alice.accessToken });
    assert.ok(list.json.datasets.some((d) => d.id === mine.id));
    const bobList = await s.call('GET', '/api/datasets', { token: bob.accessToken });
    assert.ok(!bobList.json.datasets.some((d) => d.id === mine.id));

    assert.equal((await s.call('GET', `/api/datasets/${mine.id}`, { token: bob.accessToken })).status, 404);
    assert.equal((await s.call('GET', `/api/datasets/${mine.id}/profile`, { token: bob.accessToken })).status, 404);
    assert.equal((await s.call('DELETE', `/api/datasets/${mine.id}`, { token: bob.accessToken })).status, 404);
    assert.equal((await s.call('GET', `/api/datasets/${mine.id}`, { token: alice.accessToken })).status, 200);
  });

  it('proxies the profile', async () => {
    const ds = await s.uploadDataset(alice.accessToken);
    const p = await s.call('GET', `/api/datasets/${ds.id}/profile`, { token: alice.accessToken });
    assert.equal(p.status, 200);
    assert.equal(p.json.rows, 3);
  });

  it('validates uploads: missing file, bad type, too large', async () => {
    const none = await s.call('POST', '/api/datasets', { token: alice.accessToken, form: new FormData() });
    assert.equal(none.status, 400);
    assert.equal(none.json.error.code, 'no_file');
    const exe = await s.call('POST', '/api/datasets', { token: alice.accessToken, form: s.csvForm('evil.exe') });
    assert.equal(exe.status, 415);
    const big = await s.call('POST', '/api/datasets', {
      token: alice.accessToken,
      form: s.csvForm('big.csv', 'x'.repeat(1.5 * 1024 * 1024)),
    });
    assert.equal(big.status, 413);
  });

  it('deletes a dataset', async () => {
    const ds = await s.uploadDataset(alice.accessToken);
    assert.equal((await s.call('DELETE', `/api/datasets/${ds.id}`, { token: alice.accessToken })).status, 204);
    assert.equal((await s.call('GET', `/api/datasets/${ds.id}`, { token: alice.accessToken })).status, 404);
  });

  it('returns 502 when the analysis service is down', async () => {
    s.agent.down = true;
    const r = await s.call('POST', '/api/datasets', { token: alice.accessToken, form: s.csvForm() });
    s.agent.down = false;
    assert.equal(r.status, 502);
    assert.equal(r.json.error.code, 'agent_unavailable');
  });
});
