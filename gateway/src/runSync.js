const { AgentError, AgentUnavailableError } = require('./agentClient');

const TERMINAL = new Set(['succeeded', 'failed', 'error']);
const ACTIVE = ['queued', 'running'];

const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * Keeps the stored run in step with the agent service. Called whenever a run is read,
 * and when its event stream ends, so history is saved even if nobody watched the run.
 */
function makeRunSync({ store, agent }) {
  async function syncRun(run) {
    if (TERMINAL.has(run.status)) return run;
    let remote;
    try {
      remote = await agent.getRun(run.agentRunId);
    } catch (e) {
      if (e instanceof AgentError && e.status === 404) {
        return (
          (await store.updateRun(run.id, {
            status: 'error',
            error: 'The run data is no longer available on the analysis service.',
            finishedAt: new Date().toISOString(),
          })) || run
        );
      }
      if (e instanceof AgentUnavailableError || e instanceof AgentError) return run; // keep last known state
      throw e;
    }
    const patch = compact({
      status: remote.status,
      startedAt: remote.started_at,
      finishedAt: remote.finished_at,
      plan: remote.plan,
      steps: remote.steps,
      files: remote.files,
      llmCalls: remote.llm_calls,
      stopReason: remote.stop_reason,
      error: remote.error,
    });
    if (TERMINAL.has(remote.status)) patch.report = remote.report ?? null;
    return (await store.updateRun(run.id, patch)) || run;
  }

  async function syncActiveRuns(ownerId) {
    const recent = await store.listRuns(ownerId, 50);
    const active = recent.filter((r) => !TERMINAL.has(r.status));
    await Promise.allSettled(active.map(syncRun));
  }

  return { syncRun, syncActiveRuns };
}

module.exports = { makeRunSync, TERMINAL, ACTIVE };
