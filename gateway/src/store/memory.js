const crypto = require('node:crypto');
const { DuplicateError } = require('../errors');

const newId = () => crypto.randomBytes(12).toString('hex');
const clone = (o) => (o ? structuredClone(o) : null);

/** In-memory store: used by tests and for a no-database quick start (STORE=memory). */
function createMemoryStore() {
  const users = new Map();
  const tokens = new Map();
  const datasets = new Map();
  const runs = new Map();

  const newestFirst = (map, pred) => [...map.values()].filter(pred).reverse();

  return {
    kind: 'memory',
    async close() {},

    // users
    async createUser({ email, name, passwordHash }) {
      for (const u of users.values()) if (u.email === email) throw new DuplicateError('email');
      const user = { id: newId(), email, name: name || '', passwordHash, createdAt: new Date() };
      users.set(user.id, user);
      return clone(user);
    },
    async findUserByEmail(email) {
      for (const u of users.values()) if (u.email === email) return clone(u);
      return null;
    },
    async findUserById(id) {
      return clone(users.get(id));
    },

    // refresh tokens
    async saveRefreshToken({ userId, tokenHash, expiresAt }) {
      tokens.set(tokenHash, { userId, tokenHash, expiresAt, createdAt: new Date() });
    },
    async findRefreshToken(tokenHash) {
      const t = tokens.get(tokenHash);
      if (!t) return null;
      if (t.expiresAt <= new Date()) {
        tokens.delete(tokenHash);
        return null;
      }
      return clone(t);
    },
    async deleteRefreshToken(tokenHash) {
      return tokens.delete(tokenHash); // true only for the caller that actually removed it
    },

    // datasets
    async createDataset({ ownerId, agentDatasetId, filename, sizeBytes }) {
      const d = { id: newId(), ownerId, agentDatasetId, filename, sizeBytes, createdAt: new Date() };
      datasets.set(d.id, d);
      return clone(d);
    },
    async getDataset(id, ownerId) {
      const d = datasets.get(id);
      return d && d.ownerId === ownerId ? clone(d) : null;
    },
    async listDatasets(ownerId, limit = 100) {
      return newestFirst(datasets, (d) => d.ownerId === ownerId).slice(0, limit).map(clone);
    },
    async countDatasets(ownerId) {
    return [...datasets.values()].filter(
    (d) => d.ownerId === ownerId
    ).length;
    },
    async deleteDataset(id, ownerId) {
      const d = datasets.get(id);
      if (!d || d.ownerId !== ownerId) return false;
      return datasets.delete(id);
    },

    // runs
    async createRun(doc) {
      const r = {
        status: 'queued',
        plan: [],
        steps: [],
        files: [],
        report: null,
        error: null,
        llmCalls: 0,
        ...doc,
        id: newId(),
        createdAt: new Date(),
      };
      runs.set(r.id, r);
      return clone(r);
    },
    async getRun(id, ownerId) {
      const r = runs.get(id);
      return r && r.ownerId === ownerId ? clone(r) : null;
    },
    async listRuns(ownerId, limit = 50) {
      return newestFirst(runs, (r) => r.ownerId === ownerId).slice(0, limit).map(clone);
    },
    async updateRun(id, patch) {
      const r = runs.get(id);
      if (!r) return null;
      Object.assign(r, patch);
      return clone(r);
    },
    async countRuns(ownerId, { statusIn, since } = {}) {
      return newestFirst(
        runs,
        (r) =>
          r.ownerId === ownerId &&
          (!statusIn || statusIn.includes(r.status)) &&
          (!since || r.createdAt >= since)
      ).length;
    },
    async countReports(ownerId) {
  return [...runs.values()].filter(
    (r) =>
      r.ownerId === ownerId &&
      typeof r.report === 'string' &&
      r.report.trim().length > 0
  ).length;
},
    async deleteRun(id, ownerId) {
      const r = runs.get(id);
      if (!r || r.ownerId !== ownerId) return false;
      return runs.delete(id);
    },
  };
}

module.exports = { createMemoryStore };
