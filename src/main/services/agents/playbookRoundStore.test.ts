import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createTestDb } from '../../db/testing/createTestDb';
import { AgentReviewRepository } from '../../db/repositories/impl/AgentReviewRepository';
import type { PlaybookStep } from '../../../shared/playbooks';
import type { DevSession } from '../../../shared/types';
import { toPlaybookSubagentSessionId } from './autoReview';
import { createPlaybookRoundStore } from './playbookRoundStore';

const step = {
  id: 'review',
  session: 'subagent',
  runs: [[{ provider: 'codex' }], [{ provider: 'codex' }]],
  runOverrides: [{ axis: 'standards' }, { axis: 'spec' }],
  directive: { kind: 'prompt' },
} as unknown as PlaybookStep;

const session = { id: 'session-1', step_pass_counts: null } as unknown as DevSession;

describe('playbookRoundStore.reconstructRunGroup', () => {
  let db: Database;
  let repo: AgentReviewRepository;

  beforeEach(() => {
    db = createTestDb();
    db.prepare(`INSERT INTO projects (id, name, folder_path) VALUES ('project-1', 'P', '/tmp/p')`).run();
    db.prepare(`INSERT INTO repos (id, project_id, path) VALUES ('repo-1', 'project-1', '/tmp/p/repo')`).run();
    db.prepare(`
      INSERT INTO dev_sessions (id, project_id, repo_id, worktree_path, branch_name)
      VALUES ('session-1', 'project-1', 'repo-1', '/tmp/p/wt', 'feature/x')
    `).run();
    repo = new AgentReviewRepository(db);
  });

  afterEach(() => db.close());

  function persistRun(runIndex: number, axis: 'standards' | 'spec' | undefined) {
    repo.persistCompletedReview({
      implementation_session_id: session.id,
      review_session_id: toPlaybookSubagentSessionId(session.id, step.id, 0, runIndex),
      reviewer_agent: 'codex',
      raw_output: `run ${runIndex}`,
      step_id: step.id,
      run_index: runIndex,
      findings: [{ severity: 'warning', description: `finding ${runIndex}`, agent: 'codex', source: 'agent', ...(axis ? { axis } : {}) }],
    });
  }

  function reconstruct() {
    const store = createPlaybookRoundStore({ agentReviews: repo, saveOutputs: () => {} });
    return store.reconstructRunGroup(session, step, 2);
  }

  it('keeps each persisted finding\'s review lens after a restart', () => {
    persistRun(0, 'standards');
    // The reviewer's own lens wins over the run's.
    persistRun(1, 'standards');

    const group = reconstruct();

    expect(group.findings.map((finding) => [finding.description, finding.axis])).toEqual([
      ['finding 0', 'standards'],
      ['finding 1', 'standards'],
    ]);
  });

  it('gives rows saved without a lens the lens of the run that produced them', () => {
    persistRun(0, undefined);
    persistRun(1, undefined);

    const group = reconstruct();

    expect(group.findings.map((finding) => finding.axis)).toEqual(['standards', 'spec']);
  });
});
