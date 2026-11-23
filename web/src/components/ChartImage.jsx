import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';

/** Charts need the Authorization header, so they are fetched as blobs rather than via <img src>. */
export function useBlobUrl(runId, name) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoked = false;
    let objectUrl = null;
    api
      .getFileBlob(runId, name)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !revoked && setFailed(true));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [runId, name]);
  return { url, failed };
}

export default function ChartImage({ runId, name }) {
  const { url, failed } = useBlobUrl(runId, name);
  const title = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  if (failed) return <p className="muted">Could not load {name}.</p>;
  return (
    <figure className="chart">
      {url ? <img src={url} alt={`Chart: ${title}`} /> : <div className="chart-loading" aria-hidden="true" />}
      <figcaption>{title}</figcaption>
    </figure>
  );
}

export async function downloadFile(runId, name) {
  const blob = await api.getFileBlob(runId, name);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
