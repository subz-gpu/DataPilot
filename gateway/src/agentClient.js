/** HTTP client for the Python agent service. Only the gateway talks to it. */

class AgentError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : 'Agent service error');
    this.status = status;
    this.detail = detail;
  }

  static async from(resp) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    if (Array.isArray(detail)) detail = detail.map((d) => d.msg || JSON.stringify(d)).join('; ');
    return new AgentError(resp.status, detail);
  }
}

class AgentUnavailableError extends Error {}

class AgentClient {
  constructor({ baseUrl, apiKey, timeoutMs = 30_000 }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async #call(path, { method = 'GET', body, headers = {}, signal, timeoutMs } = {}) {
    const h = { ...headers };
    if (this.apiKey) h['X-API-Key'] = this.apiKey;
    try {
      return await fetch(this.baseUrl + path, {
        method,
        body,
        headers: h,
        signal: signal ?? AbortSignal.timeout(timeoutMs ?? this.timeoutMs),
      });
    } catch (e) {
      if (e?.name === 'AbortError' && signal) throw e; // the caller cancelled on purpose
      throw new AgentUnavailableError(`Cannot reach the analysis service (${e?.cause?.code || e.message}).`);
    }
  }

  async #json(path, opts) {
    const r = await this.#call(path, opts);
    if (!r.ok) throw await AgentError.from(r);
    return r.status === 204 ? null : r.json();
  }

  health() {
    return this.#json('/api/health', { timeoutMs: 3000 });
  }
    discoverDatasets(query, limit = 10) {
    return this.#json('/api/datasets/discover', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: 120_000,
    });
  }

  getDiscoveredDataset(datasetId) {
    return this.#json(
      `/api/datasets/discover/${encodeURIComponent(datasetId)}`,
      { timeoutMs: 60_000 }
    );
  }

  importHuggingFaceDataset(datasetId, filename) {
    return this.#json('/api/datasets/import', {
      method: 'POST',
      body: JSON.stringify({ dataset_id: datasetId, filename }),
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: 120_000,
    });
  }

  uploadDataset(buffer, filename, mimetype) {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimetype || 'application/octet-stream' }), filename);
    return this.#json('/api/datasets', { method: 'POST', body: form, timeoutMs: 120_000 });
  }

  getProfile(datasetId) {
    return this.#json(`/api/datasets/${encodeURIComponent(datasetId)}/profile`, { timeoutMs: 60_000 });
  }

  deleteDataset(datasetId) {
    return this.#json(`/api/datasets/${encodeURIComponent(datasetId)}`, { method: 'DELETE' });
  }

  createRun(payload) {
    return this.#json('/api/runs', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  getRun(runId) {
    return this.#json(`/api/runs/${encodeURIComponent(runId)}`);
  }

  async streamEvents(runId, lastEventId, signal) {
    const headers = lastEventId ? { 'Last-Event-ID': String(lastEventId) } : {};
    const r = await this.#call(`/api/runs/${encodeURIComponent(runId)}/events`, { headers, signal: signal ?? new AbortController().signal });
    if (!r.ok) throw await AgentError.from(r);
    return r;
  }

  async getFile(runId, name, signal) {
    const r = await this.#call(`/api/runs/${encodeURIComponent(runId)}/files/${encodeURIComponent(name)}`, {
      signal: signal ?? AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw await AgentError.from(r);
    return r;
  }
}

module.exports = { AgentClient, AgentError, AgentUnavailableError };
