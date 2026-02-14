/**
 * Tests for issue fetching utilities
 */

import { describe, it, expect, vi } from 'vitest';
import { fetchIssuesWithSubtasks } from './fetchingUtils';
import type { TrackerClient, ExternalIssue } from '../tracker-clients';

// Helper to create mock issues
function createIssue(key: string, issueType: string, parentKey: string | null = null): ExternalIssue {
  return {
    key,
    id: key,
    title: `${key} title`,
    description: null,
    issueType,
    status: 'To Do',
    parentKey,
    epicKey: null,
    updatedAt: new Date().toISOString(),
    url: `https://jira.example.com/browse/${key}`,
  };
}

// Helper to create async generator from array
async function* arrayToAsyncGenerator<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield await Promise.resolve(item);
  }
}

function createMockClient(responses: Map<string, ExternalIssue[]>): TrackerClient {
  return {
    type: 'jira',
    testConnection: vi.fn(),
    getAvailableProjects: vi.fn(),
    fetchIssues: vi.fn(),
      return arrayToAsyncGenerator(issues);
    }),
    fetchIssue: vi.fn(),
    searchIssues: vi.fn(),
  };
}

describe('fetchIssuesWithSubtasks', () => {
  describe('basic fetching', () => {
    it('fetches issues from main JQL filter', async () => {
      const story1 = createIssue('PROJ-1', 'Story');
      const story2 = createIssue('PROJ-2', 'Story');

      const responses = new Map([
        ['project = PROJ', [story1, story2]],
      ]);
      const client = createMockClient(responses);

      const result = await fetchIssuesWithSubtasks(client, 'project = PROJ');

      expect(result).toHaveLength(2);
      expect(result.map(i => i.key)).toEqual(['PROJ-1', 'PROJ-2']);
    });

    it('returns empty array when no issues match', async () => {
      const responses = new Map<string, ExternalIssue[]>([
        ['project = EMPTY', []],
      ]);
      const client = createMockClient(responses);

      const result = await fetchIssuesWithSubtasks(client, 'project = EMPTY');

      expect(result).toHaveLength(0);
    });
  });

  describe('recursive subtask fetching', () => {
    it('fetches subtasks of non-subtask issues', async () => {
      const story = createIssue('PROJ-1', 'Story');
      const subtask1 = createIssue('PROJ-2', 'Sub-task', 'PROJ-1');
      const subtask2 = createIssue('PROJ-3', 'Sub-task', 'PROJ-1');

      const responses = new Map([
        ['project = PROJ', [story]],
      ]);
      const client = createMockClient(responses);

      const result = await fetchIssuesWithSubtasks(client, 'project = PROJ');

      expect(result).toHaveLength(3);
      expect(result.map(i => i.key).sort()).toEqual(['PROJ-1', 'PROJ-2', 'PROJ-3']);
    });

    it('does not fetch subtasks of subtask issues', async () => {
      const subtask = createIssue('PROJ-1', 'Sub-task');

      const responses = new Map([
        ['project = PROJ', [subtask]],
      ]);
      const client = createMockClient(responses);

      const result = await fetchIssuesWithSubtasks(client, 'project = PROJ');

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('PROJ-1');
    });

    it('deduplicates issues across fetches', async () => {
      const story = createIssue('PROJ-1', 'Story');

      const responses = new Map([
      ]);
      const client = createMockClient(responses);

      const result = await fetchIssuesWithSubtasks(client, 'project = PROJ');

      expect(result).toHaveLength(1);
    });

    it('handles multi-level hierarchy (story with subtasks)', async () => {
      const epic = createIssue('PROJ-1', 'Epic');
      const story = createIssue('PROJ-2', 'Story', 'PROJ-1');
      const subtask = createIssue('PROJ-3', 'Sub-task', 'PROJ-2');

      const responses = new Map([
        ['parent = EPIC-1', [epic, story]],
      ]);
      const client = createMockClient(responses);

      const result = await fetchIssuesWithSubtasks(client, 'parent = EPIC-1');

      expect(result).toHaveLength(3);
    });
  });

  describe('progress reporting', () => {
    it('calls progress callback during fetching', async () => {
      // Create 15 issues to trigger progress reports
      const issues = Array.from({ length: 15 }, (_, i) =>
        createIssue(`PROJ-${i + 1}`, 'Sub-task')
      );

      const responses = new Map([
        ['project = PROJ', issues],
      ]);
      const client = createMockClient(responses);
      const onProgress = vi.fn();

      await fetchIssuesWithSubtasks(client, 'project = PROJ', onProgress);

      // Progress reported at 10 (PROGRESS_REPORT_INTERVAL) and final 15
      expect(onProgress).toHaveBeenCalledWith(10);
      expect(onProgress).toHaveBeenCalledWith(15);
    });

    it('does not call progress callback when no issues', async () => {
      const responses = new Map<string, ExternalIssue[]>([
        ['project = EMPTY', []],
      ]);
      const client = createMockClient(responses);
      const onProgress = vi.fn();

      await fetchIssuesWithSubtasks(client, 'project = EMPTY', onProgress);

      expect(onProgress).not.toHaveBeenCalled();
    });
  });
});
