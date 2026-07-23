/**
 * Tests for IPC validation schemas.
 *
 * Keep these focused on boundary behavior. Individual literal variants are
 * grouped so the suite catches schema drift without turning every enum value or
 * adjacent invalid shape into a standalone test.
 */

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { ValidationError, relativePath } from './validation';
import { projectEndpoints } from '../../shared/ipc/projectEndpoints';
import { planEndpoints } from '../../shared/ipc/planEndpoints';
import { chatEndpoints } from '../../shared/ipc/chatEndpoints';
import { trackerEndpoints } from '../../shared/ipc/trackerEndpoints';
import { exportEndpoints } from '../../shared/ipc/exportEndpoints';
import { shellEndpoints } from '../../shared/ipc/shellEndpoints';

const ProjectSchemas = {
  create: projectEndpoints.create.params,
  get: projectEndpoints.get.params,
  update: projectEndpoints.update.params,
};
const PlanSchemas = {
  updatePosition: planEndpoints.updatePosition.params,
  updateItem: planEndpoints.updateItem.params,
  executeActions: planEndpoints.executeActions.params,
  addRelation: planEndpoints.addRelation.params,
};
const ChatSchemas = {
  send: chatEndpoints.send.params,
};
const TrackerSchemas = {
  saveJiraCredentials: trackerEndpoints['credentials.saveJira'].params,
  addScope: trackerEndpoints['scopes.add'].params,
};
const ExportSchemas = {
  addToQueue: exportEndpoints['queue.add'].params,
  updateQueueStatus: exportEndpoints['queue.updateStatus'].params,
  updateQueueCustomFields: exportEndpoints['queue.updateCustomFields'].params,
  saveMapping: exportEndpoints['mappings.save'].params,
};
const StreamingSessionSchemas = {
  connectSession: chatEndpoints.connectSession.params,
  disconnectSession: chatEndpoints.disconnectSession.params,
  getSessionState: chatEndpoints.getSessionState.params,
};
const ShellSchemas = {
  openExternal: shellEndpoints.openExternal.params,
};

interface SafeParseSchema {
  safeParse(input: unknown): { success: boolean };
}

function expectValid(schema: SafeParseSchema, input: unknown): void {
  expect(schema.safeParse(input).success).toBe(true);
}

function expectInvalid(schema: SafeParseSchema, input: unknown): void {
  expect(schema.safeParse(input).success).toBe(false);
}

describe('ValidationError', () => {
  it('formats single error correctly', () => {
    const result = ProjectSchemas.create.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = new ValidationError(result.error);
      expect(error.message).toContain('Validation failed');
      expect(error.name).toBe('ValidationError');
    }
  });

  it('includes field path in error message', () => {
    const result = ProjectSchemas.update.safeParse({
      projectId: 'not-a-uuid',
      updates: { name: 'Valid' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = new ValidationError(result.error);
      expect(error.message).toContain('projectId');
    }
  });
});

describe('Shared Path Validation', () => {
  it('accepts normalized relative paths', () => {
    for (const input of ['docs/guide.md', 'notes/meeting-2026-02-13.md', '']) {
      expectValid(relativePath, input);
    }
  });

  it('rejects traversal and absolute paths', () => {
    for (const input of [
      '../secrets.txt',
      'docs/../secrets.txt',
      '/etc/passwd',
      'C:\\Windows\\System32\\drivers\\etc\\hosts',
      'docs//guide.md',
    ]) {
      expectInvalid(relativePath, input);
    }
  });
});

describe('ShellSchemas', () => {
  it('accepts only safe external URL schemes', () => {
    for (const url of ['https://example.com', 'http://example.com', 'mailto:test@example.com']) {
      expectValid(ShellSchemas.openExternal, { url });
    }

    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'vscode://file/tmp/a']) {
      expectInvalid(ShellSchemas.openExternal, { url });
    }
  });
});

describe('ProjectSchemas', () => {
  describe('create', () => {
    it('accepts and trims project names', () => {
      expectValid(ProjectSchemas.create, { name: 'My Project' });

      const result = ProjectSchemas.create.safeParse({ name: '  Trimmed  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Trimmed');
      }
    });

    it('rejects empty, overlong, and missing names', () => {
      for (const input of [{ name: '' }, { name: 'a'.repeat(101) }, {}]) {
        expectInvalid(ProjectSchemas.create, input);
      }
    });
  });

  describe('get', () => {
    it('requires a UUID project ID', () => {
      expectValid(ProjectSchemas.get, { projectId: randomUUID() });
      expectInvalid(ProjectSchemas.get, { projectId: 'not-a-uuid' });
    });
  });

  describe('update', () => {
    it('accepts supported project updates', () => {
      for (const updates of [{ name: 'New Name' }, { phase: 'detailed' }]) {
        expectValid(ProjectSchemas.update, { projectId: randomUUID(), updates });
      }
    });

    it('rejects invalid or empty updates', () => {
      for (const updates of [{ phase: 'invalid' }, {}]) {
        expectInvalid(ProjectSchemas.update, { projectId: randomUUID(), updates });
      }
    });
  });
});

describe('PlanSchemas', () => {
  describe('updatePosition', () => {
    it('accepts ordinary and boundary canvas positions', () => {
      for (const position of [
        { x: 100, y: 200 },
        { x: -10000, y: 100000 },
      ]) {
        expectValid(PlanSchemas.updatePosition, { itemId: randomUUID(), ...position });
      }
    });

    it('rejects positions outside canvas bounds', () => {
      for (const position of [
        { x: 200000, y: 100 },
        { x: -20000, y: 100 },
      ]) {
        expectInvalid(PlanSchemas.updatePosition, { itemId: randomUUID(), ...position });
      }
    });
  });

  describe('updateItem', () => {
    it('accepts supported update fields', () => {
      for (const updates of [
        { title: 'New Title' },
        { description: null },
        { status_category: 'in_progress' },
        { code_refs: ['src/file.ts:10', 'src/other.ts:20'] },
      ]) {
        expectValid(PlanSchemas.updateItem, { itemId: randomUUID(), updates });
      }
    });

    it('rejects invalid status categories and empty updates', () => {
      for (const updates of [{ status_category: 'invalid' }, {}]) {
        expectInvalid(PlanSchemas.updateItem, { itemId: randomUUID(), updates });
      }
    });
  });

  describe('executeActions', () => {
    it('accepts representative plan action shapes', () => {
      for (const actions of [
        [
          {
            type: 'create_item',
            title: 'New Feature',
            parent_id: null,
            status: 'planned',
            label: 'feature',
            primary_repo_id: randomUUID(),
            affected_repo_ids: [randomUUID()],
          },
        ],
        [
          {
            type: 'set_position',
            item_id: randomUUID(),
            x: 100,
            y: 200,
          },
        ],
        [
          { type: 'create_item', title: 'Item 1', parent_id: null },
          { type: 'reparent', item_id: randomUUID(), new_parent_id: null },
        ],
      ]) {
        expectValid(PlanSchemas.executeActions, { projectId: randomUUID(), actions });
      }
    });

    it('rejects empty action batches, unknown action types, and malformed repo targets', () => {
      for (const actions of [
        [],
        [{ type: 'unknown_action' }],
        [{ type: 'create_item', title: 'Item', parent_id: null, primary_repo_id: 'not-a-uuid' }],
      ]) {
        expectInvalid(PlanSchemas.executeActions, { projectId: randomUUID(), actions });
      }
    });
  });

  describe('addRelation', () => {
    it('accepts every relation type', () => {
      for (const relation_type of ['depends_on', 'blocks', 'relates_to']) {
        expectValid(PlanSchemas.addRelation, {
          project_id: randomUUID(),
          from_item_id: randomUUID(),
          to_item_id: randomUUID(),
          relation_type,
        });
      }
    });

    it('rejects invalid relation types', () => {
      expectInvalid(PlanSchemas.addRelation, {
        project_id: randomUUID(),
        from_item_id: randomUUID(),
        to_item_id: randomUUID(),
        relation_type: 'invalid',
      });
    });
  });
});

describe('ChatSchemas', () => {
  describe('send', () => {
    it('accepts supported send payload variants', () => {
      for (const input of [
        { projectId: randomUUID(), message: 'Hello, Claude!' },
        {
          projectId: randomUUID(),
          message: 'Tell me about these items',
          focusedResources: [
            { type: 'plan_item', id: randomUUID(), title: 'Test task' },
            { type: 'project_file', path: 'CLAUDE.md', isDirectory: false },
          ],
        },
        { projectId: randomUUID(), message: 'Hello', model: 'opus' },
        { projectId: randomUUID(), message: 'Hello', clientMessageId: randomUUID() },
      ]) {
        expectValid(ChatSchemas.send, input);
      }
    });

    it('rejects empty, oversized, or invalid-model messages', () => {
      for (const input of [
        { projectId: randomUUID(), message: '' },
        { projectId: randomUUID(), message: 'a'.repeat(100001) },
        { projectId: randomUUID(), message: 'Hello', model: 'gpt-4' },
      ]) {
        expectInvalid(ChatSchemas.send, input);
      }
    });
  });
});

describe('TrackerSchemas', () => {
  describe('saveJiraCredentials', () => {
    it('accepts credentials and normalizes URL schemes', () => {
      expectValid(TrackerSchemas.saveJiraCredentials, {
        siteUrl: 'company.atlassian.net',
        email: 'user@example.com',
        apiToken: 'token123',
      });

      for (const siteUrl of ['https://company.atlassian.net', 'http://company.atlassian.net']) {
        const result = TrackerSchemas.saveJiraCredentials.safeParse({
          siteUrl,
          email: 'user@example.com',
          apiToken: 'token123',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.siteUrl).toBe('company.atlassian.net');
        }
      }
    });

    it('rejects invalid credential fields', () => {
      for (const input of [
        { siteUrl: 'company.atlassian.net', email: 'not-an-email', apiToken: 'token123' },
        { siteUrl: 'company.atlassian.net', email: 'user@example.com', apiToken: '' },
        { siteUrl: '-invalid.atlassian.net', email: 'user@example.com', apiToken: 'token123' },
      ]) {
        expectInvalid(TrackerSchemas.saveJiraCredentials, input);
      }
    });
  });

  describe('addScope', () => {
    it('accepts supported Jira project key formats', () => {
      for (const projectKey of ['PROJ', 'PROJ123', 'MY_PROJECT']) {
        expectValid(TrackerSchemas.addScope, {
          connectionId: randomUUID(),
          projectKey,
        });
      }
    });

    it('rejects unsupported Jira project key formats', () => {
      for (const projectKey of ['proj', '123PROJ']) {
        expectInvalid(TrackerSchemas.addScope, {
          connectionId: randomUUID(),
          projectKey,
        });
      }
    });
  });
});

describe('ExportSchemas', () => {
  describe('addToQueue', () => {
    it('requires at least one item ID', () => {
      expectValid(ExportSchemas.addToQueue, {
        projectId: randomUUID(),
        itemIds: [randomUUID(), randomUUID()],
      });
      expectInvalid(ExportSchemas.addToQueue, {
        projectId: randomUUID(),
        itemIds: [],
      });
    });
  });

  describe('updateQueueStatus', () => {
    it('accepts valid or null status categories and rejects unknown values', () => {
      for (const statusCategory of ['in_progress', null]) {
        expectValid(ExportSchemas.updateQueueStatus, {
          queueEntryId: randomUUID(),
          statusCategory,
        });
      }

      expectInvalid(ExportSchemas.updateQueueStatus, {
        queueEntryId: randomUUID(),
        statusCategory: 'invalid',
      });
    });
  });

  describe('updateQueueCustomFields', () => {
    it('accepts custom field overrides or null', () => {
      for (const customFieldOverrides of [
        {
          customfield_123: 'value',
          customfield_456: '999',
        },
        null,
      ]) {
        expectValid(ExportSchemas.updateQueueCustomFields, {
          queueEntryId: randomUUID(),
          customFieldOverrides,
        });
      }
    });
  });

  describe('saveMapping', () => {
    it('accepts complete type mappings and rejects empty labels', () => {
      const base = {
        projectId: randomUUID(),
        scopeId: randomUUID(),
        trackerIssueTypeId: '10001',
        trackerIssueTypeName: 'Task',
      };

      expectValid(ExportSchemas.saveMapping, { ...base, kpmLabel: 'task' });
      expectInvalid(ExportSchemas.saveMapping, { ...base, kpmLabel: '' });
    });
  });
});

describe('StreamingSessionSchemas', () => {
  it('accepts valid session operation payloads', () => {
    expectValid(StreamingSessionSchemas.connectSession, { projectId: randomUUID() });
    expectValid(StreamingSessionSchemas.disconnectSession, { projectId: randomUUID() });
    expectValid(StreamingSessionSchemas.getSessionState, {
      projectId: randomUUID(),
      chatSessionId: randomUUID(),
    });
  });

  it('rejects invalid or missing session IDs', () => {
    expectInvalid(StreamingSessionSchemas.connectSession, { projectId: 'not-a-uuid' });
    expectInvalid(StreamingSessionSchemas.connectSession, {});
    expectInvalid(StreamingSessionSchemas.disconnectSession, { projectId: 'invalid' });
    expectInvalid(StreamingSessionSchemas.getSessionState, {
      projectId: '',
      chatSessionId: randomUUID(),
    });
  });
});
