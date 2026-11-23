import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api.js';
import { isTerminal, timeAgo } from '../lib/format.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function AnalysesPage() {
  const [runs, setRuns] = useState(null);
  const [datasets, setDatasets] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    let timer;
    async function load() {
      try {
        const [r, d] = await Promise.all([api.listRuns(), api.listDatasets()]);
        if (!live) return;
        setRuns(r);
        setDatasets(Object.fromEntries(d.map((x) => [x.id, x.filename])));
        setError('');
        if (r.some((x) => !isTerminal(x.status))) timer = setTimeout(load, 4000); // keep unfinished runs fresh
      } catch (e) {
        if (live) setError(e.message);
      }
    }
    load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
    {/* Background video */}

      <div className="page-head drop-in">
        <h1>Analyses</h1>
        <Link className="btn" to="/new">
          New analysis
        </Link>
      </div>
      {error && (
        <p className="error drop-in" role="alert">
          {error}
        </p>
      )}
      {runs === null && !error && (
  <p className="muted drop-in">Loading...</p>
)}
      {runs && runs.length === 0 && (
        <div className="empty drop-in">
          <h2>No analyses yet</h2>
          <p>Upload a dataset and ask your first question. The agent shows its work as it goes.</p>
          <Link className="btn" to="/new">
            Start an analysis
          </Link>
        </div>
      )}
      {runs && runs.length > 0 && (
        <ul className="rows">
          {runs.map((run, index) => (
  <li
    key={run.id}
    className="drop-in-row"
    style={{
      animationDelay: `${150 + Math.min(index, 8) * 100}ms`,
    }}
  >
              <Link to={`/runs/${run.id}`} className="row">
                <span className="row-title">{run.objective}</span>
                <span className="row-meta">
                  <StatusBadge status={run.status} />
                  <span>{datasets[run.datasetId] || 'Deleted dataset'}</span>
                  <span>{timeAgo(run.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
