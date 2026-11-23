const { AgentError, AgentUnavailableError } = require('../src/agentClient');

/** Stands in for the Python service so gateway tests need no Python, Docker or LLM. */
class FakeAgent {
  constructor() {
    this.datasets = new Map();
    this.runs = new Map();
    this.down = false;
    this.lastEventIdSeen = null;
    this.createRunPayloads = [];
    this.n = 0;
  }

  #guard() {
    if (this.down) throw new AgentUnavailableError('fake agent is down');
  }

  async health() {
    this.#guard();
    return { status: 'ok', sandbox_ready: true, llm_configured: true, model: 'fake-model' };
  }

  async uploadDataset(buffer, filename) {
    this.#guard();
    const id = `ds${++this.n}`;
    this.datasets.set(id, { filename, size: buffer.length });
    return { id, filename, size_bytes: buffer.length };
  }

  async getProfile(id) {
    this.#guard();
    if (!this.datasets.has(id)) throw new AgentError(404, 'Dataset not found.');
    return { rows: 3, columns: 2, fields: [] };
  }

  async deleteDataset(id) {
    this.#guard();
    if (!this.datasets.delete(id)) throw new AgentError(404, 'Dataset not found.');
    return null;
  }

  async createRun(payload) {
    this.#guard();
    this.createRunPayloads.push(payload);
    const id = `run${++this.n}`;
    this.runs.set(id, {
      id,
      status: 'running',
      started_at: '2026-11-18T10:00:00+00:00',
      finished_at: null,
      plan: [],
      steps: [],
      files: [],
      llm_calls: 0,
      stop_reason: null,
      error: null,
      report: null,
    });
    return { run_id: id, status: 'queued' };
  }

  async getRun(id) {
    this.#guard();
    const r = this.runs.get(id);
    if (!r) throw new AgentError(404, 'Run not found.');
    return structuredClone(r);
  }

  /** test helper: simulate the agent finishing a run */
  finish(id, patch = {}) {
    Object.assign(this.runs.get(id), {
      status: 'succeeded',
      finished_at: '2026-11-18T10:00:30+00:00',
      plan: [{ title: 'Mean age', goal: 'mean' }],
      steps: [{ index: 1, title: 'Mean age', status: 'approved', caveats: [] }],
      files: ['ages.png', 'notes.html'],
      llm_calls: 4,
      report: '## Summary\nMean age is 32.',
      ...patch,
    });
  }

  async streamEvents(id, lastEventId) {
    this.#guard();
    if (!this.runs.has(id)) throw new AgentError(404, 'Run not found.');
    this.lastEventIdSeen = lastEventId ?? null;
    const enc = new TextEncoder();
    const events = [
      { seq: 0, type: 'profiling_started', data: {} },
      { seq: 1, type: 'run_finished', data: { ok: true } },
    ];
    const stream = new ReadableStream({
      start(controller) {
        for (const ev of events) controller.enqueue(enc.encode(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  }

  async getFile(id, name) {
    this.#guard();
    if (!this.runs.has(id) || name === 'missing.png') throw new AgentError(404, 'File not found.');
    const type = name.endsWith('.png') ? 'image/png' : 'text/html';
    return new Response(Buffer.from(name.endsWith('.png') ? 'PNGDATA' : '<script>alert(1)</script>'), {
      headers: { 'content-type': type },
    });
  }
}

module.exports = { FakeAgent };
