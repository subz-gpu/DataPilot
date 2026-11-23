import { useRef, useState } from 'react';

export default function FileDrop({ onFile, busy = false }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);

  function take(files) {
    const file = files?.[0];
    if (file) onFile(file);
    if (input.current) input.current.value = '';
  }

  return (
    <div
      className={`drop${over ? ' drop-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <p className="drop-title">{busy ? 'Uploading…' : 'Drop a data file here'}</p>
      <p className="muted">CSV, Excel, Parquet or JSON</p>
      <label className="btn secondary">
        Choose a file
        <input
          ref={input}
          type="file"
          className="visually-hidden"
          accept=".csv,.txt,.xlsx,.xls,.parquet,.json"
          disabled={busy}
          onChange={(e) => take(e.target.files)}
        />
      </label>
    </div>
  );
}
