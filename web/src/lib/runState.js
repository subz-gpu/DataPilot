/**
 * Turns the agent's event stream into the state the run page renders.
 * Pure and idempotent: events with an already-seen sequence number are ignored, so replays
 * and reconnects cannot duplicate anything.
 */
export const initialRunState = {
  stage: 'starting', // starting | profiling | planning | running | reporting | done | error
  profile: null,
  plan: [],
  steps: [],
  currentStep: null,
  report: null,
  finished: false,
  ok: null,
  llmCalls: null,
  stopReason: null,
  error: null,
  lastSeq: -1,
};

function updateStep(state, index, change) {
  return {
    ...state,
    steps: state.steps.map((s) => (s.index === index ? { ...s, ...change(s) } : s)),
  };
}

function updateAttempt(state, index, number, change) {
  return updateStep(state, index, (s) => {
    const exists = s.attempts.some((a) => a.number === number);
    const attempts = exists ? s.attempts : [...s.attempts, { number, code: null, execution: null, verdict: null, retryReason: null }];
    return { attempts: attempts.map((a) => (a.number === number ? { ...a, ...change(a) } : a)) };
  });
}

export function applyEvent(state, ev) {
  if (typeof ev.seq === 'number') {
    if (ev.seq <= state.lastSeq) return state;
    state = { ...state, lastSeq: ev.seq };
  }
  const d = ev.data || {};
  switch (ev.type) {
    case 'profiling_started':
      return { ...state, stage: 'profiling' };
    case 'profile_ready':
      return { ...state, profile: d.profile };
    case 'planning_started':
      return { ...state, stage: 'planning' };
    case 'plan_created':
      return {
        ...state,
        plan: d.plan,
        steps: d.plan.map((p, i) => ({
          index: i + 1,
          title: p.title,
          goal: p.goal,
          status: 'pending',
          attempts: [],
          caveats: [],
        })),
      };
    case 'step_started':
      return { ...updateStep(state, d.index, () => ({ status: 'active' })), stage: 'running', currentStep: d.index };
    case 'attempt_started':
      return updateAttempt(state, d.index, d.attempt, () => ({}));
    case 'code_generated':
      return updateAttempt(state, d.index, d.attempt, () => ({ code: d.code }));
    case 'execution_result':
      return updateAttempt(state, d.index, d.attempt, () => ({ execution: d.execution }));
    case 'critic_verdict':
      return updateAttempt(state, d.index, d.attempt, () => ({ verdict: d.verdict }));
    case 'retry':
      return updateAttempt(state, d.index, d.attempt, () => ({ retryReason: d.reason }));
    case 'step_done':
      return updateStep(state, d.index, () => ({ status: d.status, caveats: d.caveats || [] }));
    case 'step_skipped':
      return updateStep(state, d.index, () => ({ status: 'skipped', caveats: [d.reason] }));
    case 'reporting_started':
      return { ...state, stage: 'reporting', currentStep: null };
    case 'report_ready':
      return { ...state, report: d.report };
    case 'run_finished':
      return { ...state, stage: 'done', finished: true, ok: d.ok, llmCalls: d.llm_calls, stopReason: d.stop_reason };
    case 'run_error':
      return { ...state, stage: 'error', finished: true, ok: false, error: d.error };
    default:
      return state;
  }
}

export function replay(events, from = initialRunState) {
  return events.reduce(applyEvent, from);
}

/** Plain-language description of what the agent is doing right now. */
export function stageLabel(state) {
  switch (state.stage) {
    case 'starting':
      return 'Starting';
    case 'profiling':
      return 'Reading the dataset';
    case 'planning':
      return 'Planning the analysis';
    case 'running': {
      const step = state.steps.find((s) => s.index === state.currentStep);
      return step ? `Working on step ${step.index} of ${state.steps.length}: ${step.title}` : 'Working';
    }
    case 'reporting':
      return 'Writing the report';
    case 'done':
      return state.ok ? 'Finished' : 'Finished with problems';
    case 'error':
      return 'Stopped by an error';
    default:
      return '';
  }
}
