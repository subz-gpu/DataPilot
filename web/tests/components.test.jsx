import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/api.js', () => ({
  restoreSession: vi.fn(async () => null),
  setAuthLostHandler: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getRun: vi.fn(),
  streamRun: vi.fn(),
  getFileBlob: vi.fn(async () => new Blob(['x'])),
  deleteRun: vi.fn(),
}));

import * as api from '../src/lib/api.js';
import { AuthProvider } from '../src/auth/AuthContext.jsx';
import Markdown from '../src/components/Markdown.jsx';
import RunLog from '../src/components/RunLog.jsx';
import LoginPage from '../src/pages/Login.jsx';
import RunPage from '../src/pages/Run.jsx';
import { replay } from '../src/lib/runState.js';

let seq = 0;
const ev = (type, data = {}) => ({ seq: seq++, type, ts: 't', data });
const events = () => {
  seq = 0;
  return [
    ev('profile_ready', { profile: { rows: 1000, columns: 7 } }),
    ev('plan_created', { plan: [{ title: 'Clean the data', goal: 'Fix types' }, { title: 'Totals by region', goal: 'Sum revenue' }] }),
    ev('step_started', { index: 1, total: 2, title: 'Clean the data' }),
    ev('attempt_started', { index: 1, attempt: 1 }),
    ev('code_generated', { index: 1, attempt: 1, code: "print(df['nope'])" }),
    ev('execution_result', { index: 1, attempt: 1, execution: { success: false, stderr: "Traceback\nKeyError: 'nope'", stdout: '' } }),
    ev('retry', { index: 1, attempt: 1, reason: 'execution failed' }),
    ev('attempt_started', { index: 1, attempt: 2 }),
    ev('code_generated', { index: 1, attempt: 2, code: 'print(len(df))' }),
    ev('execution_result', { index: 1, attempt: 2, execution: { success: true, stdout: '981 rows used', stderr: '' } }),
    ev('critic_verdict', { index: 1, attempt: 2, verdict: { approve: true, issues: [], caveats: [] } }),
    ev('step_done', { index: 1, title: 'Clean the data', status: 'approved', caveats: ['19 rows had no unit count.'] }),
  ];
};

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Signed in home</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('LoginPage', () => {
  it('signs in and moves to the home page', async () => {
    api.login.mockResolvedValueOnce({ id: 'u1', email: 'ada@example.com' });
    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(api.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'a-long-password' });
    expect(await screen.findByText('Signed in home')).toBeInTheDocument();
  });

  it('shows the server\'s message when sign-in fails', async () => {
    api.login.mockRejectedValueOnce(new Error('Incorrect email or password.'));
    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  });

  it('switches to account creation with a name field and a password hint', async () => {
    renderLogin();
    await userEvent.click(await screen.findByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters.')).toBeInTheDocument();
  });
});

describe('RunLog', () => {
  it('shows each attempt, the failure, the reviewer verdict and the caveats', () => {
    render(<RunLog state={replay(events())} />);
    const log = screen.getByRole('list', { name: 'Run log' });
    expect(within(log).getByText('Step 1: Clean the data')).toBeInTheDocument();
    expect(within(log).getByText('Script failed: KeyError: \'nope\'')).toBeInTheDocument();
    expect(within(log).getByText('Reviewer approved')).toBeInTheDocument();
    expect(within(log).getByText('Approved')).toBeInTheDocument();
    expect(within(log).getByText('19 rows had no unit count.')).toBeInTheDocument();
    expect(within(log).getByText('1,000 rows, 7 columns')).toBeInTheDocument();
    expect(within(log).getByText('Waiting')).toBeInTheDocument(); // step 2 has not started
  });

  it('keeps code and output behind disclosures', () => {
    render(<RunLog state={replay(events())} />);
    expect(screen.getAllByText('Show the code').length).toBe(2);
    expect(screen.getByText('Show the error')).toBeInTheDocument();
    expect(screen.getByText('Show the output')).toBeInTheDocument();
  });
});

describe('Markdown', () => {
  it('never renders raw HTML or images from the model, and opens links safely', () => {
    const { container } = render(
      <Markdown>{'## Summary\n\n<script>alert(1)</script><img src="http://evil.example/x.png">\n\n![tracker](http://evil.example/t.png)\n\n[docs](https://example.com)\n\n| a | b |\n|---|---|\n| 1 | 2 |'}</Markdown>
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
  });
});

describe('RunPage', () => {
  const baseRun = { id: 'r1', objective: 'Which region has the highest total revenue?', status: 'running', createdAt: new Date().toISOString(), steps: [], files: [], plan: [], llmCalls: 0, report: null };

  function renderRun() {
    return render(
      <MemoryRouter initialEntries={['/runs/r1']}>
        <Routes>
          <Route path="/runs/:id" element={<RunPage />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('shows progress while the agent works, then the report once it finishes', async () => {
    api.getRun.mockResolvedValueOnce(baseRun);
    let finish;
    api.streamRun.mockImplementationOnce(async (id, { onEvent }) => {
      events().forEach(onEvent);
      await new Promise((resolve) => (finish = resolve));
      onEvent({ seq: 50, type: 'report_ready', ts: 't', data: { report: '## Summary\nNorth wins.' } });
      onEvent({ seq: 51, type: 'run_finished', ts: 't', data: { ok: true, llm_calls: 6 } });
    });
    api.getRun.mockResolvedValue({ ...baseRun, status: 'succeeded', report: '## Summary\nNorth wins.', files: ['chart.png', 'cleaned.parquet'], llmCalls: 6, steps: [{ index: 1, title: 'Clean the data', status: 'approved', caveats: [] }] });

    renderRun();
    expect(await screen.findByRole('heading', { name: baseRun.objective })).toBeInTheDocument();
    expect(await screen.findByText('Step 1: Clean the data')).toBeInTheDocument();
    expect(screen.getByText('Working on step 1 of 2: Clean the data')).toBeInTheDocument();
    expect(screen.queryByText('North wins.')).not.toBeInTheDocument();

    finish();
    expect(await screen.findByText('North wins.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'cleaned.parquet' })).toBeInTheDocument();
    expect(screen.getByText('How the agent got there')).toBeInTheDocument();
  });

  it('shows the saved report straight away for a finished run, even if the stream is unavailable', async () => {
    api.getRun.mockResolvedValue({ ...baseRun, status: 'succeeded', report: '## Summary\nSaved report text.', llmCalls: 4 });
    api.streamRun.mockRejectedValueOnce(new Error('Run not found.'));
    renderRun();
    expect(await screen.findByText('Saved report text.')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('reports a run that could not be loaded', async () => {
    api.getRun.mockRejectedValueOnce(new Error('Run not found.'));
    api.streamRun.mockResolvedValueOnce(undefined);
    renderRun();
    expect(await screen.findByRole('alert')).toHaveTextContent('Run not found.');
  });
});

describe('Markdown tables', () => {
  it('right-aligns columns that hold only numbers and leaves text columns alone', async () => {
    const { container } = render(
      <Markdown>{'| Region | Revenue | Share |\n|---|---|---|\n| North | 1,785,354.74 | 25.5% |\n| West | 1,773,857.18 | 25.3% |'}</Markdown>
    );
    await waitFor(() => expect(container.querySelectorAll('td.num').length).toBe(4));
    const headers = container.querySelectorAll('th');
    expect(headers[0]).not.toHaveClass('num');
    expect(headers[1]).toHaveClass('num');
    expect(headers[2]).toHaveClass('num');
    expect(container.querySelector('tbody td')).not.toHaveClass('num');
  });
});
