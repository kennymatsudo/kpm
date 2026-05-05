/**
 * Tests for shared utility functions and constants
 */

import { describe, it, expect } from 'vitest';
import { isSubtaskIssueType } from './types';

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
