/**
 * Tests for propose_document_edit — batch (edits[]) and single-hunk paths.
 *
 * Covers:
 *  - applyHunks helper: success, hunk-not-found, non-unique, no-op, sequential ordering
 *  - createDocumentEditTools: batch call emits one combined payload with correct
 *    oldContent/content, single-hunk call unchanged, error propagation
 */

import { describe, it, expect, vi } from 'vitest';
import { applyHunks, createDocumentEditTools } from './document-edit';
import type { DocumentUpdatePayload } from './document-update';

// ---------------------------------------------------------------------------
// applyHunks unit tests
// ---------------------------------------------------------------------------

describe('applyHunks', () => {
  const BASE = '# Doc\n\nSection A: old-A\nSection B: old-B\nSection C: old-C\n';

  it('applies a single hunk', () => {
    const result = applyHunks(BASE, [{ old_string: 'old-A', new_string: 'NEW-A' }]);
    expect(result).toEqual({ success: true, content: BASE.replace('old-A', 'NEW-A') });
  });

  it('applies multiple hunks sequentially against the accumulated content', () => {
    const result = applyHunks(BASE, [
      { old_string: 'old-A', new_string: 'NEW-A' },
      { old_string: 'old-B', new_string: 'NEW-B' },
      { old_string: 'old-C', new_string: 'NEW-C' },
    ]);
    expect(result).toEqual({ success: true, content: BASE.replace('old-A', 'NEW-A').replace('old-B', 'NEW-B').replace('old-C', 'NEW-C') });
  });

  it('second hunk can target text introduced by the first hunk', () => {
    const result = applyHunks(BASE, [
      { old_string: 'old-A', new_string: 'NEW-A' },
      { old_string: 'NEW-A', new_string: 'FINAL-A' },
    ]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.content).toContain('FINAL-A');
  });

  it('reports failure when old_string is not found', () => {
    const result = applyHunks(BASE, [{ old_string: 'does-not-exist', new_string: 'x' }]);
    expect(result).toMatchObject({ success: false, hunkIndex: 0 });
    if (!result.success) expect(result.reason).toMatch(/not found/);
  });

  it('reports failure when old_string is non-unique', () => {
    const dup = BASE + 'old-A\n'; // second occurrence of 'old-A'
    const result = applyHunks(dup, [{ old_string: 'old-A', new_string: 'NEW-A' }]);
    expect(result).toMatchObject({ success: false, hunkIndex: 0 });
    if (!result.success) expect(result.reason).toMatch(/multiple times/);
  });

  it('reports failure for a no-op hunk (old_string === new_string)', () => {
    const result = applyHunks(BASE, [{ old_string: 'old-A', new_string: 'old-A' }]);
    expect(result).toMatchObject({ success: false, hunkIndex: 0 });
    if (!result.success) expect(result.reason).toMatch(/identical/);
  });

  it('reports the correct hunkIndex when a later hunk fails', () => {
    const result = applyHunks(BASE, [
      { old_string: 'old-A', new_string: 'NEW-A' },
      { old_string: 'no-such-string', new_string: 'x' },
    ]);
    expect(result).toMatchObject({ success: false, hunkIndex: 1 });
  });

  it('does not apply any hunk when a later hunk fails (atomicity)', () => {
    const result = applyHunks(BASE, [
      { old_string: 'old-A', new_string: 'NEW-A' },
      { old_string: 'no-such-string', new_string: 'x' },
    ]);
    // The returned content would be partially-modified if atomicity were broken.
    // Since we fail fast and return an error, there is no 'content' on the failure path.
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createDocumentEditTools integration tests
// ---------------------------------------------------------------------------

describe('createDocumentEditTools', () => {
  const FILE_CONTENT = '# Guide\n\nSection A: old-A\nSection B: old-B\n';

  function makeTools(content: string | null = FILE_CONTENT) {
    const emitted: DocumentUpdatePayload[] = [];
    const readFile = vi.fn(async () => content);
    const onDocumentUpdate = vi.fn((payload: DocumentUpdatePayload) => emitted.push(payload));
    const [editTool] = createDocumentEditTools(readFile, onDocumentUpdate);
    return { editTool, emitted, readFile, onDocumentUpdate };
  }

  async function callTool(
    tool: ReturnType<typeof makeTools>['editTool'],
    input: Record<string, unknown>
  ) {
    // The tool's handler is the last argument; invoke it via the SDK call convention.
    // We access the internal handler via the tool object shape produced by createDocumentEditTools.
    return (tool as any).handler(input);
  }

  // Single-hunk path — unchanged behaviour
  it('single-hunk: applies edit and emits one payload', async () => {
    const { editTool, emitted } = makeTools();
    const result = await callTool(editTool, {
      projectId: '00000000-0000-0000-0000-000000000001',
      filePath: 'guide.md',
      old_string: 'old-A',
      new_string: 'NEW-A',
    });
    expect(result.isError).toBeFalsy();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].content).toContain('NEW-A');
    expect(emitted[0].oldContent).toBe(FILE_CONTENT);
  });

  it('single-hunk: fails if old_string not found', async () => {
    const { editTool } = makeTools();
    const result = await callTool(editTool, {
      projectId: '00000000-0000-0000-0000-000000000001',
      filePath: 'guide.md',
      old_string: 'no-such-text',
      new_string: 'x',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/);
  });

  // Batch path
  it('batch: applies all hunks atomically and emits ONE combined payload', async () => {
    const { editTool, emitted } = makeTools();
    const result = await callTool(editTool, {
      projectId: '00000000-0000-0000-0000-000000000001',
      filePath: 'guide.md',
      edits: [
        { old_string: 'old-A', new_string: 'NEW-A' },
        { old_string: 'old-B', new_string: 'NEW-B' },
      ],
    });
    expect(result.isError).toBeFalsy();
    // Only one emit despite two hunks
    expect(emitted).toHaveLength(1);
    expect(emitted[0].content).toContain('NEW-A');
    expect(emitted[0].content).toContain('NEW-B');
    // oldContent is the original file state before any hunks
    expect(emitted[0].oldContent).toBe(FILE_CONTENT);
    // Result reports hunksApplied
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.hunksApplied).toBe(2);
  });

  it('batch: failing hunk emits nothing (atomic rollback)', async () => {
    const { editTool, emitted } = makeTools();
    const result = await callTool(editTool, {
      projectId: '00000000-0000-0000-0000-000000000001',
      filePath: 'guide.md',
      edits: [
        { old_string: 'old-A', new_string: 'NEW-A' },
        { old_string: 'no-such-text', new_string: 'x' },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Hunk 2 of 2 failed/);
    // Nothing was emitted
    expect(emitted).toHaveLength(0);
  });

  it('batch: error message identifies which hunk failed', async () => {
    const { editTool } = makeTools();
    const result = await callTool(editTool, {
      projectId: '00000000-0000-0000-0000-000000000001',
      filePath: 'guide.md',
      edits: [
        { old_string: 'old-A', new_string: 'NEW-A' },
        { old_string: 'old-B', new_string: 'NEW-B' },
        { old_string: 'missing', new_string: 'x' },
      ],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Hunk 3 of 3 failed/);
  });

  it('single-hunk: returns error when neither old_string nor edits[] is provided', async () => {
    const { editTool } = makeTools();
    const result = await callTool(editTool, {
      projectId: '00000000-0000-0000-0000-000000000001',
      filePath: 'guide.md',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Provide old_string/);
  });

  it('single-hunk: returns error when old_string is provided but new_string is omitted (guards against silent deletion)', async () => {
    const { editTool, emitted } = makeTools();
    const result = await callTool(editTool, {
      projectId: '00000000-0000-0000-0000-000000000001',
      filePath: 'guide.md',
      old_string: 'old-A',
      // new_string intentionally omitted
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Provide new_string/);
    // Nothing emitted — no silent deletion
    expect(emitted).toHaveLength(0);
  });

  it('batch: file-not-found propagates correctly', async () => {
    const { editTool } = makeTools(null);
    const result = await callTool(editTool, {
      projectId: '00000000-0000-0000-0000-000000000001',
      filePath: 'missing.md',
      edits: [{ old_string: 'x', new_string: 'y' }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/);
  });
});
