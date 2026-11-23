const { Readable } = require('node:stream');
const express = require('express');
const { z } = require('zod');
const { HttpError } = require('../errors');
const { requireAuth } = require('../auth');
const { publicDataset, publicRun } = require('../serializers');
const { makeRunSync, TERMINAL, ACTIVE } = require('../runSync');

const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_. -]{0,150}$/;
const INLINE_IMAGES = /^image\/(png|jpeg|gif|webp)$/;

module.exports = function runRoutes({ cfg, store, agent }) {
  const router = express.Router();
  const auth = requireAuth(cfg);
  const authStream = requireAuth(cfg, { allowQueryToken: true });
  const { syncRun, syncActiveRuns } = makeRunSync({ store, agent });

  const createSchema = z.object({
    datasetId: z.string().min(1).max(64),
    objective: z.string().trim().min(3, 'Describe what you want to find out.').max(2000),
    options: z
      .object({
        maxSteps: z.int().min(1).max(8).optional(),
        maxAttempts: z.int().min(1).max(5).optional(),
        maxLlmCalls: z.int().min(3).max(cfg.maxLlmCallsPerRun).optional(),
      })
      .optional(),
  });

  async function owned(req) {
    const run = await store.getRun(req.params.id, req.userId);
    if (!run) throw new HttpError(404, 'Run not found.', 'not_found');
    return run;
  }

  router.post('/', auth, async (req, res) => {
    const body = createSchema.parse(req.body);
    const dataset = await store.getDataset(body.datasetId, req.userId);
    if (!dataset) throw new HttpError(404, 'Dataset not found.', 'not_found');

    // Per-user limits protect the shared (free-tier) LLM quota.
    await syncActiveRuns(req.userId);
    const active = await store.countRuns(req.userId, { statusIn: ACTIVE });
    if (active >= cfg.maxActiveRunsPerUser) {
      throw new HttpError(429, 'You already have an analysis running. Wait for it to finish.', 'run_in_progress');
    }
    const today = await store.countRuns(req.userId, { since: new Date(Date.now() - 86_400_000) });
    if (today >= cfg.dailyRunLimit) {
      throw new HttpError(429, `Daily limit of ${cfg.dailyRunLimit} analyses reached. Try again tomorrow.`, 'daily_limit');
    }

    const o = body.options || {};
    const remote = await agent.createRun({
      dataset_id: dataset.agentDatasetId,
      objective: body.objective,
      ...(o.maxSteps && { max_steps: o.maxSteps }),
      ...(o.maxAttempts && { max_attempts: o.maxAttempts }),
      max_llm_calls: o.maxLlmCalls ?? cfg.maxLlmCallsPerRun,
    });

    const run = await store.createRun({
      ownerId: req.userId,
      datasetId: dataset.id,
      agentRunId: remote.run_id,
      objective: body.objective,
      options: o,
      status: remote.status || 'queued',
    });
    res.status(202).json(publicRun(run));
  });

  router.get('/', auth, async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const runs = await store.listRuns(req.userId, limit);
    const fresh = await Promise.all(runs.map((r) => syncRun(r).catch(() => r)));
    res.json({ runs: fresh.map((r) => publicRun(r)) });
  });
  // Dashboard statistics and recent activity
router.get('/dashboard', auth, async (req, res) => {
  // Refresh active runs so their statuses are up to date.
  await syncActiveRuns(req.userId);

  const [
    totalDatasets,
    totalAnalyses,
    successfulAnalyses,
    totalReports,
    recentDatasets,
    recentRuns,
  ] = await Promise.all([
    store.countDatasets(req.userId),
    store.countRuns(req.userId),
    store.countRuns(req.userId, { statusIn: ['succeeded'] }),
    store.countReports(req.userId),
    store.listDatasets(req.userId, 5),
    store.listRuns(req.userId, 5),
  ]);

  const freshRuns = await Promise.all(
    recentRuns.map((run) => syncRun(run).catch(() => run))
  );

  res.json({
    totalDatasets,
    totalAnalyses,
    successfulAnalyses,
    totalReports,
    recentDatasets: recentDatasets.map(publicDataset),
    recentRuns: freshRuns.map((run) => publicRun(run)),
  });
});

  router.get('/:id', auth, async (req, res) => {
    const run = await syncRun(await owned(req));
    res.json(publicRun(run, { full: true }));
  });

  router.delete('/:id', auth, async (req, res) => {
    const run = await syncRun(await owned(req));
    if (!TERMINAL.has(run.status)) {
      throw new HttpError(409, 'This run is still in progress.', 'run_in_progress');
    }
    await store.deleteRun(run.id, req.userId);
    res.status(204).end();
  });

  // Live progress: the agent's Server-Sent Events stream, relayed after the ownership check.
  router.get('/:id/events', authStream, async (req, res) => {
    const run = await owned(req);
    const ac = new AbortController();
    res.on('close', () => ac.abort());

    const upstream = await agent.streamEvents(run.agentRunId, req.get('last-event-id'), ac.signal);
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const body = Readable.fromWeb(upstream.body);
    body.on('end', () => {
      syncRun(run).catch(() => {}); // persist the final state even if no client asks again
    });
    body.on('error', () => res.end());
    body.pipe(res);
  });

  router.get('/:id/files/:name', authStream, async (req, res) => {
    const run = await owned(req);
    const { name } = req.params;
    if (!SAFE_NAME.test(name)) throw new HttpError(404, 'File not found.', 'not_found');

    const upstream = await agent.getFile(run.agentRunId, name);
    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    const inline = INLINE_IMAGES.test(type.split(';')[0].trim());
    res.status(200).set({
      'Content-Type': type,
      'Cache-Control': 'private, max-age=300',
      // Generated files come from model-written code, so never let them run as pages.
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/"/g, '')}"`,
    });
    const length = upstream.headers.get('content-length');
    if (length) res.set('Content-Length', length);
    Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res);
  });

  return router;
};
