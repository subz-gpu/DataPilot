import { useCallback, useEffect, useReducer, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../lib/api.js';
import { isTerminal, timeAgo } from '../lib/format.js';
import { applyEvent, initialRunState, stageLabel } from '../lib/runState.js';
import ChartImage, { downloadFile } from '../components/ChartImage.jsx';
import Markdown from '../components/Markdown.jsx';
import RunLog from '../components/RunLog.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const isChart = (name) => /\.(png|jpe?g|gif|webp)$/i.test(name);

function RunView({ id }) {
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [streamError, setStreamError] = useState('');
  const [state, dispatch] = useReducer(applyEvent, initialRunState);

  const refresh = useCallback(() => api.getRun(id).then(setRun), [id]);

  useEffect(() => {
    refresh().catch((e) => setLoadError(e.message));
  }, [refresh]);

  // Follow the live stream. For a finished run the server replays every event, which is how the
  // log of a past analysis gets its code and output back.
  useEffect(() => {
    const ac = new AbortController();
    api
      .streamRun(id, { onEvent: dispatch, signal: ac.signal })
      .then(() => !ac.signal.aborted && refresh().catch(() => {}))
      .catch((e) => !ac.signal.aborted && setStreamError(e.message));
    return () => ac.abort();
  }, [id, refresh]);

  // If the stream is unavailable, fall back to polling the saved state.
  const unfinished = run && !isTerminal(run.status);
  useEffect(() => {
    if (!streamError || !unfinished) return undefined;
    const t = setInterval(() => refresh().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [streamError, unfinished, refresh]);

  if (loadError) {
    return (
      <>
        <p className="error" role="alert">
          {loadError}
        </p>
        <Link to="/" className="back-button">
  <span>←</span>
  Back to analyses
</Link>
      </>
    );
  }
  if (!run) return <p className="muted">Loading…</p>;

  const status = state.finished && !isTerminal(run.status) ? (state.error ? 'error' : state.ok ? 'succeeded' : 'failed') : run.status;
  const report = run.report ?? state.report;
  const finished = isTerminal(status);
  const charts = (run.files || []).filter(isChart);
  const others = (run.files || []).filter((f) => !isChart(f));
  // Show the saved plan/steps even if the stream could not be replayed.
  const logState = state.steps.length || !run.steps?.length ? state : { ...state, steps: run.steps.map((s) => ({ ...s, goal: '', attempts: [], caveats: s.caveats || [] })), profile: state.profile };

  async function remove() {
    if (!window.confirm('Delete this analysis and its report?')) return;
    await api.deleteRun(id);
    navigate('/');
  }

  return (
    <>
     <div className="crumb">
  <Link to="/" className="crumb-button">
    <span>←</span>
    Analyses
  </Link>
</div>
      <header className="run-head">
        <h1 className="objective">{run.objective}</h1>
        <p className="run-status" aria-live="polite">
          <StatusBadge status={status} />
          <span>{finished ? `Started ${timeAgo(run.createdAt)}` : stageLabel(state)}</span>
        </p>
      </header>

      {run.error && (
        <p className="error" role="alert">
          {run.error}
        </p>
      )}
      {state.error && !run.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {run.stopReason && <p className="notice">This run stopped early: {run.stopReason}.</p>}

      <div className={`run-layout${report ? ' has-report' : ''}`}>
        <div className="run-main">
          {report ? (
            <>
              <article className="sheet">
                <Markdown>{report}</Markdown>
              </article>
              <details className="log-fold" open={!finished}>
                <summary>How the agent got there</summary>
                <RunLog state={logState} />
              </details>
            </>
          ) : (
            <RunLog state={logState} />
          )}
          {streamError && !finished && <p className="muted">Live updates are unavailable. This page refreshes every few seconds instead.</p>}
        </div>

        <aside className="margin" aria-label="Run details">
          {charts.length > 0 && (
            <section>
              <h2>Charts</h2>
              {charts.map((name) => (
                <ChartImage key={name} runId={id} name={name} />
              ))}
            </section>
          )}
          {(others.length > 0 || charts.length > 0) && (
            <section>
              <h2>Files</h2>
              <ul className="files">
                {[...charts, ...others].map((name) => (
                  <li key={name}>
                    <button type="button" className="link" onClick={() => downloadFile(id, name).catch(() => {})}>
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {finished && (
            <section>
              <h2>Run</h2>
              <p className="muted">
                {run.steps?.length || 0} {run.steps?.length === 1 ? 'step' : 'steps'}
                {run.llmCalls > 0 ? `, ${run.llmCalls} model calls` : ''}.
              </p>
              <button type="button" className="link danger" onClick={remove}>
                Delete this analysis
              </button>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

export default function RunPage() {
  const { id } = useParams();
  return <RunView key={id} id={id} />;
}
