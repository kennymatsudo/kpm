import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { buildUserContentBlocks, MAX_ATTACHMENT_BYTES } from './attachmentBlocks';
import type { ChatAttachment } from '../../shared/types';

describe('buildUserContentBlocks', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attachment-blocks-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns a single text block when no attachments are provided', async () => {
    const blocks = await buildUserContentBlocks('hello world', []);

    expect(blocks).toEqual([{ type: 'text', text: 'hello world' }]);
  });

  it('emits an image block first and the text block last for an image attachment', async () => {
    const filename = 'snippet.png';
    const filePath = path.join(tmpDir, filename);
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await fs.writeFile(filePath, bytes);

    const attachment: ChatAttachment = {
      kind: 'image',
      path: filePath,
      filename,
      mediaType: 'image/png',
    };

    const blocks = await buildUserContentBlocks('describe this', [attachment]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: bytes.toString('base64'),
      },
    });
    expect(blocks[1]).toEqual({ type: 'text', text: 'describe this' });
  });

  it('emits a document block with application/pdf for a pdf attachment', async () => {
    const filename = 'spec.pdf';
    const filePath = path.join(tmpDir, filename);
    const bytes = Buffer.from('%PDF-1.4 stub');
    await fs.writeFile(filePath, bytes);

    const attachment: ChatAttachment = {
      kind: 'pdf',
      path: filePath,
      filename,
    };

    const blocks = await buildUserContentBlocks('summarize', [attachment]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: bytes.toString('base64'),
      },
    });
    expect(blocks[1]).toEqual({ type: 'text', text: 'summarize' });
  });

  it('emits a wrapped text block for a text attachment', async () => {
    const filename = 'notes.md';
    const filePath = path.join(tmpDir, filename);
    const content = 'line 1\nline 2';
    await fs.writeFile(filePath, content, 'utf-8');

    const attachment: ChatAttachment = {
      kind: 'text',
      path: filePath,
      filename,
      mediaType: 'text/markdown',
    };

    const blocks = await buildUserContentBlocks('look at this', [attachment]);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: 'text',
      text: `<file path="${filePath}">\nline 1\nline 2\n</file>`,
    });
    expect(blocks[1]).toEqual({ type: 'text', text: 'look at this' });
  });

  it('throws when an attachment exceeds the per-file size limit', async () => {
    const filename = 'huge.png';
    const filePath = path.join(tmpDir, filename);
    // Write a sparse file so we don't actually allocate 30+ MB on disk
    const handle = await fs.open(filePath, 'w');
    try {
      await handle.truncate(MAX_ATTACHMENT_BYTES + 1);
    } finally {
      await handle.close();
    }

    const attachment: ChatAttachment = {
      kind: 'image',
      path: filePath,
      filename,
      mediaType: 'image/png',
    };

    await expect(buildUserContentBlocks('describe', [attachment])).rejects.toThrow(
      /huge\.png.*exceeds/i,
    );
  });

  it('throws with the filename when the file cannot be read', async () => {
    const attachment: ChatAttachment = {
      kind: 'image',
      path: path.join(tmpDir, 'does-not-exist.png'),
      filename: 'does-not-exist.png',
      mediaType: 'image/png',
    };

    await expect(buildUserContentBlocks('describe', [attachment])).rejects.toThrow(
      /does-not-exist\.png/,
    );
  });

  it('preserves attachment order with text always last', async () => {
    const a = path.join(tmpDir, 'a.png');
    const b = path.join(tmpDir, 'b.png');
    await fs.writeFile(a, Buffer.from([1, 2, 3]));
    await fs.writeFile(b, Buffer.from([4, 5, 6]));

    const blocks = await buildUserContentBlocks('compare them', [
      { kind: 'image', path: a, filename: 'a.png', mediaType: 'image/png' },
      { kind: 'image', path: b, filename: 'b.png', mediaType: 'image/png' },
    ]);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: 'image' });
    expect(blocks[1]).toMatchObject({ type: 'image' });
    expect(blocks[2]).toEqual({ type: 'text', text: 'compare them' });
  });
});
