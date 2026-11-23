import { describe, expect, it } from 'vitest';
import { formatBytes, formatNumber, isTerminal, statusLabel, timeAgo } from '../src/lib/format.js';

describe('format helpers', () => {
  it('formats file sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(40145)).toBe('39 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('describes elapsed time in words', () => {
    const now = new Date('2026-11-18T12:00:00Z').getTime();
    expect(timeAgo('2026-11-18T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-11-18T11:30:00Z', now)).toBe('30 min ago');
    expect(timeAgo('2026-11-18T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-15T12:00:00Z', now)).toBe('3 d ago');
    expect(timeAgo(null, now)).toBe('');
  });

  it('formats numbers and statuses', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(statusLabel('succeeded')).toBe('Done');
    expect(isTerminal('running')).toBe(false);
    expect(isTerminal('error')).toBe(true);
  });
});
