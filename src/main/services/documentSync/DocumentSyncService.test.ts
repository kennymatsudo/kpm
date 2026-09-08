import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { createDocumentSyncService } from './DocumentSyncService';
import type {
  DocumentLinkStore,
  DocumentSyncState,
  LocalDocumentStore,
  RemoteDocument,
  RemoteDocumentStore,
  SyncedDocument,
} from './types';
import type { IPlanItemRepository } from '../../db/interfaces/plan';
import type { PlanItem } from '../../../shared/types';

const hashOf = (content: string) => createHash('sha256').update(content).digest('hex');

const PROJECT = 'project-1';
const PATH = 'docs/spec.md';
const LINK_ID = 'link-1';
const REMOTE_ID = 'page-1';

function createLinkStore(initial: SyncedDocument | null) {
  let link = initial;
  const saved: DocumentSyncState[] = [];
  const titles: string[] = [];
  const store: DocumentLinkStore = {
    find: () => link,
    saveSyncState: (_linkId, state) => {
      saved.push(state);
      if (link) {
        link = {
          ...link,
          localContentHash: state.local_content_hash,
          remoteContentHash: state.remote_content_hash,
        };
      }
    },
    saveRemoteTitle: (_linkId, title) => titles.push(title),
    remove: () => {
      link = null;
    },
  };
  return {
    store,
    saved,
    titles,
    get link() {
      return link;
    },
  };
}

function createLocalStore(initial: string | null) {
  let content = initial;
  const store: LocalDocumentStore = {
    open: () => ({
      read: () => content,
      write: (next) => {
        content = next;
      },
    }),
  };
  return {
    store,
    get content() {
      return content;
    },
  };
}

/** Echoes writes back with a trailing newline, the way a real provider
 *  re-serializes markdown it stored in its own document model. */
function createRemoteStore(initial: string) {
  let document: RemoteDocument = {
    id: REMOTE_ID,
    title: 'Spec',
    content: initial,
    revision: 1,
    url: '/pages/1',
  };
  const written: string[] = [];
  const expectedRevisions: number[] = [];
  const store: RemoteDocumentStore = {
    read: async () => document,
    write: async (_id, content, expectedRevision) => {
      written.push(content);
      expectedRevisions.push(expectedRevision);
      document = {
        ...document,
        content: `${content}\n`,
        revision: document.revision + 1,
      };
      return document;
    },
  };
  return {
    store,
    written,
    expectedRevisions,
    get document() {
      return document;
    },
    replace(content: string) {
      document = { ...document, content, revision: document.revision + 1 };
    },
  };
}

const NO_PLAN_ITEMS = { getByProject: () => [] } as unknown as IPlanItemRepository;

async function executePush(service: ReturnType<typeof createDocumentSyncService>) {
  const preview = await service.generateSyncPreview(PROJECT, PATH);
  if (!preview.ok) throw new Error(preview.error);
  return service.executePush(PROJECT, PATH, preview.data.pushReceipt);
}

async function executePull(service: ReturnType<typeof createDocumentSyncService>) {
  const preview = await service.generateSyncPreview(PROJECT, PATH);
  if (!preview.ok) throw new Error(preview.error);
  return service.executePull(PROJECT, PATH, preview.data.pullReceipt);
}

const SYNCED_LINK: SyncedDocument = {
  linkId: LINK_ID,
  remoteId: REMOTE_ID,
  direction: 'two-way',
  localContentHash: null,
  remoteContentHash: null,
};

interface Harness {
  links: ReturnType<typeof createLinkStore>;
  local: ReturnType<typeof createLocalStore>;
  remote: ReturnType<typeof createRemoteStore>;
  service: ReturnType<typeof createDocumentSyncService>;
  advanceTime: (milliseconds: number) => void;
}

function harness(options: {
  link?: SyncedDocument | null;
  localContent?: string | null;
  remoteContent?: string;
  planItems?: IPlanItemRepository;
  credentialsMissing?: boolean;
}): Harness {
  let currentTime = 0;
  const links = createLinkStore(options.link === undefined ? SYNCED_LINK : options.link);
  const local = createLocalStore(options.localContent === undefined ? 'local' : options.localContent);
  const remote = createRemoteStore(options.remoteContent ?? 'remote');
  const service = createDocumentSyncService({
    links: links.store,
    local: local.store,
    remote: async () => (options.credentialsMissing ? null : remote.store),
    planItems: options.planItems ?? NO_PLAN_ITEMS,
    destination: 'confluence',
    label: 'Confluence',
    now: () => currentTime,
  });
  return {
    links,
    local,
    remote,
    service,
    advanceTime: (milliseconds) => {
      currentTime += milliseconds;
    },
  };
}

describe('generateSyncPreview', () => {
  it('issues distinct receipts for the actions the preview authorizes', async () => {
    const { service } = harness({ localContent: 'local', remoteContent: 'remote' });
    const result = await service.generateSyncPreview(PROJECT, PATH);
    expect(result).toMatchObject({
      ok: true,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.pushReceipt).not.toBe(result.data.pullReceipt);
    expect(result.data).not.toHaveProperty('localContentHash');
    expect(result.data).not.toHaveProperty('remoteContentHash');
  });

  it('reports neither side changed on the first sync, with no baseline to compare', async () => {
    const { service } = harness({ localContent: 'local', remoteContent: 'remote' });
    const result = await service.generateSyncPreview(PROJECT, PATH);
    expect(result).toMatchObject({
      ok: true,
      data: {
        isInitialSync: true,
        localChanged: false,
        remoteChanged: false,
        hasConflict: false,
        hasContentDifference: true,
      },
    });
  });

  it('reports only the local side changed when the file moved since the last sync', async () => {
    const { service } = harness({
      link: { ...SYNCED_LINK, localContentHash: hashOf('was'), remoteContentHash: hashOf('remote') },
      localContent: 'now',
      remoteContent: 'remote',
    });
    const result = await service.generateSyncPreview(PROJECT, PATH);
    expect(result).toMatchObject({
      ok: true,
      data: { localChanged: true, remoteChanged: false, hasConflict: false },
    });
  });

  it('flags a conflict when both sides moved since the last sync', async () => {
    const { service } = harness({
      link: { ...SYNCED_LINK, localContentHash: hashOf('was'), remoteContentHash: hashOf('was') },
      localContent: 'local now',
      remoteContent: 'remote now',
    });
    const result = await service.generateSyncPreview(PROJECT, PATH);
    expect(result).toMatchObject({ ok: true, data: { hasConflict: true } });
  });

  it('treats a missing local file as empty content', async () => {
    const { service } = harness({ localContent: null });
    const result = await service.generateSyncPreview(PROJECT, PATH);
    expect(result).toMatchObject({ ok: true, data: { localContent: '' } });
  });

  it('reports the generic preview failure when the document is not linked', async () => {
    const { service } = harness({ link: null });
    expect(await service.generateSyncPreview(PROJECT, PATH)).toEqual({
      ok: false,
      error: 'Failed to generate sync preview',
    });
  });

  it('reports the generic preview failure when the provider has no credentials', async () => {
    const { service } = harness({ credentialsMissing: true });
    expect(await service.generateSyncPreview(PROJECT, PATH)).toEqual({
      ok: false,
      error: 'Failed to generate sync preview',
    });
  });
});

describe('executePush', () => {
  it('sends the local content to the remote document', async () => {
    const { service, remote } = harness({ localContent: 'new body' });
    const result = await executePush(service);
    expect(result.ok).toBe(true);
    expect(remote.written).toEqual(['new body']);
  });

  it('records the remote hash from what the provider echoed back, not what was sent', async () => {
    const { service, links } = harness({ localContent: 'body' });
    await executePush(service);
    expect(links.saved).toHaveLength(1);
    expect(links.saved[0].local_content_hash).toBe(hashOf('body'));
    expect(links.saved[0].remote_content_hash).toBe(hashOf('body\n'));
    expect(links.saved[0].remote_version).toBe(2);
  });

  it('uses the revision it read when it writes', async () => {
    const { service, remote } = harness({ localContent: 'body' });

    await executePush(service);

    expect(remote.expectedRevisions).toEqual([1]);
  });

  it('leaves both sides unchanged in the next preview', async () => {
    const { service } = harness({ localContent: 'body' });
    await executePush(service);
    const result = await service.generateSyncPreview(PROJECT, PATH);
    expect(result).toMatchObject({
      ok: true,
      data: { localChanged: false, remoteChanged: false, hasConflict: false },
    });
  });

  it('resolves plan refs to the destination form before sending', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const planItems = {
      getByProject: () => [
        {
          id,
          title: 'Ship it',
          external_key: 'ENG-451',
          external_url: 'https://corp.atlassian.net/browse/ENG-451',
        } as unknown as PlanItem,
      ],
    } as unknown as IPlanItemRepository;
    const { service, remote } = harness({ localContent: `see @plan/${id}`, planItems });

    await executePush(service);
    expect(remote.written).toEqual([
      'see [ENG-451](https://corp.atlassian.net/browse/ENG-451)',
    ]);
  });

  it('records the remote title alongside the sync state', async () => {
    const { service, links } = harness({ localContent: 'body' });
    await executePush(service);
    expect(links.titles).toEqual(['Spec']);
  });

  it('reports the generic push failure when the local file does not exist', async () => {
    const { service } = harness({ localContent: null });
    expect(await executePush(service)).toEqual({
      ok: false,
      error: 'Failed to push to Confluence',
    });
  });
});

describe('executePush — stale remote', () => {
  it('refuses when the remote moved since the preview the user acted on', async () => {
    const { service, remote } = harness({ localContent: 'body', remoteContent: 'as previewed' });
    const preview = await service.generateSyncPreview(PROJECT, PATH);
    if (!preview.ok) throw new Error(preview.error);
    remote.replace('since edited elsewhere');
    const result = await service.executePush(PROJECT, PATH, preview.data.pushReceipt);
    expect(result).toEqual({
      ok: false,
      error:
        'The Confluence copy changed while you were looking at it. Review the differences again before pushing.',
    });
    expect(remote.written).toEqual([]);
  });

  it('writes when the remote still matches the preview', async () => {
    const { service, remote } = harness({ localContent: 'body', remoteContent: 'as previewed' });
    const preview = await service.generateSyncPreview(PROJECT, PATH);
    if (!preview.ok) throw new Error(preview.error);
    const result = await service.executePush(PROJECT, PATH, preview.data.pushReceipt);
    expect(result.ok).toBe(true);
    expect(remote.written).toEqual(['body']);
  });

});

describe('executePull', () => {
  it('overwrites the local file with the remote content', async () => {
    const { service, local } = harness({ localContent: 'stale', remoteContent: 'fresh' });
    expect(await executePull(service)).toEqual({ ok: true, data: undefined });
    expect(local.content).toBe('fresh');
  });

  it('records both hashes over the pulled content so neither side reads as changed', async () => {
    const { service, links } = harness({ remoteContent: 'fresh' });
    await executePull(service);
    expect(links.saved[0].local_content_hash).toBe(hashOf('fresh'));
    expect(links.saved[0].remote_content_hash).toBe(hashOf('fresh'));
  });

  it('restores plan refs before writing the local document', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const externalUrl = 'https://linear.app/team/issue/ENG-451';
    const planItems = {
      getByProject: () => [
        {
          id,
          title: 'Ship it',
          external_key: 'ENG-451',
          external_url: externalUrl,
        } as unknown as PlanItem,
      ],
    } as unknown as IPlanItemRepository;
    const { service, local } = harness({
      localContent: 'stale',
      remoteContent: `Tracks [ENG-451](${externalUrl}).`,
      planItems,
    });

    await executePull(service);

    expect(local.content).toBe(`Tracks @plan/${id}.`);
  });

  it('refuses to pull into a document published one way', async () => {
    const { service, local } = harness({
      link: { ...SYNCED_LINK, direction: 'push-only' },
      localContent: 'owner',
      remoteContent: 'mirror',
    });
    const preview = await service.generateSyncPreview(PROJECT, PATH);
    if (!preview.ok) throw new Error(preview.error);
    expect(await service.executePull(PROJECT, PATH, preview.data.pullReceipt)).toEqual({
      ok: false,
      error: 'Failed to pull from Confluence',
    });
    expect(local.content).toBe('owner');
  });

  it('refuses when the local file moved since the preview the user acted on', async () => {
    const { service, local } = harness({ localContent: 'edited since', remoteContent: 'fresh' });
    const preview = await service.generateSyncPreview(PROJECT, PATH);
    if (!preview.ok) throw new Error(preview.error);
    local.store.open(PROJECT, PATH).write('edited again');
    const result = await service.executePull(PROJECT, PATH, preview.data.pullReceipt);
    expect(result).toEqual({
      ok: false,
      error:
        'The local file changed while you were looking at it. Review the differences again before pulling.',
    });
    expect(local.content).toBe('edited again');
  });

  it('writes when the local file still matches the preview', async () => {
    const { service, local } = harness({ localContent: 'as previewed', remoteContent: 'fresh' });
    const preview = await service.generateSyncPreview(PROJECT, PATH);
    if (!preview.ok) throw new Error(preview.error);
    expect((await service.executePull(PROJECT, PATH, preview.data.pullReceipt)).ok).toBe(true);
    expect(local.content).toBe('fresh');
  });

  it('reports the generic pull failure when the document is not linked', async () => {
    const { service } = harness({ link: null });
    expect(await service.executePull(PROJECT, PATH, '00000000-0000-4000-8000-000000000000')).toEqual({
      ok: false,
      error: 'Failed to pull from Confluence',
    });
  });
});

describe('sync receipts', () => {
  it('refuses a receipt that has already been used', async () => {
    const { service } = harness({});
    const preview = await service.generateSyncPreview(PROJECT, PATH);
    if (!preview.ok) throw new Error(preview.error);
    await service.executePush(PROJECT, PATH, preview.data.pushReceipt);

    expect(await service.executePush(PROJECT, PATH, preview.data.pushReceipt)).toEqual({
      ok: false,
      error: 'This sync preview is no longer valid. Review the differences again before continuing.',
    });
  });

  it('refuses a receipt for the other sync action', async () => {
    const { service } = harness({});
    const preview = await service.generateSyncPreview(PROJECT, PATH);
    if (!preview.ok) throw new Error(preview.error);

    expect(await service.executePull(PROJECT, PATH, preview.data.pushReceipt)).toEqual({
      ok: false,
      error: 'This sync preview is no longer valid. Review the differences again before continuing.',
    });
  });

  it('refuses an expired receipt', async () => {
    const { service, advanceTime } = harness({});
    const preview = await service.generateSyncPreview(PROJECT, PATH);
    if (!preview.ok) throw new Error(preview.error);
    advanceTime(5 * 60 * 1000);

    expect(await service.executePush(PROJECT, PATH, preview.data.pushReceipt)).toEqual({
      ok: false,
      error: 'This sync preview is no longer valid. Review the differences again before continuing.',
    });
  });
});

describe('unlinkDocument', () => {
  it('removes the link', () => {
    const { service, links } = harness({});
    expect(service.unlinkDocument(PROJECT, PATH)).toEqual({ ok: true, data: undefined });
    expect(links.link).toBeNull();
  });

  it('fails when the document was never linked', () => {
    const { service } = harness({ link: null });
    expect(service.unlinkDocument(PROJECT, PATH)).toEqual({
      ok: false,
      error: 'Document is not linked to Confluence',
    });
  });
});
