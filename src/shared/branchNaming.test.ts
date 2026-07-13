import { describe, expect, it } from 'vitest';
import { previewBranchName, renderBranchName } from './branchNaming';

const july2026 = new Date(2026, 6, 12);

describe('branch naming preference', () => {
  it('uses the same token and cleanup rules for preview and Dev Session names', () => {
    const template = '/{date}//{ticket}/{name}/';
    const subject = {
      id: 'abc123-full-id',
      title: 'Example Branch Name',
      externalKey: 'PROJ-123',
    };

    expect(previewBranchName(template, july2026)).toBe('202607/PROJ-123/example-branch-name');
    expect(renderBranchName(subject, template, july2026)).toBe(
      '202607/PROJ-123/example-branch-name'
    );
  });

  it('uses the item id when the default template has no external key', () => {
    expect(
      renderBranchName(
        { id: 'abc123-full-id', title: 'Example Branch Name', externalKey: null },
        '',
        july2026
      )
    ).toBe('abc123-example-branch-name');
  });
});
