const { MongoClient, ObjectId } = require('mongodb');
const { DuplicateError } = require('../errors');

const toOid = (id) => (typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id) ? new ObjectId(id) : null);

function fromDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

function dbNameFromUri(uri) {
  try {
    const name = new URL(uri).pathname.replace(/^\//, '');
    return name || 'datapilot';
  } catch {
    return 'datapilot';
  }
}

async function createMongoStore(uri, dbName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(dbName || dbNameFromUri(uri));

  const users = db.collection('users');
  const tokens = db.collection('refreshTokens');
  const datasets = db.collection('datasets');
  const runs = db.collection('runs');

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    tokens.createIndex({ tokenHash: 1 }, { unique: true }),
    datasets.createIndex({ ownerId: 1 }),
    runs.createIndex({ ownerId: 1, createdAt: -1 }),
  ]);
  // Housekeeping only (expiry is also checked on read), so a server without TTL support is fine.
  await tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});

  return {
    kind: 'mongo',
    async close() {
      await client.close();
    },
    // for tests: wipe the database this store points at
    async dropDatabase() {
      await db.dropDatabase();
    },

    // users
    async createUser({ email, name, passwordHash }) {
      const doc = { email, name: name || '', passwordHash, createdAt: new Date() };
      try {
        const r = await users.insertOne(doc);
        return fromDoc({ _id: r.insertedId, ...doc });
      } catch (e) {
        if (e && e.code === 11000) throw new DuplicateError('email');
        throw e;
      }
    },
    async findUserByEmail(email) {
      return fromDoc(await users.findOne({ email }));
    },
    async findUserById(id) {
      const _id = toOid(id);
      return _id ? fromDoc(await users.findOne({ _id })) : null;
    },

    // refresh tokens
    async saveRefreshToken({ userId, tokenHash, expiresAt }) {
      await tokens.insertOne({ userId, tokenHash, expiresAt, createdAt: new Date() });
    },
    async findRefreshToken(tokenHash) {
      const t = await tokens.findOne({ tokenHash });
      if (!t) return null;
      if (t.expiresAt <= new Date()) {
        await tokens.deleteOne({ tokenHash });
        return null;
      }
      return fromDoc(t);
    },
    async deleteRefreshToken(tokenHash) {
      const r = await tokens.deleteOne({ tokenHash });
      return r.deletedCount === 1;
    },

    // datasets
    async createDataset({ ownerId, agentDatasetId, filename, sizeBytes }) {
      const doc = { ownerId, agentDatasetId, filename, sizeBytes, createdAt: new Date() };
      const r = await datasets.insertOne(doc);
      return fromDoc({ _id: r.insertedId, ...doc });
    },
    async getDataset(id, ownerId) {
      const _id = toOid(id);
      return _id ? fromDoc(await datasets.findOne({ _id, ownerId })) : null;
    },
    async listDatasets(ownerId, limit = 100) {
      const rows = await datasets.find({ ownerId }).sort({ _id: -1 }).limit(limit).toArray();
      return rows.map(fromDoc);
    },
    async countDatasets(ownerId) {
    return datasets.countDocuments({ ownerId });
    },
    async deleteDataset(id, ownerId) {
      const _id = toOid(id);
      if (!_id) return false;
      const r = await datasets.deleteOne({ _id, ownerId });
      return r.deletedCount === 1;
    },

    // runs
    async createRun(input) {
      const doc = {
        status: 'queued',
        plan: [],
        steps: [],
        files: [],
        report: null,
        error: null,
        llmCalls: 0,
        ...input,
        createdAt: new Date(),
      };
      const r = await runs.insertOne(doc);
      return fromDoc({ _id: r.insertedId, ...doc });
    },
    async getRun(id, ownerId) {
      const _id = toOid(id);
      return _id ? fromDoc(await runs.findOne({ _id, ownerId })) : null;
    },
    async listRuns(ownerId, limit = 50) {
      const rows = await runs.find({ ownerId }).sort({ _id: -1 }).limit(limit).toArray();
      return rows.map(fromDoc);
    },
    async updateRun(id, patch) {
      const _id = toOid(id);
      if (!_id) return null;
      const r = await runs.findOneAndUpdate({ _id }, { $set: patch }, { returnDocument: 'after' });
      return fromDoc(r);
    },
    async countRuns(ownerId, { statusIn, since } = {}) {
      const q = { ownerId };
      if (statusIn) q.status = { $in: statusIn };
      if (since) q.createdAt = { $gte: since };
      return runs.countDocuments(q);
    },
    async countReports(ownerId) {
  return runs.countDocuments({
    ownerId,
    report: { $exists: true, $nin: [null, ''] },
  });
},
    async deleteRun(id, ownerId) {
      const _id = toOid(id);
      if (!_id) return false;
      const r = await runs.deleteOne({ _id, ownerId });
      return r.deletedCount === 1;
    },
  };
}

module.exports = { createMongoStore };
