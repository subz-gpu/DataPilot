const path = require('node:path');

// One shared .env at the repo root is used by both the gateway and the Python service.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

function loadConfig(env = process.env) {
  const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
  return {
    port: num(env.GATEWAY_PORT, 4000),
    storeKind: (env.STORE || 'mongo').toLowerCase(), // "mongo" or "memory" (quick start, data lost on restart)
    mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/datapilot',
    mongoDb: env.MONGODB_DB || '',
    jwtSecret: env.JWT_SECRET || '',
    accessTtlSeconds: num(env.ACCESS_TOKEN_TTL_SECONDS, 900),
    refreshTtlDays: num(env.REFRESH_TOKEN_TTL_DAYS, 30),
    agentUrl: (env.AGENT_URL || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
    agentApiKey: env.INTERNAL_API_KEY || '',
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    maxUploadMb: num(env.MAX_UPLOAD_MB, 50),
    maxActiveRunsPerUser: num(env.MAX_ACTIVE_RUNS_PER_USER, 1),
    dailyRunLimit: num(env.DAILY_RUN_LIMIT, 20),
    maxLlmCallsPerRun: num(env.MAX_LLM_CALLS_PER_RUN, 30),
    authRateLimit: num(env.AUTH_RATE_LIMIT, 20), // per IP per 15 minutes; 0 disables
    trustProxy: env.TRUST_PROXY === 'true',
  };
}

function validateConfig(cfg) {
  if (cfg.jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too short (need 32+ characters). Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n' +
        'then add JWT_SECRET=<that value> to the .env file in the repo root.'
    );
  }
}

module.exports = { loadConfig, validateConfig };
