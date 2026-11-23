const { createApp } = require('../src/app');
const { createMemoryStore } = require('../src/store/memory');
const { FakeAgent } = require('./fakeAgent');

function testConfig(overrides = {}) {
  return {
    port: 0,
    storeKind: 'memory',
    jwtSecret: 'x'.repeat(48),
    accessTtlSeconds: 900,
    refreshTtlDays: 30,
    agentUrl: '',
    agentApiKey: '',
    corsOrigins: ['http://localhost:5173'],
    maxUploadMb: 1,
    maxActiveRunsPerUser: 1,
    dailyRunLimit: 20,
    maxLlmCallsPerRun: 30,
    authRateLimit: 0,
    trustProxy: false,
    ...overrides,
  };
}

async function startServer({ cfg, store, agent } = {}) {
  cfg = cfg || testConfig();
  store = store || createMemoryStore();
  agent = agent || new FakeAgent();
  const app = createApp({ cfg, store, agent });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { token, body, form, headers = {}, raw = false } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      payload = JSON.stringify(body);
      h['Content-Type'] = 'application/json';
    }
    const res = await fetch(base + path, { method, headers: h, body: payload });
    if (raw) return res;
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, json, text, headers: res.headers };
  }

  async function register(email = 'ada@example.com', password = 'CorrectHorseBattery9!') {
    const r = await call('POST', '/api/auth/register', { body: { email, password, name: 'Test' } });
    if (r.status !== 201) throw new Error(`register failed: ${r.status} ${r.text}`);
    return r.json;
  }

  function csvForm(name = 'people.csv', content = 'name,age\nAsha,30\nBen,25\nChitra,41\n') {
    const form = new FormData();
    form.append('file', new Blob([content], { type: 'text/csv' }), name);
    return form;
  }

  async function uploadDataset(token, name) {
    const r = await call('POST', '/api/datasets', { token, form: csvForm(name) });
    if (r.status !== 201) throw new Error(`upload failed: ${r.status} ${r.text}`);
    return r.json;
  }

  const close = () => new Promise((resolve) => server.close(resolve));
  return { base, call, register, csvForm, uploadDataset, close, cfg, store, agent };
}

module.exports = { testConfig, startServer };

