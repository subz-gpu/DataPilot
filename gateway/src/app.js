const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const multer = require('multer');
const { rateLimit } = require('express-rate-limit');
const { ZodError } = require('zod');
const { HttpError } = require('./errors');
const { AgentError, AgentUnavailableError } = require('./agentClient');

function sendError(res, status, code, message, details) {
  res.status(status).json({ error: { code, message, ...(details && { details }) } });
}

function mapAgentError(err) {
  const s = err.status;
  if (s === 404) return [404, 'not_found', 'Not found on the analysis service.'];
  if ([400, 413, 415, 422, 429, 503].includes(s)) {
    return [s === 422 ? 400 : s, 'agent_rejected', String(err.detail || err.message)];
  }
  if (s === 401) {
    console.error('The agent service rejected the gateway API key: make sure INTERNAL_API_KEY is identical in both services.');
    return [502, 'agent_misconfigured', 'The analysis service is misconfigured.'];
  }
  return [502, 'agent_error', 'The analysis service returned an error.'];
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    // e.g. a stream failed half-way: nothing sensible left to send
    return res.end();
  }
  if (err instanceof HttpError) return sendError(res, err.status, err.code, err.message);
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const first = issues[0];
    return sendError(res, 400, 'validation_error', first ? `${first.field ? first.field + ': ' : ''}${first.message}` : 'Invalid request.', issues);
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return sendError(res, 413, 'file_too_large', 'The file is larger than the upload limit.');
    return sendError(res, 400, 'upload_error', err.message);
  }
  if (err instanceof AgentUnavailableError) return sendError(res, 502, 'agent_unavailable', 'The analysis service is unavailable. Try again shortly.');
  if (err instanceof AgentError) return sendError(res, ...mapAgentError(err));
  if (err && err.type === 'entity.parse.failed') return sendError(res, 400, 'invalid_json', 'Request body is not valid JSON.');
  if (err && err.type === 'entity.too.large') return sendError(res, 413, 'body_too_large', 'Request body is too large.');
  console.error(err);
  return sendError(res, 500, 'internal_error', 'Something went wrong.');
}

function createApp({ cfg, store, agent }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);
  app.use(helmet());
  app.use(
    cors({
      origin: cfg.corsOrigins,
      allowedHeaders: ['Authorization', 'Content-Type', 'Last-Event-ID'],
    })
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (req, res) => {
    let analysis = { reachable: false };
    try {
      const h = await agent.health();
      analysis = {
        reachable: true,
        sandboxReady: h.sandbox_ready,
        llmConfigured: h.llm_configured,
        model: h.model,
      };
    } catch {
      /* reported as unreachable */
    }
    res.json({ status: 'ok', store: store.kind, analysis });
  });

  const authLimiter =
    cfg.authRateLimit > 0
      ? rateLimit({
          windowMs: 15 * 60 * 1000,
          limit: cfg.authRateLimit,
          standardHeaders: 'draft-8',
          legacyHeaders: false,
          handler: (req, res) => sendError(res, 429, 'too_many_attempts', 'Too many attempts. Try again in a few minutes.'),
        })
      : (req, res, next) => next();

  app.use('/api/auth', authLimiter, require('./routes/auth')({ cfg, store }));
  app.use('/api/datasets', require('./routes/datasets')({ cfg, store, agent }));
  app.use('/api/runs', require('./routes/runs')({ cfg, store, agent }));

  app.use((req, res) => sendError(res, 404, 'not_found', 'Route not found.'));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
