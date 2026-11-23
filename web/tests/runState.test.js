import { describe, expect, it } from 'vitest';
import { applyEvent, initialRunState, replay, stageLabel } from '../src/lib/runState.js';

let seq = 0;
const e = (type, data = {}) => ({ seq: seq++, type, ts: 't', data });

function sampleRun() {
  seq = 0;
  return [
    e('profiling_started'),
    e('profile_ready', { profile: { rows: 1000, columns: 7, fields: [] } }),
    e('planning_started'),
    e('plan_created', { plan: [{ title: 'Clean', goal: 'g1' }, { title: 'Aggregate', goal: 'g2' }] }),
    e('step_started', { index: 1, total: 2, title: 'Clean' }),
    e('attempt_started', { index: 1, attempt: 1 }),
    e('code_generated', { index: 1, attempt: 1, code: 'bad()' }),
    e('execution_result', { index: 1, attempt: 1, execution: { success: false, stderr: 'NameError' } }),
    e('retry', { index: 1, attempt: 1, reason: 'execution failed' }),
    e('attempt_started', { index: 1, attempt: 2 }),
    e('code_generated', { index: 1, attempt: 2, code: 'good()' }),
    e('execution_result', { index: 1, attempt: 2, execution: { success: true, stdout: 'ok' } }),
    e('critic_verdict', { index: 1, attempt: 2, verdict: { approve: true, issues: [], caveats: ['20% missing'] } }),
    e('step_done', { index: 1, title: 'Clean', status: 'approved', caveats: ['20% missing'] }),
    e('step_started', { index: 2, total: 2, title: 'Aggregate' }),
    e('reporting_started'),
    e('report_ready', { report: '## Summary' }),
    e('run_finished', { ok: true, llm_calls: 6, stop_reason: null }),
  ];
}

describe('applyEvent / replay', () => {
  it('builds the full picture from an event stream, including a retry', () => {
    const s = replay(sampleRun());
    expect(s.profile.rows).toBe(1000);
    expect(s.steps).toHaveLength(2);
    const step1 = s.steps[0];
    expect(step1.status).toBe('approved');
    expect(step1.attempts).toHaveLength(2);
    expect(step1.attempts[0].retryReason).toBe('execution failed');
    expect(step1.attempts[0].execution.success).toBe(false);
    expect(step1.attempts[1].code).toBe('good()');
    expect(step1.attempts[1].verdict.approve).toBe(true);
    expect(step1.caveats).toEqual(['20% missing']);
    expect(s.report).toBe('## Summary');
    expect(s.finished).toBe(true);
    expect(s.ok).toBe(true);
    expect(s.llmCalls).toBe(6);
  });

  it('ignores events it has already seen (replays and reconnects are safe)', () => {
    const events = sampleRun();
    const once = replay(events);
    const twice = replay(events, once);
    expect(twice).toEqual(once);
    expect(twice.steps[0].attempts).toHaveLength(2);
  });

  it('does not mutate the previous state', () => {
    const events = sampleRun();
    const before = replay(events.slice(0, 5));
    const snapshot = JSON.stringify(before);
    applyEvent(before, events[5]);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('records errors and skipped steps', () => {
    seq = 0;
    const s = replay([
      e('plan_created', { plan: [{ title: 'A', goal: 'g' }, { title: 'B', goal: 'g' }] }),
      e('step_skipped', { index: 2, title: 'B', reason: 'LLM call budget reached' }),
      e('run_error', { error: 'RuntimeError: boom' }),
    ]);
    expect(s.steps[1].status).toBe('skipped');
    expect(s.error).toBe('RuntimeError: boom');
    expect(s.finished).toBe(true);
    expect(s.ok).toBe(false);
    expect(stageLabel(s)).toBe('Stopped by an error');
  });

  it('describes progress in plain language', () => {
    const events = sampleRun();
    expect(stageLabel(replay(events.slice(0, 1)))).toBe('Reading the dataset');
    expect(stageLabel(replay(events.slice(0, 5)))).toBe('Working on step 1 of 2: Clean');
    expect(stageLabel(replay(events.slice(0, 16)))).toBe('Writing the report');
    expect(stageLabel(replay(events))).toBe('Finished');
    expect(stageLabel(initialRunState)).toBe('Starting');
  });

  it('ignores unknown event types', () => {
    const s = applyEvent(initialRunState, { seq: 0, type: 'something_new', data: {} });
    expect(s.lastSeq).toBe(0);
    expect(s.stage).toBe('starting');
  });
});
