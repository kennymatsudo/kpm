/**
 * Tests for shared utility functions and constants
 */

import { describe, it, expect } from 'vitest';
import { CODEX_CHAT_MODELS, DEFAULT_CODEX_CHAT_MODEL, isSubtaskIssueType } from './types';

describe('Codex chat models', () => {
  it('offers the GPT-5.6 family with Sol as the default', () => {
    expect(CODEX_CHAT_MODELS.map(({ value, label }) => ({ value, label }))).toEqual([
      { value: 'gpt-5.6-sol', label: 'Sol' },
      { value: 'gpt-5.6-terra', label: 'Terra' },
      { value: 'gpt-5.6-luna', label: 'Luna' },
    ]);
    expect(DEFAULT_CODEX_CHAT_MODEL).toBe('gpt-5.6-sol');
  });
});

describe('isSubtaskIssueType', () => {
  it.each([
    'Sub-task',
    'sub-task',
    'SUB-TASK',
    'Subtask',
    'subtask',
    'sub_task',
    'sub-issue',
    'subissue',
    'SuB-TaSk',
    'Sub-Issue',
  ])('returns true for subtask pattern %s', (input) => {
    expect(isSubtaskIssueType(input)).toBe(true);
  });

  it.each([
    'Story',
    'Task',
    'Epic',
    'Bug',
    'Feature',
    'Subtask Review',
  ])('returns false for non-subtask type %s', (input) => {
    expect(isSubtaskIssueType(input)).toBe(false);
  });

  it.each([null, undefined, ''])('returns false for %s', (input) => {
    expect(isSubtaskIssueType(input)).toBe(false);
  });
});
