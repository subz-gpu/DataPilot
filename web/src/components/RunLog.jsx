import { formatNumber } from '../lib/format.js';

const STEP_WORDS = {
  pending: 'Waiting',
  active: 'Working',
  approved: 'Approved',
  accepted_with_issues: 'Accepted with concerns',
  failed: 'Failed',
  skipped: 'Skipped',
};
const STEP_TONE = { pending: 'wait', active: 'active', approved: 'done', accepted_with_issues: 'warn', failed: 'bad', skipped: 'wait' };

function lastLine(text = '') {
  const lines = text.trim().split('\n');
  return lines[lines.length - 1] || '';
}

const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

function attemptSummary(a) {
  if (!a.execution) return { text: 'Running the code', tone: 'wait' };
  if (!a.execution.success) {
    return { text: a.execution.timed_out ? 'Script timed out' : `Script failed: ${clip(lastLine(a.execution.stderr), 110)}`, tone: 'bad' };
  }
  if (!a.verdict) return { text: 'Ran successfully, awaiting review', tone: 'wait' };
  if (a.verdict.approve) return { text: 'Reviewer approved', tone: 'done' };
  return { text: 'Reviewer asked for changes', tone: 'warn' };
}

function Attempt({ attempt, open }) {
  const summary = attemptSummary(attempt);
  const ex = attempt.execution;
  return (
    <details className="attempt" open={open}>
      <summary>
        <span className="attempt-name">Attempt {attempt.number}</span>
        <span className={`note note-${summary.tone}`}>{summary.text}</span>
      </summary>
      {attempt.verdict && attempt.verdict.issues.length > 0 && (
        <ul className="issues">
          {attempt.verdict.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
      {attempt.code && (
        <details className="inner">
          <summary>Show the code</summary>
          <pre className="code">
            <code>{attempt.code}</code>
          </pre>
        </details>
      )}
      {ex && (ex.stdout || ex.stderr) && (
        <details className="inner" open={!ex.success}>
          <summary>{ex.success ? 'Show the output' : 'Show the error'}</summary>
          <pre className="code output">
            <code>{ex.success ? ex.stdout : ex.stderr}</code>
          </pre>
        </details>
      )}
    </details>
  );
}

function Step({ step }) {
  const tone = STEP_TONE[step.status];
  const lastAttempt = step.attempts.length;
  return (
    <li className="entry" data-state={tone}>
      <p className="entry-title">
        <span className="entry-name">
          Step {step.index}: {step.title}
        </span>
        <span className={`note note-${tone === 'done' ? 'done' : tone}`}>{STEP_WORDS[step.status]}</span>
      </p>
      {step.goal && <p className="entry-goal">{step.goal}</p>}
      {step.attempts.map((a) => (
        <Attempt key={a.number} attempt={a} open={step.status === 'active' && a.number === lastAttempt} />
      ))}
      {step.caveats.length > 0 && (
        <ul className="caveats">
          {step.caveats.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function RunLog({ state }) {
  const { profile, steps, stage } = state;
  return (
    <ol className="log" aria-label="Run log">
      <li className="entry" data-state={profile ? 'done' : stage === 'profiling' || stage === 'starting' ? 'active' : 'wait'}>
        <p className="entry-title">
          <span className="entry-name">Read the dataset</span>
          {profile && (
            <span className="note note-done">
              {formatNumber(profile.rows)} rows, {formatNumber(profile.columns)} columns
            </span>
          )}
        </p>
      </li>
      <li className="entry" data-state={steps.length ? 'done' : stage === 'planning' ? 'active' : 'wait'}>
        <p className="entry-title">
          <span className="entry-name">Plan the analysis</span>
          {steps.length > 0 && <span className="note note-done">{steps.length === 1 ? '1 step' : `${steps.length} steps`}</span>}
        </p>
      </li>
      {steps.map((s) => (
        <Step key={s.index} step={s} />
      ))}
      {(steps.length > 0 || stage === 'reporting' || stage === 'done') && (
        <li className="entry" data-state={state.report ? 'done' : stage === 'reporting' ? 'active' : 'wait'}>
          <p className="entry-title">
            <span className="entry-name">Write the report</span>
            {state.report && <span className="note note-done">Ready</span>}
          </p>
        </li>
      )}
    </ol>
  );
}
