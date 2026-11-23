import { describe, expect, it } from 'vitest';
import { createSseParser } from '../src/lib/sse.js';

const ev = (seq, type, data = {}) => `id: ${seq}\ndata: ${JSON.stringify({ seq, type, ts: 't', data })}\n\n`;

function collect() {
  const events = [];
  return { events, parser: createSseParser((e) => events.push(e)) };
}

describe('createSseParser', () => {
  it('parses several events in one chunk', () => {
    const { events, parser } = collect();
    parser.push(ev(0, 'a') + ev(1, 'b'));
    expect(events.map((e) => e.type)).toEqual(['a', 'b']);
    expect(events[1].id).toBe('1');
  });

  it('handles an event split across chunks, even in the middle of the delimiter', () => {
    const { events, parser } = collect();
    const text = ev(0, 'split', { code: 'print("hi")' });
    parser.push(text.slice(0, 20));
    expect(events).toHaveLength(0);
    parser.push(text.slice(20, -1));
    expect(events).toHaveLength(0);
    parser.push(text.slice(-1));
    expect(events).toHaveLength(1);
    expect(events[0].data.code).toBe('print("hi")');
  });

  it('accepts bytes, including multi-byte characters split between chunks', () => {
    const { events, parser } = collect();
    const bytes = new TextEncoder().encode(ev(0, 'unicode', { text: 'héllo – ✓' }));
    parser.push(bytes.slice(0, 50));
    parser.push(bytes.slice(50));
    expect(events[0].data.text).toBe('héllo – ✓');
  });

  it('ignores keep-alive comments and malformed events', () => {
    const { events, parser } = collect();
    parser.push(': keep-alive\n\n');
    parser.push('data: {not json}\n\n');
    parser.push(ev(3, 'ok'));
    expect(events.map((e) => e.type)).toEqual(['ok']);
  });

  it('handles CRLF line endings', () => {
    const { events, parser } = collect();
    parser.push(ev(0, 'crlf').replace(/\n/g, '\r\n'));
    expect(events).toHaveLength(1);
  });
});
