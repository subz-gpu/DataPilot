/**
 * Client for the DataPilot gateway.
 *
 * - The access token lives in memory only; the refresh token is kept in localStorage so a
 *   page reload does not sign the user out.
 * - A 401 triggers one silent token refresh and a retry. Concurrent 401s share one refresh,
 *   because refresh tokens are single-use on the server.
 * - The live event stream is read with fetch (not EventSource) so it can send the
 *   Authorization header, and it reconnects with Last-Event-ID if the connection drops.
 */
import { createSseParser } from './sse.js';

const REFRESH_KEY = 'datapilot.refreshToken';

let baseUrl = (import.meta.env?.VITE_API_URL || '').replace(/\/+$/, '');
let accessToken = null;
let refreshing = null;
let onAuthLost = () => {};

export function configureApi({ baseUrl: url } = {}) {
  if (url !== undefined) baseUrl = url.replace(/\/+$/, '');
}
export function setAuthLostHandler(fn) {
  onAuthLost = fn;
}
export const hasStoredSession = () => Boolean(localStorage.getItem(REFRESH_KEY));

export class ApiError extends Error {
  constructor(status, message, code = 'error', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function saveSession(data) {
  accessToken = data.accessToken;
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
}

function clearSession() {
  accessToken = null;
  localStorage.removeItem(REFRESH_KEY);
}

async function toError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const e = body?.error;
  return new ApiError(res.status, e?.message || res.statusText || 'Request failed', e?.code, e?.details);
}

async function send(path, options) {
  try {
    return await fetch(baseUrl + path, options);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.', 'network');
  }
}

function refreshAccessToken() {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) throw new ApiError(401, 'Please sign in.', 'unauthenticated');
      const res = await send('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          clearSession();
          onAuthLost();
          throw new ApiError(401, 'Your session expired. Please sign in again.', 'session_expired');
        }
        throw await toError(res);
      }
      const data = await res.json();
      saveSession(data);
      return data;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function request(method, path, { body, form, auth = true, blob = false, signal } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = {};
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    const res = await send(path, { method, headers, body: payload, signal });
    if (res.status === 401 && auth && attempt === 0 && hasStoredSession()) {
      await refreshAccessToken();
      continue;
    }
    if (!res.ok) throw await toError(res);
    if (res.status === 204) return null;
    return blob ? res.blob() : res.json();
  }
  throw new ApiError(401, 'Please sign in.', 'unauthenticated');
}

// ---------------------------------------------------------------- session
export async function register({ email, password, name }) {
  const data = await request('POST', '/api/auth/register', { body: { email, password, name }, auth: false });
  saveSession(data);
  return data.user;
}

export async function login({ email, password }) {
  const data = await request('POST', '/api/auth/login', { body: { email, password }, auth: false });
  saveSession(data);
  return data.user;
}

/** Called on page load: turn a stored refresh token back into a signed-in user (or null). */
export async function restoreSession() {
  if (!hasStoredSession()) return null;
  try {
    const data = await refreshAccessToken();
    return data.user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) throw e; // offline: keep the stored session
    return null;
  }
}

export async function logout() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  clearSession();
  if (refreshToken) {
    try {
      await request('POST', '/api/auth/logout', { body: { refreshToken }, auth: false });
    } catch {
      /* signing out locally is enough */
    }
  }
}

// ---------------------------------------------------------------- data
export const listDatasets = () => request('GET', '/api/datasets').then((r) => r.datasets);
export const getProfile = (id) => request('GET', `/api/datasets/${id}/profile`);
export const deleteDataset = (id) => request('DELETE', `/api/datasets/${id}`);
export function uploadDataset(file) {
  const form = new FormData();
  form.append('file', file);
  return request('POST', '/api/datasets', { form });
}
export const discoverDatasets = (query, limit = 10, source = 'huggingface') =>
  request('POST', '/api/datasets/discover', {
    body: { query, limit, source },
  });

export const getDiscoveredDataset = (datasetId, source = 'huggingface') =>
  request(
    'GET',
    `/api/datasets/discover/${encodeURIComponent(datasetId)}?source=${encodeURIComponent(source)}`
  );

export const importDataset = (datasetId, filename, source = 'huggingface') =>
  request('POST', '/api/datasets/import', {
    body: { dataset_id: datasetId, filename, source },
  });

export const createRun = ({ datasetId, objective, options }) =>
  request('POST', '/api/runs', { body: { datasetId, objective, options } });
export const listRuns = () => request('GET', '/api/runs').then((r) => r.runs);
export const getRun = (id) => request('GET', `/api/runs/${id}`);
export const deleteRun = (id) => request('DELETE', `/api/runs/${id}`);
export const getFileBlob = (runId, name) =>
  request('GET', `/api/runs/${runId}/files/${encodeURIComponent(name)}`, { blob: true });

// ---------------------------------------------------------------- live stream
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });

/**
 * Follows a run's event stream until it finishes. Calls onEvent for every event, in order.
 * Resolves when the run has finished or the signal is aborted; rejects if the run cannot be read.
 */
export async function streamRun(runId, { onEvent, signal, retryDelayMs = 1000, maxRetries = 5 }) {
  let lastSeq = -1;
  let finished = false;
  let failures = 0;

  while (!signal?.aborted) {
    try {
      const headers = { Accept: 'text/event-stream' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      if (lastSeq >= 0) headers['Last-Event-ID'] = String(lastSeq);

      const res = await send(`/api/runs/${runId}/events`, { headers, signal });
      if (res.status === 401 && hasStoredSession()) {
        await refreshAccessToken();
        if (++failures > maxRetries) throw new ApiError(401, 'Please sign in again.', 'unauthenticated');
        continue;
      }
      if (!res.ok) throw await toError(res);

      failures = 0;
      const parser = createSseParser((ev) => {
        if (typeof ev.seq === 'number') lastSeq = Math.max(lastSeq, ev.seq);
        if (ev.type === 'run_finished' || ev.type === 'run_error') finished = true;
        onEvent(ev);
      });
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(value);
      }
      if (finished) return;
      // The connection ended before the run did: fall through and reconnect.
    } catch (e) {
      if (signal?.aborted || e?.name === 'AbortError') return;
      if (e instanceof ApiError && [403, 404].includes(e.status)) throw e;
      if (++failures > maxRetries) throw e;
    }
    await sleep(retryDelayMs, signal);
  }
}
