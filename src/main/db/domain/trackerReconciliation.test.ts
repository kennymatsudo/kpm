import { describe, expect, it } from 'vitest';
import { classifyFieldChange, hasFieldDrifted } from './trackerReconciliation';
import { normalizeMarkdown } from '../../documents';

describe('classifyFieldChange', () => {
  it('classifies unchanged when local and remote both match the snapshot', () => {
    const result = classifyFieldChange({
      local: 'Ship the fix',
      remote: 'Ship the fix',
      snapshot: 'Ship the fix',
    });

    expect(result).toEqual({
      status: 'unchanged',
      local: 'Ship the fix',
      remote: 'Ship the fix',
    });
  });

  it('classifies localChanged when only the local value moved off the snapshot', () => {
    const result = classifyFieldChange({
      local: 'Ship the fix (local edit)',
      remote: 'Ship the fix',
      snapshot: 'Ship the fix',
    });

    expect(result).toEqual({
      status: 'localChanged',
      local: 'Ship the fix (local edit)',
      remote: 'Ship the fix',
    });
  });

  it('classifies remoteChanged when only the remote value moved off the snapshot', () => {
    const result = classifyFieldChange({
      local: 'Ship the fix',
      remote: 'Ship the fix (tracker edit)',
      snapshot: 'Ship the fix',
    });

    expect(result).toEqual({
      status: 'remoteChanged',
      local: 'Ship the fix',
      remote: 'Ship the fix (tracker edit)',
    });
  });

  it('classifies conflict when both sides moved off the snapshot to different values', () => {
    const result = classifyFieldChange({
      local: 'Ship the fix (local edit)',
      remote: 'Ship the fix (tracker edit)',
      snapshot: 'Ship the fix',
    });

    expect(result).toEqual({
      status: 'conflict',
      local: 'Ship the fix (local edit)',
      remote: 'Ship the fix (tracker edit)',
    });
  });

  it('classifies unchanged (not conflict) when both sides drifted to the same value', () => {
    const result = classifyFieldChange({
      local: 'Ship the fix (edit)',
      remote: 'Ship the fix (edit)',
      snapshot: 'Ship the fix',
    });

    expect(result.status).toBe('unchanged');
  });

  it('treats superficially different markdown as equal once normalized', () => {
    const result = classifyFieldChange({
      local: '* item one\n* item two',
      remote: '- item one\n- item two',
      snapshot: '* item one\n* item two',
      normalize: normalizeMarkdown,
    });

    expect(result.status).toBe('unchanged');
  });

  it('with no snapshot (first sync), classifies remoteChanged when local and remote differ', () => {
    const result = classifyFieldChange({
      local: 'Imported title',
      remote: 'Imported title (tracker)',
      snapshot: null,
    });

    expect(result).toEqual({
      status: 'remoteChanged',
      local: 'Imported title',
      remote: 'Imported title (tracker)',
    });
  });

  it('with no snapshot (first sync), classifies unchanged when local and remote already match', () => {
    const result = classifyFieldChange({
      local: 'Imported title',
      remote: 'Imported title',
      snapshot: null,
    });

    expect(result.status).toBe('unchanged');
  });
});

describe('hasFieldDrifted', () => {
  it('reports no drift when the remote value still matches the snapshot', () => {
    expect(
      hasFieldDrifted({ remote: 'Ship the fix', snapshot: 'Ship the fix' })
    ).toBe(false);
  });

  it('reports drift when the remote value has moved off the snapshot', () => {
    expect(
      hasFieldDrifted({ remote: 'Ship the fix (tracker edit)', snapshot: 'Ship the fix' })
    ).toBe(true);
  });

  it('treats superficially different markdown as equal once normalized', () => {
    expect(
      hasFieldDrifted({
        remote: '- item one\n- item two',
        snapshot: '* item one\n* item two',
        normalize: normalizeMarkdown,
      })
    ).toBe(false);
  });

  it('with no snapshot (first sync), reports no drift regardless of remote value', () => {
    expect(
      hasFieldDrifted({ remote: 'Anything', snapshot: null })
    ).toBe(false);
  });
});
