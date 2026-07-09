/**
 * Same-file edit accumulation in the built-in Edit interception.
 *
 * Background (the bug this guards against): Claude makes several `Edit` calls to
 * ONE project file in a single turn; the user approves the visible approval
 * card; only the last edit lands and the earlier edits silently vanish.
 *
 * Root cause: the built-in `Edit` interception in `permissions.ts` computes each
 * edit's full-file snapshot by reading the file. Because the interception DENIES
 * the write (nothing hits disk), reading disk for every edit yields the SAME
 * unchanged base, so the snapshots are NON-cumulative (each contains only its
 * own change). The approval queue dedupes same-file snapshots by path and keeps
 * only the last one, dropping the rest. (Renderer half proven in
 * src/renderer/stores/approvalQueueStore.test.ts.)
 *
 * Fix: the interception reads `context.peekPendingFile(relativePath)` first —
 * the per-turn pending cache populated as each edit is captured — so successive
 * edits accumulate, matching the `propose_document_edit` tool path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPermissionHandler,
  type PermissionContext,
  type PromptUserFn,
} from './permissions';

// permissions.ts imports clientManager at module load; stub it.
vi.mock('./clientManager', () => ({
  clientManager: {
    hasPermissionCached: vi.fn(),
    hasAllowAllRemaining: vi.fn(),
    cachePermission: vi.fn(),
    clearPermissionCache: vi.fn(),
  },
}));

const PROJECT_PATH = '/tmp/kpm-project';
const FILE_ABS = `${PROJECT_PATH}/guide.md`;

// Original on-disk content with two independent sections.
const DISK = ['# Guide', 'Section A: old-A', 'Section B: old-B', ''].join('\n');

function testOptions() {
  return { signal: new AbortController().signal, toolUseID: 'tu-1', requestId: 'req-1' };
}

async function editFile(
  handler: ReturnType<typeof createPermissionHandler>,
  oldString: string,
  newString: string
) {
  return handler(
    'Edit',
    { file_path: FILE_ABS, old_string: oldString, new_string: newString },
    testOptions()
  );
}

describe('built-in Edit interception — same-file edit accumulation', () => {
  let captured: { filePath: string; content: string }[];

  beforeEach(() => {
    captured = [];
  });

  // promptUser is never reached for intercepted edits (they short-circuit to deny).
  const promptUser: PromptUserFn = async () => ({ behavior: 'allow', updatedInput: {} });

  it('WITHOUT a pending cache, snapshots are non-cumulative (the pre-fix failure mode)', async () => {
    const context: PermissionContext = {
      projectPath: PROJECT_PATH,
      projectId: 'proj-1',
      onProjectFileWrite: (_p, filePath, content) => captured.push({ filePath, content }),
      // Faithful to production: the Edit write is DENIED, so disk never changes.
      readProjectFile: async () => DISK,
      // No peekPendingFile wired — reproduces the original lossy behavior.
    };
    const handler = createPermissionHandler(context, promptUser);

    await editFile(handler, 'Section A: old-A', 'Section A: NEW-A');
    await editFile(handler, 'Section B: old-B', 'Section B: NEW-B');

    expect(captured).toHaveLength(2);
    // The last snapshot (the one the queue keeps) is missing edit A entirely.
    const surviving = captured[captured.length - 1].content;
    expect(surviving).toContain('NEW-B');
    expect(surviving).not.toContain('NEW-A');
  });

  it('WITH the pending cache wired, successive edits accumulate (the fix)', async () => {
    // Mirror StreamingSessionService wiring: peek reads a per-turn cache that the
    // write callback populates, both keyed by project-relative path.
    const pending = new Map<string, string>();
    const context: PermissionContext = {
      projectPath: PROJECT_PATH,
      projectId: 'proj-1',
      readProjectFile: async () => DISK,
      peekPendingFile: (relativePath) => pending.get(relativePath),
      onProjectFileWrite: (_p, filePath, content) => {
        pending.set(filePath, content); // record-on-write, as in production
        captured.push({ filePath, content });
      },
    };
    const handler = createPermissionHandler(context, promptUser);

    await editFile(handler, 'Section A: old-A', 'Section A: NEW-A');
    await editFile(handler, 'Section B: old-B', 'Section B: NEW-B');

    expect(captured).toHaveLength(2);
    // The final snapshot — what the user approves — now contains BOTH edits.
    const surviving = captured[captured.length - 1].content;
    expect(surviving).toContain('NEW-A');
    expect(surviving).toContain('NEW-B');
    expect(surviving).not.toContain('old-A');
    expect(surviving).not.toContain('old-B');
  });
});
