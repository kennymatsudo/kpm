import { describe, it, expect } from 'vitest';
import { createLinearDocumentStore, toRemoteDocument } from './linearStores';
import type { LinearDocumentApi } from './linearStores';
import type { LinearDocument } from '../../tracker-clients/linear/client';
import { EMPTY_EXTERNAL_MARKDOWN } from '../../documents/exportBoundary';

function makeDocument(overrides: Partial<LinearDocument> = {}): LinearDocument {
  return {
    id: 'doc-1',
    title: 'Spec',
    content: '# Spec',
    url: 'https://linear.app/team/document/spec-abc',
    slugId: 'spec-abc',
    updatedAt: '2026-08-28T10:00:00.000Z',
    trashed: null,
    ...overrides,
  };
}

function makeApi(document: LinearDocument): LinearDocumentApi {
  return {
    getDocument: async () => document,
    createDocument: async () => document,
    updateDocument: async () => document,
  };
}

describe('toRemoteDocument', () => {
  it('uses the remote modification time as the revision marker', () => {
    expect(toRemoteDocument(makeDocument()).revision).toBe(
      Date.parse('2026-08-28T10:00:00.000Z'),
    );
  });

  it('reads an empty document as empty content rather than null', () => {
    expect(toRemoteDocument(makeDocument({ content: null })).content).toBe('');
  });
});

describe('createLinearDocumentStore', () => {
  it('refuses to read a document sitting in the Linear trash', async () => {
    const store = createLinearDocumentStore(makeApi(makeDocument({ trashed: true })));
    await expect(store.read('doc-1')).rejects.toThrow(/Linear trash/);
  });

  it('returns the document the provider echoed back on write', async () => {
    const echoed = makeDocument({ content: '# Spec\n', updatedAt: '2026-08-28T11:00:00.000Z' });
    const store = createLinearDocumentStore(makeApi(echoed));
    expect(await store.write('doc-1', EMPTY_EXTERNAL_MARKDOWN, 1)).toMatchObject({
      content: '# Spec\n',
      revision: Date.parse('2026-08-28T11:00:00.000Z'),
    });
  });
});
