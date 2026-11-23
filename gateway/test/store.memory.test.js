const { createMemoryStore } = require('../src/store/memory');
const { runStoreContract } = require('../testsupport/storeContract');

runStoreContract('memory', async () => createMemoryStore());
