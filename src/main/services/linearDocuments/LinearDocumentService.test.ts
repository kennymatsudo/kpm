import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { createLinearDocumentService } from './LinearDocumentService';
import type { LinearDocumentApi } from './linearStores';
import type { CreateLinearDocumentInput, LinearDocument } from '../../tracker-clients/linear/client';
import type { IProjectRepository } from '../../db/interfaces/project';
import type { IPlanItemRepository } from '../../db/interfaces/plan';
import type {
  ILinearDocumentLinkRepository,
  LinearDocumentLink,
  LinearDocumentSyncState,
} from '../../db/interfaces/linearDocuments';
import type { PlanItem } from '../../../shared/types';

const PROJECT = 'project-1';
const PATH = 'docs/spec.md';
const PLAN_ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOCUMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let projectFolder: string;

function writeLocal(content: string): void {
  const fullPath = join(projectFolder, PATH);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

function createLinkRepository() {
  let link: LinearDocumentLink | null = null;
  const syncStates: LinearDocumentSyncState[] = [];
  let failedCreates = 0;
  const repository = {
    getByProject: () => (link ? [link] : []),
    getByDocumentPath: () => link,
    getByDocumentId: () => link,
    create: (created) => {
      if (failedCreates > 0) {
        failedCreates -= 1;
        throw new Error('database unavailable');
      }
      link = {
        ...created,
        id: 'link-1',
        last_synced_at: null,
        local_content_hash: null,
        remote_content_hash: null,
        remote_version: null,
        created_at: 'now',
      };
      return link;
    },
    updateSyncState: (_id, state) => {
      syncStates.push(state);
      if (link) link = { ...link, ...state };
    },
    updateTitle: () => {},
    updateDirection: (_id, direction) => {
      if (link) link = { ...link, direction };
    },
    delete: () => {
      link = null;
    },
  } satisfies ILinearDocumentLinkRepository;
  return {
    repository,
    syncStates,
    get link() {
      return link;
    },
    preset(existing: LinearDocumentLink) {
      link = existing;
    },
    failNextCreate() {
      failedCreates += 1;
    },
  };
}

/** Echoes the created document back with a trailing newline, the way Linear
 *  re-serializes markdown through its collaborative document model. */
function createApi() {
  const created: CreateLinearDocumentInput[] = [];
  const api: LinearDocumentApi = {
    getDocument: async () => {
      throw new Error('not used');
    },
    createDocument: async (input) => {
      created.push(input);
      return {
        id: input.id ?? 'doc-1',
        title: input.title,
        content: `${input.content}\n`,
        url: 'https://linear.app/team/document/spec-abc',
        slugId: 'spec-abc',
        updatedAt: '2026-08-28T10:00:00.000Z',
        trashed: null,
      } satisfies LinearDocument;
    },
    updateDocument: async () => {
      throw new Error('not used');
    },
  };
  return { api, created };
}

function service(options: {
  links: ReturnType<typeof createLinkRepository>;
  api?: LinearDocumentApi | null;
  planItems?: PlanItem[];
}) {
  return createLinearDocumentService({
    linearDocumentLinks: options.links.repository,
    projects: { get: () => ({ folder_path: projectFolder }) } as unknown as IProjectRepository,
    planItems: { getByProject: () => options.planItems ?? [] } as unknown as IPlanItemRepository,
    api: async () => options.api ?? null,
  });
}

beforeEach(() => {
  projectFolder = mkdtempSync(join(tmpdir(), 'kpm-linear-docs-'));
});

afterEach(() => {
  rmSync(projectFolder, { recursive: true, force: true });
});

describe('publishDocument', () => {
  it('sends the file through the export boundary so plan refs leave as Linear links', async () => {
    writeLocal(`Tracks @plan/${PLAN_ITEM_ID}.`);
    const links = createLinkRepository();
    const { api, created } = createApi();
    const planItems = [
      {
        id: PLAN_ITEM_ID,
        title: 'Ship it',
        external_key: 'ENG-451',
        external_url: 'https://linear.app/team/issue/ENG-451',
      } as unknown as PlanItem,
    ];

    const result = await service({ links, api, planItems }).publishDocument(
      PROJECT,
      PATH,
      { kind: 'project', id: 'linear-project-1' },
      'Spec',
      'two-way',
      DOCUMENT_ID
    );

    expect(result.ok).toBe(true);
    expect(created[0].content).toBe(
      'Tracks [ENG-451](https://linear.app/team/issue/ENG-451).'
    );
    expect(created[0].projectId).toBe('linear-project-1');
  });

  it('records a baseline from the echoed content so the next preview reads clean', async () => {
    writeLocal('# Spec');
    const links = createLinkRepository();
    const { api } = createApi();

    await service({ links, api }).publishDocument(
      PROJECT,
      PATH,
      { kind: 'project', id: 'linear-project-1' },
      'Spec',
      'two-way',
      DOCUMENT_ID
    );

    const { createHash } = await import('crypto');
    const hashOf = (content: string) => createHash('sha256').update(content).digest('hex');
    expect(links.syncStates).toHaveLength(1);
    expect(links.syncStates[0].local_content_hash).toBe(hashOf('# Spec'));
    expect(links.syncStates[0].remote_content_hash).toBe(hashOf('# Spec\n'));
  });

  it('stores the requested direction on the link', async () => {
    writeLocal('# Spec');
    const links = createLinkRepository();
    const { api } = createApi();

    await service({ links, api }).publishDocument(
      PROJECT,
      PATH,
      { kind: 'issue', id: 'ENG-451' },
      'Spec',
      'push-only',
      DOCUMENT_ID
    );

    expect(links.link).toMatchObject({ direction: 'push-only', parent_kind: 'issue' });
  });

  it('uses the caller-provided document id again after linking fails', async () => {
    writeLocal('# Spec');
    const links = createLinkRepository();
    links.failNextCreate();
    const { api, created } = createApi();
    const documentService = service({ links, api });

    await documentService.publishDocument(
      PROJECT,
      PATH,
      { kind: 'project', id: 'linear-project-1' },
      'Spec',
      'two-way',
      DOCUMENT_ID
    );
    await documentService.publishDocument(
      PROJECT,
      PATH,
      { kind: 'project', id: 'linear-project-1' },
      'Spec',
      'two-way',
      DOCUMENT_ID
    );

    expect(created.map((input) => input.id)).toEqual([DOCUMENT_ID, DOCUMENT_ID]);
  });

  it('refuses to publish a document that is already published', async () => {
    writeLocal('# Spec');
    const links = createLinkRepository();
    links.preset({ id: 'link-1' } as LinearDocumentLink);
    const { api } = createApi();

    expect(
      await service({ links, api }).publishDocument(
        PROJECT,
        PATH,
        { kind: 'project', id: 'linear-project-1' },
        'Spec',
        'two-way',
        DOCUMENT_ID
      )
    ).toEqual({ ok: false, error: 'Failed to publish document to Linear' });
  });

  it('refuses to publish when the local file does not exist', async () => {
    const links = createLinkRepository();
    const { api } = createApi();

    expect(
      await service({ links, api }).publishDocument(
        PROJECT,
        PATH,
        { kind: 'project', id: 'linear-project-1' },
        'Spec',
        'two-way',
        DOCUMENT_ID
      )
    ).toEqual({ ok: false, error: 'Failed to publish document to Linear' });
  });
});

describe('setDirection', () => {
  it('refuses to change direction on a document that is not published', () => {
    const links = createLinkRepository();
    const { api } = createApi();

    expect(service({ links, api }).setDirection(PROJECT, PATH, 'push-only')).toEqual({
      ok: false,
      error: 'Document is not published to Linear',
    });
  });

  it('updates the direction on a published document', () => {
    const links = createLinkRepository();
    links.preset({ id: 'link-1', direction: 'two-way' } as LinearDocumentLink);
    const { api } = createApi();

    const result = service({ links, api }).setDirection(PROJECT, PATH, 'push-only');

    expect(result).toEqual({ ok: true, data: undefined });
    expect(links.link).toMatchObject({ direction: 'push-only' });
  });
});
