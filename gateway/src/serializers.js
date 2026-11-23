function publicDataset(d) {
  return { id: d.id, filename: d.filename, sizeBytes: d.sizeBytes, createdAt: d.createdAt };
}

function publicRun(r, { full = false } = {}) {
  const out = {
    id: r.id,
    datasetId: r.datasetId,
    objective: r.objective,
    options: r.options || {},
    status: r.status,
    createdAt: r.createdAt,
    startedAt: r.startedAt ?? null,
    finishedAt: r.finishedAt ?? null,
    plan: r.plan || [],
    steps: r.steps || [],
    files: r.files || [],
    llmCalls: r.llmCalls ?? 0,
    stopReason: r.stopReason ?? null,
    error: r.error ?? null,
  };
  if (full) out.report = r.report ?? null;
  return out;
}

module.exports = { publicDataset, publicRun };
