import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import {
  classifyAttachment,
  createTempImageService,
} from './TempImageService';

/**
 * Tests focus on the Phase 2 chat-attachment surface. The pre-existing
 * paste-image flow has been exercised via the live app for some time and is
 * not retroactively covered here.
 */
describe('classifyAttachment', () => {
  it('returns image kind for png/jpg/jpeg/gif/webp by extension', () => {
    expect(classifyAttachment('foo.png')).toEqual({ kind: 'image', mediaType: 'image/png' });
    expect(classifyAttachment('foo.jpg')).toEqual({ kind: 'image', mediaType: 'image/jpeg' });
    expect(classifyAttachment('foo.JPEG')).toEqual({ kind: 'image', mediaType: 'image/jpeg' });
    expect(classifyAttachment('foo.gif')).toEqual({ kind: 'image', mediaType: 'image/gif' });
    expect(classifyAttachment('foo.webp')).toEqual({ kind: 'image', mediaType: 'image/webp' });
  });

  it('returns pdf kind for application/pdf MIME', () => {
    expect(classifyAttachment('something.pdf')).toEqual({ kind: 'pdf', mediaType: 'application/pdf' });
    expect(classifyAttachment('weird-name', 'application/pdf')).toEqual({
      kind: 'pdf',
      mediaType: 'application/pdf',
    });
  });

  it('returns text kind for the markdown / json / yaml allowlist', () => {
    expect(classifyAttachment('notes.md')).toEqual({ kind: 'text', mediaType: 'text/markdown' });
    expect(classifyAttachment('config.json')).toEqual({ kind: 'text', mediaType: 'application/json' });
    expect(classifyAttachment('compose.yaml')).toEqual({ kind: 'text', mediaType: 'text/yaml' });
  });

  it('rejects unknown extensions with no MIME hint', () => {
    expect(classifyAttachment('binary.bin')).toBeNull();
    expect(classifyAttachment('script.py')).toBeNull();
    expect(classifyAttachment('image.bmp')).toBeNull();
  });

  it('rejects unsupported declared MIME even when extension is unknown', () => {
    expect(classifyAttachment('weird', 'application/octet-stream')).toBeNull();
  });
});

describe('saveTempAttachment', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kpm-tempattach-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function makeService() {
    return createTempImageService({
      getTempDir: () => tempRoot,
      generateRandomBytes: randomBytes,
    });
  }

  it('persists a PDF and returns kind/mediaType from extension', async () => {
    const svc = makeService();
    const result = await svc.saveTempAttachment(Buffer.from('%PDF-1.4 minimal'), 'doc.pdf');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.kind).toBe('pdf');
    expect(result.mediaType).toBe('application/pdf');
    expect(result.filename).toBe('doc.pdf');
    // Ensure the file actually landed on disk under the kpm-images dir.
    const written = await fs.readFile(result.path, 'utf-8');
    expect(written).toBe('%PDF-1.4 minimal');
    expect(result.path).toContain('kpm-attach-');
  });

  it('persists a small text file and uses the explicit MIME', async () => {
    const svc = makeService();
    const result = await svc.saveTempAttachment(
      Buffer.from('# Hello'),
      'README.md',
      'text/markdown',
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.kind).toBe('text');
    expect(result.mediaType).toBe('text/markdown');
  });

  it('rejects oversize text attachments (256 KB cap)', async () => {
    const svc = makeService();
    const oversized = Buffer.alloc(257 * 1024, 'a');
    const result = await svc.saveTempAttachment(oversized, 'big.md');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/exceeds the .* limit/);
  });

  it('rejects unsupported file kinds', async () => {
    const svc = makeService();
    const result = await svc.saveTempAttachment(Buffer.from('print(1)'), 'script.py');
    expect(result.success).toBe(false);
  });
});

describe('readAttachmentAsDataUrl', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kpm-tempattach-read-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns a data URL for a saved attachment', async () => {
    const svc = createTempImageService({
      getTempDir: () => tempRoot,
      generateRandomBytes: randomBytes,
    });
    const saved = await svc.saveTempAttachment(Buffer.from('hello world'), 'note.txt', 'text/plain');
    expect(saved.success).toBe(true);
    if (!saved.success) return;

    const result = await svc.readAttachmentAsDataUrl(saved.path, 'text/plain');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.dataUrl.startsWith('data:text/plain;base64,')).toBe(true);
    const base64 = result.dataUrl.split(',')[1];
    expect(Buffer.from(base64, 'base64').toString('utf-8')).toBe('hello world');
  });

  it('refuses paths outside the temp directory', async () => {
    const svc = createTempImageService({
      getTempDir: () => tempRoot,
      generateRandomBytes: randomBytes,
    });
    const stranger = path.join(os.tmpdir(), 'somewhere-else.txt');
    const result = await svc.readAttachmentAsDataUrl(stranger, 'text/plain');
    expect(result.success).toBe(false);
  });
});
