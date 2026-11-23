const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const { startServer, testConfig } = require('../testsupport/helpers');

describe('runs', () => {
  let s, alice, bob, ds;
  before(async () => {
    s = await startServer();
    alice = await s.register('alice@example.com');
    bob = await s.register('bob@example.com');
    ds = await s.uploadDataset(alice.accessToken);
  });
  after(() => s.close());

  const start = (token, datasetId, objective = 'What is the mean age?', extra = {}) =>
    s.call('POST', '/api/runs', { token, body: { datasetId, objective, ...extra } });

  async function finishAndSync(token, run) {
    const remoteId = [...s.agent.runs.keys()].pop();
    s.agent.finish(remoteId);
    return s.call('GET', `/api/runs/${run.id}`, { token });
  }

  it('starts a run on an owned dataset and maps options for the agent', async () => {
    const r = await start(alice.accessToken, ds.id, 'What is the mean age?', { options: { maxSteps: 2, maxLlmCalls: 10 } });
    assert.equal(r.status, 202);
    assert.equal(r.json.status, 'queued');
    assert.equal(r.json.agentRunId, undefined);
    const sent = s.agent.createRunPayloads.at(-1);
    assert.equal(sent.max_steps, 2);
    assert.equal(sent.max_llm_calls, 10);
    assert.ok(sent.dataset_id.startsWith('ds')); // the agent's id, not the gateway's
    await finishAndSync(alice.accessToken, r.json);
  });

  it('refuses unknown datasets, other users\' datasets and invalid input', async () => {
    assert.equal((await start(alice.accessToken, 'ffffffffffffffffffffffff')).status, 404);
    assert.equal((await start(bob.accessToken, ds.id)).status, 404);
    const short = await start(alice.accessToken, ds.id, 'hi');
    assert.equal(short.status, 400);
    const tooMany = await start(alice.accessToken, ds.id, 'valid objective', { options: { maxLlmCalls: 9999 } });
    assert.equal(tooMany.status, 400);
    assert.equal((await s.call('POST', '/api/runs', { body: { datasetId: ds.id, objective: 'valid objective' } })).status, 401);
  });

  it('allows one active run per user, and frees the slot once it finishes', async () => {
    const first = await start(alice.accessToken, ds.id);
    assert.equal(first.status, 202);
    const second = await start(alice.accessToken, ds.id);
    assert.equal(second.status, 429);
    assert.equal(second.json.error.code, 'run_in_progress');

    const done = await finishAndSync(alice.accessToken, first.json);
    assert.equal(done.json.status, 'succeeded');
    assert.match(done.json.report, /Mean age is 32/);
    assert.equal((await start(alice.accessToken, ds.id)).status, 202);
    await finishAndSync(alice.accessToken, (await s.call('GET', '/api/runs', { token: alice.accessToken })).json.runs[0]);
  });

  it('hides runs from other users', async () => {
    const run = (await start(bob.accessToken, (await s.uploadDataset(bob.accessToken)).id)).json;
    assert.equal((await s.call('GET', `/api/runs/${run.id}`, { token: alice.accessToken })).status, 404);
    assert.equal((await s.call('GET', `/api/runs/${run.id}/events`, { token: alice.accessToken })).status, 404);
    assert.equal((await s.call('GET', `/api/runs/${run.id}/files/ages.png`, { token: alice.accessToken })).status, 404);
    assert.equal((await s.call('DELETE', `/api/runs/${run.id}`, { token: alice.accessToken })).status, 404);
    const list = await s.call('GET', '/api/runs', { token: alice.accessToken });
    assert.ok(!list.json.runs.some((r) => r.id === run.id));
    await finishAndSync(bob.accessToken, run);
  });

  it('lists runs (without the report) with fresh status', async () => {
    const list = await s.call('GET', '/api/runs', { token: alice.accessToken });
    assert.equal(list.status, 200);
    assert.ok(list.json.runs.length >= 2);
    assert.equal(list.json.runs[0].report, undefined);
  });

  it('enforces a daily run limit', async () => {
    const lim = await startServer({ cfg: testConfig({ dailyRunLimit: 1 }) });
    const t = await lim.register('limit@example.com');
    const d = await lim.uploadDataset(t.accessToken);
    const r1 = await lim.call('POST', '/api/runs', { token: t.accessToken, body: { datasetId: d.id, objective: 'first run here' } });
    assert.equal(r1.status, 202);
    lim.agent.finish([...lim.agent.runs.keys()][0]);
    await lim.call('GET', `/api/runs/${r1.json.id}`, { token: t.accessToken });
    const r2 = await lim.call('POST', '/api/runs', { token: t.accessToken, body: { datasetId: d.id, objective: 'second run here' } });
    await lim.close();
    assert.equal(r2.status, 429);
    assert.equal(r2.json.error.code, 'daily_limit');
  });

  it('relays the event stream, accepts ?access_token=, forwards Last-Event-ID, and saves the final state', async () => {
    const d = await s.uploadDataset(bob.accessToken);
    const run = (await start(bob.accessToken, d.id)).json;
    const remoteId = [...s.agent.runs.keys()].pop();
    s.agent.finish(remoteId);

    assert.equal((await s.call('GET', `/api/runs/${run.id}/events`)).status, 401);

    const res = await s.call('GET', `/api/runs/${run.id}/events?access_token=${bob.accessToken}`, {
      raw: true,
      headers: { 'Last-Event-ID': '7' },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const body = await res.text();
    assert.match(body, /"type": ?"profiling_started"/);
    assert.match(body, /"type": ?"run_finished"/);
    assert.equal(s.agent.lastEventIdSeen, '7');

    // the gateway persists the final state when the stream ends
    await new Promise((r) => setTimeout(r, 100));
    const stored = await s.store.getRun(run.id, bob.user.id);
    assert.equal(stored.status, 'succeeded');
    assert.match(stored.report, /Mean age is 32/);
  });

  it('serves charts inline and everything else as a sandboxed download', async () => {
    const d = await s.uploadDataset(bob.accessToken);
    const run = (await start(bob.accessToken, d.id)).json;
    s.agent.finish([...s.agent.runs.keys()].pop());

    const img = await s.call('GET', `/api/runs/${run.id}/files/ages.png?access_token=${bob.accessToken}`, { raw: true });
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.match(img.headers.get('content-disposition'), /^inline/);
    assert.match(img.headers.get('content-security-policy'), /sandbox/);
    assert.equal(await img.text(), 'PNGDATA');

    const html = await s.call('GET', `/api/runs/${run.id}/files/notes.html`, { token: bob.accessToken, raw: true });
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-disposition'), /^attachment/);

    assert.equal((await s.call('GET', `/api/runs/${run.id}/files/missing.png`, { token: bob.accessToken })).status, 404);
    assert.equal((await s.call('GET', `/api/runs/${run.id}/files/..%2Fsecret`, { token: bob.accessToken })).status, 404);
    assert.equal((await s.call('GET', `/api/runs/${run.id}/files/.hidden`, { token: bob.accessToken })).status, 404);
  });

  it('only deletes finished runs', async () => {
    const d = await s.uploadDataset(bob.accessToken);
    const run = (await start(bob.accessToken, d.id)).json;
    const busy = await s.call('DELETE', `/api/runs/${run.id}`, { token: bob.accessToken });
    assert.equal(busy.status, 409);
    s.agent.finish([...s.agent.runs.keys()].pop());
    assert.equal((await s.call('DELETE', `/api/runs/${run.id}`, { token: bob.accessToken })).status, 204);
    assert.equal((await s.call('GET', `/api/runs/${run.id}`, { token: bob.accessToken })).status, 404);
  });

  it('marks a run as errored if the agent lost it, and survives an agent outage', async () => {
    const d = await s.uploadDataset(bob.accessToken);
    const run = (await start(bob.accessToken, d.id)).json;

    s.agent.down = true; // outage: keep last known state, do not fail the request
    const during = await s.call('GET', `/api/runs/${run.id}`, { token: bob.accessToken });
    s.agent.down = false;
    assert.equal(during.status, 200);
    assert.equal(during.json.status, 'queued');

    s.agent.runs.clear(); // the agent forgot the run (e.g. its data was wiped)
    const lost = await s.call('GET', `/api/runs/${run.id}`, { token: bob.accessToken });
    assert.equal(lost.json.status, 'error');
    assert.match(lost.json.error, /no longer available/);
  });

  it('returns 502 on create when the agent is down', async () => {
    const d = await s.uploadDataset(bob.accessToken);
    s.agent.down = true;
    const r = await start(bob.accessToken, d.id);
    s.agent.down = false;
    assert.equal(r.status, 502);
  });

  it('reports health including the analysis service', async () => {
    const h = await s.call('GET', '/api/health');
    assert.equal(h.status, 200);
    assert.equal(h.json.analysis.reachable, true);
    assert.equal(h.json.store, 'memory');
    s.agent.down = true;
    const down = await s.call('GET', '/api/health');
    s.agent.down = false;
    assert.equal(down.json.analysis.reachable, false);
  });
});
