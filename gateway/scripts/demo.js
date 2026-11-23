#!/usr/bin/env node
/**
 * Command-line client for the gateway. It does exactly what the React and Flutter apps will do:
 * sign in, upload a dataset, start a run, follow the live event stream, read the report.
 *
 *   node scripts/demo.js ../data/sample/sales.csv "Which region has the highest total revenue?"
 */
const fs = require('node:fs');
const path = require('node:path');

const base = (process.env.GATEWAY_URL || 'http://localhost:4000').replace(/\/+$/, '');
const email = process.env.DEMO_EMAIL || 'demo@example.com';
const password = process.env.DEMO_PASSWORD || 'demo-password-123';

const [file, ...rest] = process.argv.slice(2);
const objective = rest.join(' ');
if (!file || !objective) {
  console.error('Usage: node scripts/demo.js <dataset file> "<what you want to find out>"');
  process.exit(1);
}

async function api(method, route, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(base + route, { method, headers, body: payload });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || res.statusText), { status: res.status });
  return json;
}

async function signIn() {
  try {
    return await api('POST', '/api/auth/register', { body: { email, password, name: 'Demo' } });
  } catch (e) {
    if (e.status !== 409) throw e;
    return api('POST', '/api/auth/login', { body: { email, password } });
  }
}

const describe = {
  profile_ready: (d) => `profiled: ${d.profile.rows} rows x ${d.profile.columns} columns`,
  plan_created: (d) => `plan: ${d.plan.map((s, i) => `${i + 1}. ${s.title}`).join('  ')}`,
  step_started: (d) => `step ${d.index}/${d.total}: ${d.title}`,
  attempt_started: (d) => `  attempt ${d.attempt}: writing code`,
  execution_result: (d) => `  ${d.execution.success ? 'ran OK' : 'FAILED'} in ${d.execution.duration_s}s`,
  critic_verdict: (d) => `  critic: ${d.verdict.approve ? 'approved' : 'changes requested'}`,
  retry: (d) => `  retrying (${d.reason})`,
  step_done: (d) => `  -> step ${d.index} ${d.status}`,
  reporting_started: () => 'writing the report',
  run_error: (d) => `ERROR: ${d.error}`,
};

async function watch(token, runId) {
  const res = await fetch(`${base}/api/runs/${runId}/events`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Could not open the event stream (${res.status}).`);
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const line = block.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue; // keep-alive comment
      const ev = JSON.parse(line.slice(6));
      const text = describe[ev.type]?.(ev.data);
      if (text) console.log(text);
    }
  }
}

(async () => {
  const session = await signIn();
  const token = session.accessToken;
  console.log(`Signed in as ${session.user.email}`);

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  const dataset = await api('POST', '/api/datasets', { token, form });
  console.log(`Uploaded ${dataset.filename} (${dataset.sizeBytes} bytes)`);

  const run = await api('POST', '/api/runs', { token, body: { datasetId: dataset.id, objective } });
  console.log(`Run ${run.id} started\n`);

  await watch(token, run.id);
  await new Promise((r) => setTimeout(r, 300)); // let the gateway save the final state

  const done = await api('GET', `/api/runs/${run.id}`, { token });
  console.log(`\nStatus: ${done.status} | LLM calls: ${done.llmCalls}\n`);
  console.log(done.report || done.error || '(no report)');

  const charts = (done.files || []).filter((f) => /\.(png|jpe?g)$/i.test(f));
  if (charts.length) {
    const dir = path.resolve('demo-output');
    fs.mkdirSync(dir, { recursive: true });
    for (const name of charts) {
      const r = await fetch(`${base}/api/runs/${run.id}/files/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fs.writeFileSync(path.join(dir, name), Buffer.from(await r.arrayBuffer()));
    }
    console.log(`\nSaved ${charts.length} chart(s) to ${dir}`);
  }
})().catch((e) => {
  console.error(`\nFailed: ${e.message}`);
  process.exit(1);
});
