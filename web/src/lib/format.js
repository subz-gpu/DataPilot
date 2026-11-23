export function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function timeAgo(value, now = Date.now()) {
  if (!value) return '';
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(value).toLocaleDateString();
}

export function formatNumber(n) {
  return typeof n === 'number' ? n.toLocaleString('en-US') : '';
}

const STATUS_LABELS = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Done',
  failed: 'Finished with problems',
  error: 'Stopped by an error',
};
export const statusLabel = (s) => STATUS_LABELS[s] || s;
export const isTerminal = (s) => s === 'succeeded' || s === 'failed' || s === 'error';
