const { createMemoryStore } = require('./memory');
const { createMongoStore } = require('./mongo');

async function createStore(cfg) {
  if (cfg.storeKind === 'memory') {
    console.warn('WARNING: STORE=memory. Users and history are lost when the gateway restarts.');
    return createMemoryStore();
  }
  return createMongoStore(cfg.mongoUri, cfg.mongoDb);
}

module.exports = { createStore, createMemoryStore, createMongoStore };
