const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const { DuplicateError } = require('../src/errors');

/** The same behaviour must hold for every store implementation (memory and MongoDB). */
function runStoreContract(name, makeStore) {
  describe(`store contract: ${name}`, () => {
    let store;
    before(async () => {
      store = await makeStore();
    });
    after(async () => {
      if (store.dropDatabase) await store.dropDatabase();
      await store.close();
    });

    it('creates and finds users; rejects duplicate emails', async () => {
      const u = await store.createUser({ email: 'a@x.com', name: 'A', passwordHash: 'h' });
      assert.match(u.id, /^[a-f0-9]{24}$/);
      assert.equal((await store.findUserByEmail('a@x.com')).id, u.id);
      assert.equal((await store.findUserById(u.id)).email, 'a@x.com');
      assert.equal(await store.findUserByEmail('nobody@x.com'), null);
      assert.equal(await store.findUserById('not-an-id'), null);
      await assert.rejects(store.createUser({ email: 'a@x.com', name: '', passwordHash: 'h' }), DuplicateError);
    });

    it('stores refresh tokens; deleting works once; expired ones are not found', async () => {
      await store.saveRefreshToken({ userId: 'u1', tokenHash: 'th1', expiresAt: new Date(Date.now() + 60_000) });
      assert.equal((await store.findRefreshToken('th1')).userId, 'u1');
      assert.equal(await store.deleteRefreshToken('th1'), true);
      assert.equal(await store.deleteRefreshToken('th1'), false);
      assert.equal(await store.findRefreshToken('th1'), null);

      await store.saveRefreshToken({ userId: 'u1', tokenHash: 'th2', expiresAt: new Date(Date.now() - 1000) });
      assert.equal(await store.findRefreshToken('th2'), null);
    });

    it('scopes datasets to their owner, newest first', async () => {
      const a = await store.createDataset({ ownerId: 'ownerA', agentDatasetId: 'g1', filename: 'one.csv', sizeBytes: 10 });
      const b = await store.createDataset({ ownerId: 'ownerA', agentDatasetId: 'g2', filename: 'two.csv', sizeBytes: 20 });
      await store.createDataset({ ownerId: 'ownerB', agentDatasetId: 'g3', filename: 'other.csv', sizeBytes: 5 });

      assert.deepEqual((await store.listDatasets('ownerA')).map((d) => d.id), [b.id, a.id]);
      assert.equal((await store.getDataset(a.id, 'ownerA')).filename, 'one.csv');
      assert.equal(await store.getDataset(a.id, 'ownerB'), null);
      assert.equal(await store.getDataset('bogus', 'ownerA'), null);
      assert.equal(await store.deleteDataset(a.id, 'ownerB'), false);
      assert.equal(await store.deleteDataset(a.id, 'ownerA'), true);
      assert.equal(await store.getDataset(a.id, 'ownerA'), null);
    });

    it('creates, updates, lists, counts and deletes runs per owner', async () => {
      const r1 = await store.createRun({ ownerId: 'rA', datasetId: 'd', agentRunId: 'ag1', objective: 'first' });
      const r2 = await store.createRun({ ownerId: 'rA', datasetId: 'd', agentRunId: 'ag2', objective: 'second' });
      await store.createRun({ ownerId: 'rB', datasetId: 'd', agentRunId: 'ag3', objective: 'other' });

      assert.equal(r1.status, 'queued');
      assert.deepEqual((await store.listRuns('rA', 10)).map((r) => r.id), [r2.id, r1.id]);
      assert.equal((await store.listRuns('rA', 1)).length, 1);
      assert.equal(await store.getRun(r1.id, 'rB'), null);

      const updated = await store.updateRun(r1.id, { status: 'succeeded', report: 'done', llmCalls: 5 });
      assert.equal(updated.status, 'succeeded');
      assert.equal(updated.report, 'done');
      assert.equal(updated.objective, 'first');
      assert.equal(await store.updateRun('ffffffffffffffffffffffff', { status: 'x' }), null);

      assert.equal(await store.countRuns('rA'), 2);
      assert.equal(await store.countRuns('rA', { statusIn: ['queued', 'running'] }), 1);
      assert.equal(await store.countRuns('rA', { since: new Date(Date.now() - 60_000) }), 2);
      assert.equal(await store.countRuns('rA', { since: new Date(Date.now() + 60_000) }), 0);

      assert.equal(await store.deleteRun(r1.id, 'rB'), false);
      assert.equal(await store.deleteRun(r1.id, 'rA'), true);
    });
  });
}

module.exports = { runStoreContract };
