// Runs the same contract against a real MongoDB when MONGODB_URI_TEST is set, for example:
//   MONGODB_URI_TEST=mongodb://127.0.0.1:27017 npm test
const { test } = require('node:test');
const crypto = require('node:crypto');
const { createMongoStore } = require('../src/store/mongo');
const { runStoreContract } = require('../testsupport/storeContract');

if (!process.env.MONGODB_URI_TEST) {
  test('mongo store contract (set MONGODB_URI_TEST to enable)', { skip: 'MONGODB_URI_TEST is not set' }, () => {});
} else {
  const dbName = `datapilot_test_${crypto.randomBytes(4).toString('hex')}`;
  runStoreContract('mongo', () => createMongoStore(process.env.MONGODB_URI_TEST, dbName));
}
