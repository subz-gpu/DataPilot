import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../src/lib/api.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tokens = (n) => ({ accessToken: `access${n}`, refreshToken: `refresh${n}`, expiresIn: 900, user: { id: 'u1', email: 'a@b.com' } });

function sseResponse(events, { close = true } = {}) {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const ev of events) c.enqueue(enc.encode(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`));
        if (close) c.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  api.configureApi({ baseUrl: '' });
  api.setAuthLostHandler(() => {});
});

describe('session', () => {
  it('stores tokens on login and sends the access token on later calls', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(200, tokens(1)))
      .mockResolvedValueOnce(json(200, { datasets: [] }));
    await api.login({ email: 'a@b.com', password: 'secret-password' });
    expect(localStorage.getItem('datapilot.refreshToken')).toBe('refresh1');
    await api.listDatasets();
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer access1');
  });

  it('refreshes once and retries when a call returns 401', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(200, tokens(1)));
    await api.login({ email: 'a@b.com', password: 'secret-password' });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'invalid_token', message: 'expired' } }))
      .mockResolvedValueOnce(json(200, tokens(2)))
      .mockResolvedValueOnce(json(200, { datasets: [{ id: 'd1' }] }));
    const result = await api.listDatasets();
    expect(result).toEqual([{ id: 'd1' }]);
    expect(localStorage.getItem('datapilot.refreshToken')).toBe('refresh2');
    expect(fetchMock.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer access2');
  });

  it('shares one refresh between simultaneous 401s (refresh tokens are single-use)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(200, tokens(1)));
    await api.login({ email: 'a@b.com', password: 'secret-password' });
    fetchMock.mockImplementation(async (url, opts) => {
      if (url.endsWith('/api/auth/refresh')) return json(200, tokens(2));
      return opts.headers.Authorization === 'Bearer access2'
        ? json(200, { datasets: [], runs: [] })
        : json(401, { error: { code: 'invalid_token', message: 'expired' } });
    });
    await Promise.all([api.listDatasets(), api.listRuns(), api.listDatasets()]);
    const refreshCalls = fetchMock.mock.calls.filter(([u]) => u.endsWith('/api/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('signs the user out when the refresh token is rejected', async () => {
    const lost = vi.fn();
    api.setAuthLostHandler(lost);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(200, tokens(1)));
    await api.login({ email: 'a@b.com', password: 'secret-password' });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { message: 'expired' } }))
      .mockResolvedValueOnce(json(401, { error: { code: 'invalid_refresh', message: 'bad' } }));
    await expect(api.listRuns()).rejects.toMatchObject({ code: 'session_expired' });
    expect(lost).toHaveBeenCalled();
    expect(localStorage.getItem('datapilot.refreshToken')).toBeNull();
  });

  it('turns server error bodies and network failures into readable errors', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(429, { error: { code: 'run_in_progress', message: 'You already have an analysis running.' } }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.createRun({ datasetId: 'd', objective: 'something' })).rejects.toMatchObject({
      status: 429,
      code: 'run_in_progress',
      message: 'You already have an analysis running.',
    });
    await expect(api.listRuns()).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('restores a session from a stored refresh token, and returns null without one', async () => {
    expect(await api.restoreSession()).toBeNull();
    localStorage.setItem('datapilot.refreshToken', 'stored');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(200, tokens(5)));
    const user = await api.restoreSession();
    expect(user.email).toBe('a@b.com');
  });
});

describe('streamRun', () => {
  const events = [
    { seq: 0, type: 'profiling_started', data: {} },
    { seq: 1, type: 'plan_created', data: { plan: [] } },
    { seq: 2, type: 'run_finished', data: { ok: true } },
  ];

  it('delivers every event in order and stops after the run finishes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(sseResponse(events));
    const seen = [];
    await api.streamRun('r1', { onEvent: (e) => seen.push(e.type), signal: new AbortController().signal });
    expect(seen).toEqual(['profiling_started', 'plan_created', 'run_finished']);
  });

  it('reconnects with Last-Event-ID when the connection drops mid-run', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(sseResponse(events.slice(0, 2)))
      .mockResolvedValueOnce(sseResponse(events.slice(2)));
    const seen = [];
    await api.streamRun('r1', { onEvent: (e) => seen.push(e.seq), signal: new AbortController().signal, retryDelayMs: 1 });
    expect(seen).toEqual([0, 1, 2]);
    expect(fetchMock.mock.calls[1][1].headers['Last-Event-ID']).toBe('1');
  });

  it('gives up with an error when the run does not exist', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(404, { error: { message: 'Run not found.' } }));
    await expect(api.streamRun('nope', { onEvent() {}, signal: new AbortController().signal })).rejects.toMatchObject({ status: 404 });
  });

  it('stops quietly when the caller aborts', async () => {
    const ac = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      ac.abort();
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    await expect(api.streamRun('r1', { onEvent() {}, signal: ac.signal })).resolves.toBeUndefined();
  });
});
