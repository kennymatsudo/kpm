import { describe, expect, it } from 'vitest';
import { isHtmlPreviewRequestAllowed } from './htmlPreviewRequest';

const ROOT = '/Users/me/project/harness/run-1';

describe('isHtmlPreviewRequestAllowed', () => {
  it.each([
    ['the page itself', 'file:///Users/me/project/harness/run-1/replay.html'],
    ['a sibling file', 'file:///Users/me/project/harness/run-1/video.webm'],
    ['a file in a subfolder', 'file:///Users/me/project/harness/run-1/shots/01.png'],
    ['a file whose name starts with two dots', 'file:///Users/me/project/harness/run-1/..notes.txt'],
    ['an inline data payload', 'data:image/png;base64,AAAA'],
    ['a blob URL', 'blob:file:///6c1d2e3f'],
  ])('allows %s', (_label, url) => {
    expect(isHtmlPreviewRequestAllowed(url, ROOT)).toBe(true);
  });

  it.each([
    ['a file in the parent folder', 'file:///Users/me/project/harness/secrets.json'],
    ['a dot-dot escape', 'file:///Users/me/project/harness/run-1/../../.env'],
    ['a sibling folder sharing the name prefix', 'file:///Users/me/project/harness/run-10/replay.html'],
    ['a file elsewhere on disk', 'file:///Users/me/.ssh/id_ed25519'],
    ['https', 'https://example.com/collect?d=1'],
    ['plain http to localhost', 'http://127.0.0.1:8080/'],
    ['a websocket', 'wss://example.com/socket'],
    ['an unparseable URL', 'not a url'],
  ])('refuses %s', (_label, url) => {
    expect(isHtmlPreviewRequestAllowed(url, ROOT)).toBe(false);
  });

  it('refuses every file when the request comes from no known preview', () => {
    expect(isHtmlPreviewRequestAllowed('file:///Users/me/project/harness/run-1/replay.html', undefined)).toBe(false);
  });
});
