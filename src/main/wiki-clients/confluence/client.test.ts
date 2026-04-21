import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfluenceClient } from './client';

interface MockFetchResponse {
  ok: boolean;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

describe('ConfluenceClient', () => {
  const credentials = {
    type: 'jira' as const,
    siteUrl: 'example.atlassian.net',
    email: 'test@example.com',
    apiToken: 'token',
  };

  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<MockFetchResponse>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: '123',
        title: 'Project Spec',
        spaceId: 'ENG',
        version: { number: 7 },
        body: {
            value: JSON.stringify({
              version: 1,
              type: 'doc',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 1 },
                  content: [{ type: 'text', text: 'Project Spec' }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Track rollout details here.' }],
                },
              ],
            }),
          },
        },
        _links: { webui: '/wiki/spaces/ENG/pages/123/Project+Spec' },
      }),
    });

    const client = new ConfluenceClient(credentials);
    const page = await client.getPage('123');

    expect(page).toEqual({
      id: '123',
      title: 'Project Spec',
      spaceId: 'ENG',
      version: 7,
      content: '# Project Spec\n\nTrack rollout details here.',
      webUrl: '/wiki/spaces/ENG/pages/123/Project+Spec',
    });
  });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '123',
          title: 'Project Spec',
          spaceId: 'ENG',
          version: { number: 7 },
          body: {
              value: JSON.stringify({
                version: 1,
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Existing content' }] }],
              }),
            },
          },
          _links: { webui: '/wiki/spaces/ENG/pages/123/Project+Spec' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: '123',
          title: 'Project Spec',
          spaceId: 'ENG',
          version: { number: 8 },
          body: {
              value: JSON.stringify({
                version: 1,
                type: 'doc',
                content: [
                  {
                    type: 'heading',
                    attrs: { level: 1 },
                    content: [{ type: 'text', text: 'Project Spec' }],
                  },
                ],
              }),
            },
          },
          _links: { webui: '/wiki/spaces/ENG/pages/123/Project+Spec' },
        }),
      });

    const client = new ConfluenceClient(credentials);
    await client.updatePage('123', '# Project Spec', 7);

    const putCall = fetchMock.mock.calls[1] as [string, RequestInit | undefined] | undefined;
    expect(putCall?.[0]).toBe('https://example.atlassian.net/wiki/api/v2/pages/123');

    const putRequest = putCall?.[1];
    expect(putRequest).toBeDefined();
    expect(putRequest?.method).toBe('PUT');
    expect(putRequest?.headers).toMatchObject({
      'Content-Type': 'application/json',
    });

    const requestBody = putRequest?.body;
    expect(typeof requestBody).toBe('string');

    const putBody = JSON.parse(requestBody as string) as {
      body: { value: string };
      version: { number: number };
      title: string;
      spaceId: string;
    };
    const parsedAdf = JSON.parse(putBody.body.value) as { type: string; content: { type: string }[] };

    expect(putBody.version.number).toBe(8);
    expect(putBody.title).toBe('Project Spec');
    expect(putBody.spaceId).toBe('ENG');
    expect(parsedAdf.type).toBe('doc');
    expect(parsedAdf.content[0]?.type).toBe('heading');
  });
});
