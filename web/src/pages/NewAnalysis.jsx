import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../lib/api.js';
import { formatBytes } from '../lib/format.js';
import FileDrop from '../components/FileDrop.jsx';

const EXAMPLES = [
  'Summarize the main patterns in this data.',
  'Check this data for missing or inconsistent values.',
  'Which group has the highest total, and is the gap meaningful?',
];

export default function NewAnalysisPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [datasets, setDatasets] = useState(null);
  const [datasetId, setDatasetId] = useState(params.get('dataset') || '');
  const [objective, setObjective] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api
      .listDatasets()
      .then((list) => {
        setDatasets(list);
        setDatasetId((current) => (list.some((d) => d.id === current) ? current : list[0]?.id || ''));
      })
      .catch((e) => setError(e.message));
  }, []);

  async function upload(file) {
    setError('');
    setUploading(true);
    try {
      const created = await api.uploadDataset(file);
      setDatasets((list) => [created, ...(list || [])]);
      setDatasetId(created.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function start(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const run = await api.createRun({ datasetId, objective: objective.trim() });
      navigate(`/runs/${run.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const ready = datasetId && objective.trim().length >= 3 && !busy;

  return (
    <>
      <div className="page-head">
        <h1>New analysis</h1>
      </div>
      <form onSubmit={start} className="form wide">
        <fieldset>
          <legend>Dataset</legend>
          {datasets === null && !error && <p className="muted">Loading…</p>}
          {datasets && datasets.length > 0 && (
            <ul className="choices">
              {datasets.map((d) => (
                <li key={d.id}>
                  <label className="choice">
                    <input type="radio" name="dataset" value={d.id} checked={datasetId === d.id} onChange={() => setDatasetId(d.id)} />
                    <span className="choice-name">{d.filename}</span>
                    <span className="muted">{formatBytes(d.sizeBytes)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <FileDrop onFile={upload} busy={uploading} />
        </fieldset>

        <label>
          What do you want to find out?
          <textarea
            rows={4}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Example: Which region has the highest total revenue?"
            maxLength={2000}
          />
        </label>
        <div className="chips" aria-label="Example questions">
          {EXAMPLES.map((text) => (
            <button type="button" className="chip" key={text} onClick={() => setObjective(text)}>
              {text}
            </button>
          ))}
        </div>

        {error && (
          <p className="error" role="alert">
            {error} {/run/i.test(error) && <Link to="/">See your analyses.</Link>}
          </p>
        )}
        <div>
          <button className="btn" type="submit" disabled={!ready}>
            {busy ? 'Starting…' : 'Start analysis'}
          </button>
        </div>
      </form>
    </>
  );
}
