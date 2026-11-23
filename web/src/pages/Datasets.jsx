import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api.js';
import { formatBytes, formatNumber, timeAgo } from '../lib/format.js';
import FileDrop from '../components/FileDrop.jsx';

function friendlyType(field) {
  if (field.likely_datetime) return 'Date (stored as text)';
  const t = String(field.dtype);
  if (/int|float/.test(t)) return 'Number';
  if (/bool/.test(t)) return 'Yes/No';
  if (/datetime/.test(t)) return 'Date';
  return 'Text';
}

function Columns({ profile }) {
  return (
    <div className="table-wrap">
      <p className="muted">
        {formatNumber(profile.rows)} rows, {formatNumber(profile.columns)} columns
        {profile.duplicate_rows ? `, ${formatNumber(profile.duplicate_rows)} duplicate rows` : ''}
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Column</th>
            <th scope="col">Type</th>
            <th scope="col" className="num">Missing</th>
            <th scope="col" className="num">Distinct values</th>
          </tr>
        </thead>
        <tbody>
          {profile.fields.map((f) => (
            <tr key={f.name}>
              <th scope="row">{f.name}</th>
              <td>{friendlyType(f)}</td>
              <td className="num">{f.null_pct ? `${f.null_pct}%` : 'None'}</td>
              <td className="num">{formatNumber(f.unique)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({}); // id -> { loading, profile, error }
  const [hfQuery, setHfQuery] = useState('');
  const [source, setSource] = useState('huggingface');
const [hfResults, setHfResults] = useState([]);
const [hfBusy, setHfBusy] = useState(false);
const [hfError, setHfError] = useState('');
const [importingId, setImportingId] = useState('');
const [selectedFiles, setSelectedFiles] = useState({});
const [importError, setImportError] = useState('');
  const load = () =>
    api
      .listDatasets()
      .then(setDatasets)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

async function searchDatasets(e) {
  e.preventDefault();

  if (hfQuery.trim().length < 2) {
    setHfError('Enter at least 2 characters to search.');
    return;
  }

  setHfBusy(true);
  setHfError('');
  setHfResults([]);
  setSelectedFiles({});

  try {
    const response = await api.discoverDatasets(
      hfQuery.trim(),
      10,
      source
    );

    setHfResults(response.datasets || []);
  } catch (e) {
    setHfError(e.message);
  } finally {
    setHfBusy(false);
  }
}


async function searchDatasets(e) {
  e.preventDefault();

  if (hfQuery.trim().length < 2) {
    setHfError('Enter at least 2 characters to search.');
    return;
  }

  setHfBusy(true);
  setHfError('');
  setHfResults([]);
  setSelectedFiles({});

  try {
    const response = await api.discoverDatasets(
      hfQuery.trim(),
      10,
      source
    );

    setHfResults(response.datasets || []);
  } catch (e) {
    setHfError(e.message);
  } finally {
    setHfBusy(false);
  }
}

async function importDataset(dataset, filename) {
  setImportingId(dataset.id);
  setImportError('');

  try {
    await api.importDataset(dataset.id, filename, source);
    await load();
    setImportingId('');
  } catch (e) {
    setImportError(e.message);
    setImportingId('');
  }
}

  async function upload(file) {
    setError('');
    setBusy(true);
    try {
      await api.uploadDataset(file);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleColumns(id) {
    if (open[id]) return setOpen({ ...open, [id]: undefined });
    setOpen({ ...open, [id]: { loading: true } });
    try {
      const profile = await api.getProfile(id);
      setOpen((o) => ({ ...o, [id]: { profile } }));
    } catch (e) {
      setOpen((o) => ({ ...o, [id]: { error: e.message } }));
    }
  }

  async function remove(d) {
    if (!window.confirm(`Delete ${d.filename}? Past analyses keep their reports.`)) return;
    try {
      await api.deleteDataset(d.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <div className="page-head">
  <h1>Datasets</h1>
</div>


<section className="hf-discovery">
  <h2>Discover datasets</h2>

  <p className="muted">
    Search public datasets from Hugging Face and Kaggle.
  </p>

  <form className="hf-search" onSubmit={searchDatasets}>
    <select
      value={source}
      onChange={(e) => {
        setSource(e.target.value);
        setHfResults([]);
        setHfError('');
        setSelectedFiles({});
      }}
      aria-label="Select dataset source"
    >
      <option value="huggingface">Hugging Face</option>
      <option value="kaggle">Kaggle</option>
    </select>

    <input
      type="search"
      placeholder="Try house prices, customer churn, or stock market..."
      value={hfQuery}
      onChange={(e) => setHfQuery(e.target.value)}
      aria-label={`Search ${source} datasets`}
    />

    <button type="submit" className="btn" disabled={hfBusy}>
      {hfBusy ? 'Searching...' : 'Search datasets'}
    </button>
  </form>

  {hfError && (
    <p className="error" role="alert">{hfError}</p>
  )}

  {importError && (
    <p className="error" role="alert">
      Import failed: {importError}
    </p>
  )}

  {hfBusy && (
    <p className="muted">Searching {source === 'kaggle' ? 'Kaggle' : 'Hugging Face'}...</p>
  )}

  {!hfBusy && hfResults.length > 0 && (
    <p className="muted">{hfResults.length} datasets found.</p>
  )}

  {!hfBusy && hfResults.length > 0 && (
    <div className="hf-results">
      {hfResults.map((dataset) => {
        const supportedFiles = (dataset.files || []).filter((file) => {
          const lower = file.toLowerCase();
          return lower.endsWith('.csv') || lower.endsWith('.parquet');
        });

        return (
          <article className="hf-card" key={dataset.id}>
            <div className="hf-card-head">
              <div>
                <h3>{dataset.id}</h3>
                <p className="muted">
                  By {dataset.author || 'Unknown author'}
                </p>
              </div>

              <span className="hf-score">
                {dataset.score}/100
              </span>
            </div>

            <div className="hf-meta">
              <span>Downloads: {formatNumber(dataset.downloads)}</span>
              <span>Likes: {formatNumber(dataset.likes)}</span>
              <span>License: {dataset.license || 'Not specified'}</span>
            </div>

            <p className="hf-files">
              Available files: {(dataset.files || []).join(', ')}
            </p>

            <div className="hf-actions">
              {supportedFiles.length > 0 && (
                <select
                  aria-label={`Choose CSV or Parquet file from ${dataset.id}`}
                  value={selectedFiles[dataset.id] || supportedFiles[0]}
                  onChange={(e) =>
                    setSelectedFiles((current) => ({
                      ...current,
                      [dataset.id]: e.target.value,
                    }))
                  }
                >
                  {supportedFiles.map((file) => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </select>
              )}

              {supportedFiles.length > 0 ? (
                <button
                  type="button"
                  className="btn small"
                  disabled={Boolean(importingId)}
                  onClick={() =>
                    importDataset(
                      dataset,
                      selectedFiles[dataset.id] || supportedFiles[0]
                    )
                  }
                >
                  {importingId === dataset.id
                    ? 'Importing...'
                    : `Import ${
                        (selectedFiles[dataset.id] || supportedFiles[0])
                          .toLowerCase()
                          .endsWith('.parquet')
                          ? 'Parquet'
                          : 'CSV'
                      }`}
                </button>
              ) : (
                <span className="muted">
                  No supported CSV or Parquet files available.
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  )}
</section>


<FileDrop onFile={upload} busy={busy} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {datasets && datasets.length === 0 && <p className="muted">Nothing uploaded yet.</p>}
      {datasets && datasets.length > 0 && (
        <ul className="rows">
          {datasets.map((d) => (
            <li key={d.id} className="dataset">
              <div className="row static">
                <span className="row-title">{d.filename}</span>
                <span className="row-meta">
                  <span>{formatBytes(d.sizeBytes)}</span>
                  <span>Uploaded {timeAgo(d.createdAt)}</span>
                </span>
                <span className="row-actions">
                  <Link className="btn small" to={`/new?dataset=${d.id}`}>
                    Ask a question
                  </Link>
                  <button type="button" className="btn secondary small" onClick={() => toggleColumns(d.id)} aria-expanded={Boolean(open[d.id])}>
                    {open[d.id] ? 'Hide columns' : 'View columns'}
                  </button>
                  <button type="button" className="link danger" onClick={() => remove(d)}>
                    Delete
                  </button>
                </span>
              </div>
              {open[d.id]?.loading && <p className="muted pad">Reading the fileâ€¦</p>}
              {open[d.id]?.error && <p className="error pad">{open[d.id].error}</p>}
              {open[d.id]?.profile && <Columns profile={open[d.id].profile} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}


