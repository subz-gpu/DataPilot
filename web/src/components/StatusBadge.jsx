import { statusLabel } from '../lib/format.js';

const TONE = { queued: 'wait', running: 'live', succeeded: 'ok', failed: 'warn', error: 'bad' };

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${TONE[status] || 'wait'}`}>
      <span className="badge-dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}
