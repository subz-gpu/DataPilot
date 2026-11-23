const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { HttpError } = require('../errors');
const { requireAuth } = require('../auth');
const { publicDataset } = require('../serializers');
const { AgentError } = require('../agentClient');

const ALLOWED_EXT = new Set(['.csv', '.txt', '.xlsx', '.xls', '.parquet', '.json']);

module.exports = function datasetRoutes({ cfg, store, agent }) {
  const router = express.Router();
  const auth = requireAuth(cfg);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: cfg.maxUploadMb * 1024 * 1024, files: 1 },
  });

  async function owned(req) {
    const ds = await store.getDataset(req.params.id, req.userId);
    if (!ds) throw new HttpError(404, 'Dataset not found.', 'not_found');
    return ds;
  }

  router.post('/', auth, upload.single('file'), async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'No file received. Send multipart/form-data with a "file" field.', 'no_file');
    }
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw new HttpError(415, `Unsupported file type. Allowed: ${[...ALLOWED_EXT].join(', ')}`, 'unsupported_type');
    }
    const meta = await agent.uploadDataset(req.file.buffer, req.file.originalname, req.file.mimetype);
    const ds = await store.createDataset({
      ownerId: req.userId,
      agentDatasetId: meta.id,
      filename: req.file.originalname,
      sizeBytes: meta.size_bytes ?? req.file.size,
    });
    res.status(201).json(publicDataset(ds));
  });
    // Hugging Face dataset discovery
  router.post('/discover', auth, async (req, res) => {
    const { query, limit = 10 } = req.body || {};

    if (typeof query !== 'string' || query.trim().length < 2) {
      throw new HttpError(400, 'Search query must contain at least 2 characters.', 'invalid_query');
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new HttpError(400, 'Limit must be between 1 and 50.', 'invalid_limit');
    }

    const results = await agent.discoverDatasets(query.trim(), limit);
    res.json(results);
  });
    // Get Hugging Face dataset details and available files
  router.get('/discover/:datasetId', auth, async (req, res) => {
    const details = await agent.getDiscoveredDataset(req.params.datasetId);
    res.json(details);
  });
    // Import a CSV dataset from Hugging Face
  router.post('/import', auth, async (req, res) => {
    const { dataset_id, filename } = req.body || {};
    console.log('[HF IMPORT]', {
    dataset_id,
    filename,
    extension: typeof filename === 'string'
      ? path.posix.extname(filename.trim()).toLowerCase()
      : null,
  });

    if (typeof dataset_id !== 'string' || !dataset_id.trim()) {
      throw new HttpError(400, 'Dataset ID is required.', 'invalid_dataset_id');
    }

    const ext = typeof filename === 'string'
  ? path.posix.extname(filename.trim()).toLowerCase()
  : '';

if (!filename || !filename.trim() || !['.csv', '.parquet'].includes(ext)) {
  throw new HttpError(
    400,
    'Please select a valid CSV or Parquet file.',
    'invalid_filename'
  );
}

    const meta = await agent.importHuggingFaceDataset(dataset_id.trim(), filename);

    const ds = await store.createDataset({
      ownerId: req.userId,
      agentDatasetId: meta.id,
      filename: meta.filename,
      sizeBytes: meta.size_bytes,
    });

    res.status(201).json(publicDataset(ds));
  });
  router.get('/', auth, async (req, res) => {
    const items = await store.listDatasets(req.userId);
    res.json({ datasets: items.map(publicDataset) });
  });

  router.get('/:id', auth, async (req, res) => {
    res.json(publicDataset(await owned(req)));
  });

  router.get('/:id/profile', auth, async (req, res) => {
    const ds = await owned(req);
    res.json(await agent.getProfile(ds.agentDatasetId));
  });

  router.delete('/:id', auth, async (req, res) => {
    const ds = await owned(req);
    try {
      await agent.deleteDataset(ds.agentDatasetId);
    } catch (e) {
      if (!(e instanceof AgentError && e.status === 404)) throw e; // already gone is fine
    }
    await store.deleteDataset(ds.id, req.userId);
    res.status(204).end();
  });

  return router;
};
