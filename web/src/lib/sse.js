/**
 * Incremental parser for Server-Sent Events. Feed it chunks (strings or bytes) as they arrive;
 * it calls onEvent({ id, seq, type, ts, data }) for each complete event. Comment lines
 * (keep-alives) and malformed events are skipped.
 */
export function createSseParser(onEvent) {
  const decoder = new TextDecoder();
  let buffer = '';

  function parseBlock(block) {
    let id = null;
    const data = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('id:')) id = line.slice(3).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) return null;
    try {
      return { id, ...JSON.parse(data.join('\n')) };
    } catch {
      return null;
    }
  }

  return {
    push(chunk) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = parseBlock(block);
        if (event) onEvent(event);
      }
    },
  };
}
