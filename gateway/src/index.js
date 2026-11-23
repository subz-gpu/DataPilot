const { loadConfig, validateConfig } = require('./config');
const { createStore } = require('./store');
const { AgentClient } = require('./agentClient');
const { createApp } = require('./app');

async function main() {
  const cfg = loadConfig();
  validateConfig(cfg);

  const store = await createStore(cfg);
  const agent = new AgentClient({ baseUrl: cfg.agentUrl, apiKey: cfg.agentApiKey });
  const app = createApp({ cfg, store, agent });

  const server = app.listen(cfg.port, () => {
    console.log(`DataPilot gateway: http://localhost:${cfg.port}  (store: ${store.kind}, analysis service: ${cfg.agentUrl})`);
  });

  agent
    .health()
    .then((h) => console.log(`Analysis service reachable. sandbox ready: ${h.sandbox_ready}, LLM configured: ${h.llm_configured}`))
    .catch(() => console.warn('WARNING: the analysis service is not reachable yet. Start it with: python -m uvicorn api.main:app --port 8000'));

  const shutdown = async () => {
    server.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('Startup failed:', e.message);
  process.exit(1);
});
