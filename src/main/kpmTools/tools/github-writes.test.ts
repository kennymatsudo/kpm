import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runWithToolExecutionContext } from '../runtime';
import { createGitHubWriteTools } from './github-writes';
import type { WriteDecision } from '../../chat/writeGrants';
import type * as GhUtils from '../../services/repo/ghUtils';

const resolveCurrentBranch = vi.fn();
const classifyPushTarget = vi.fn();
const resolveDefaultBranch = vi.fn();
const isBranchPushed = vi.fn();
const createPr = vi.fn();
const getPrForBranch = vi.fn();
const editPr = vi.fn();

vi.mock('../../services/repo/branchFacts', () => ({
  resolveCurrentBranch: (...args: unknown[]) => resolveCurrentBranch(...args),
  classifyPushTarget: (...args: unknown[]) => classifyPushTarget(...args),
  resolveDefaultBranch: (...args: unknown[]) => resolveDefaultBranch(...args),
}));

vi.mock('../../services/repo/ghUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof GhUtils>()),
  isBranchPushed: (...args: unknown[]) => isBranchPushed(...args),
  createPr: (...args: unknown[]) => createPr(...args),
  getPrForBranch: (...args: unknown[]) => getPrForBranch(...args),
  editPr: (...args: unknown[]) => editPr(...args),
  describeGhFailure: async (_cwd: string, error: unknown) => String((error as Error).message),
}));

vi.mock('../../config', () => ({
  getConfig: () => ({ agentSession: { prCreateTimeoutMs: 1000 }, claude: { debug: false } }),
}));

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const PLAN_ITEM_ID = '7f3c2a1e-4b5d-4c6e-8f90-1a2b3c4d5e6f';
const REPO_PATH = '/repos/kpm';

function makeTools(decision: WriteDecision = { allowed: true }) {
  const requestWriteAccess = vi.fn(async (): Promise<WriteDecision> => decision);
  const [createTool, updateTool] = createGitHubWriteTools({
    repos: { getByProject: () => [{ path: REPO_PATH, active_worktree_path: null }] as never },
    planItems: { getByProject: () => [{ id: PLAN_ITEM_ID, external_key: 'ASUP-1', external_url: 'https://linear.app/x/issue/ASUP-1', title: 'Task' }] as never },
    requestWriteAccess,
  });
  return { createTool, updateTool, requestWriteAccess };
}

function call(tool: unknown, input: Record<string, unknown>) {
  return runWithToolExecutionContext({ projectId: PROJECT_ID }, () => (tool as any).handler(input));
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveCurrentBranch.mockResolvedValue('feature/add-thing');
  classifyPushTarget.mockImplementation(async (_cwd: string, branch: string) => ({ ok: true, branch }));
  resolveDefaultBranch.mockResolvedValue('main');
  isBranchPushed.mockResolvedValue(true);
  createPr.mockResolvedValue({ number: 42, url: 'https://github.com/o/r/pull/42' });
});

describe('create_pull_request', () => {
  it('opens a draft for the checked-out branch against the default branch when draft is omitted', async () => {
    const { createTool } = makeTools();

    const result = await call(createTool, { title: 'Add thing', body: 'Body' });

    expect(result.isError).toBeFalsy();
    expect(createPr).toHaveBeenCalledWith(
      REPO_PATH,
      expect.objectContaining({ head: 'feature/add-thing', base: 'main', draft: true }),
      1000
    );
    expect(JSON.parse(result.content[0].text)).toMatchObject({ number: 42 });
  });

  it('rewrites plan refs in the body before it leaves KPM', async () => {
    const { createTool } = makeTools();

    await call(createTool, { title: 'Add thing', body: `Implements @plan/${PLAN_ITEM_ID}`, draft: true });

    const sentBody: string = createPr.mock.calls[0][1].body;
    expect(sentBody).not.toContain('@plan/');
    expect(sentBody).toContain('ASUP-1');
  });

  it('asks to push first when the branch is not on the remote', async () => {
    const { createTool, requestWriteAccess } = makeTools();
    isBranchPushed.mockResolvedValue(false);

    const result = await call(createTool, { title: 'T', body: 'B', draft: true });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/git_push/);
    expect(result.content[0].text).toMatch(/another remote cannot be opened/);
    expect(requestWriteAccess).not.toHaveBeenCalled();
    expect(createPr).not.toHaveBeenCalled();
  });

  it('refuses a protected head branch', async () => {
    const { createTool } = makeTools();
    classifyPushTarget.mockResolvedValue({ ok: false, reason: 'main is protected' });

    const result = await call(createTool, { title: 'T', body: 'B', draft: true });

    expect(result.isError).toBe(true);
    expect(createPr).not.toHaveBeenCalled();
  });

  it('creates nothing when the user declines writes', async () => {
    const { createTool } = makeTools({ allowed: false, reason: 'The user declined publishing.' });

    const result = await call(createTool, { title: 'T', body: 'B', draft: true });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/declined publishing/);
    expect(createPr).not.toHaveBeenCalled();
  });

  it('adopts the PR GitHub opened when gh timed out after the create landed', async () => {
    const { GhTimeoutError } = await import('../../services/repo/ghUtils');
    const { createTool } = makeTools();
    createPr.mockRejectedValue(new GhTimeoutError('timed out'));
    getPrForBranch.mockResolvedValue({ number: 43, url: 'https://github.com/o/r/pull/43', state: 'OPEN' });

    const result = await call(createTool, { title: 'T', body: 'B', draft: true });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toMatchObject({ number: 43 });
  });
});

describe('update_pull_request', () => {
  it('edits only the fields it was given', async () => {
    const { updateTool } = makeTools();

    const result = await call(updateTool, { pr: '#12', title: 'ASUP-1: New title' });

    expect(result.isError).toBeFalsy();
    expect(editPr).toHaveBeenCalledWith(REPO_PATH, '12', { title: 'ASUP-1: New title', body: undefined });
  });

  it('rejects a call with nothing to change without asking for writes', async () => {
    const { updateTool, requestWriteAccess } = makeTools();

    const result = await call(updateTool, { pr: '12' });

    expect(result.isError).toBe(true);
    expect(requestWriteAccess).not.toHaveBeenCalled();
  });

  it('rejects a PR reference that could reach gh as a flag', async () => {
    const { updateTool } = makeTools();

    const result = await call(updateTool, { pr: '--repo=evil/repo', body: 'x' });

    expect(result.isError).toBe(true);
    expect(editPr).not.toHaveBeenCalled();
  });
});
