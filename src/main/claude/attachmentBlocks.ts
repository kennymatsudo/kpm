/**
 * Build native multimodal content blocks for the Claude Agent SDK.
 *
 * Replaces the old "paths-in-message-prefix + Read tool" workaround. Reads
 * each attachment from disk and emits the SDK's `ContentBlockParam` shape so
 * bytes go directly to the model instead of costing a tool round-trip.
 *
 * Anthropic-recommended ordering: attachments first, user text last.
 */

import * as fs from 'fs/promises';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import type { ChatAttachment } from '../../shared/types';

/**
 * Per-file size cap. Anthropic's API limit is 32 MB; we cap a little under to
 * leave headroom for the rest of the request envelope. Total request size is
 * intentionally NOT pre-checked here — let the API reject oversized payloads
 * rather than guessing the wire-encoded total.
 */
export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;

/**
 * Build the content-block array for a user turn that may include attachments.
 *
 * - With no attachments: returns a single text block.
 * - With attachments: emits attachment blocks first, then a single trailing
 *   text block carrying the user's typed message.
 *
 * @throws if any attachment exceeds {@link MAX_ATTACHMENT_BYTES} or fails to read.
 */
export async function buildUserContentBlocks(
  text: string,
  attachments: ChatAttachment[],
): Promise<ContentBlockParam[]> {
  if (attachments.length === 0) {
    return [{ type: 'text', text }];
  }

  const blocks: ContentBlockParam[] = [];

  for (const attachment of attachments) {
    blocks.push(await buildAttachmentBlock(attachment));
  }

  blocks.push({ type: 'text', text });
  return blocks;
}

async function buildAttachmentBlock(attachment: ChatAttachment): Promise<ContentBlockParam> {
  // Validate size before reading to fail fast on huge files.
  let stat;
  try {
    stat = await fs.stat(attachment.path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read attachment "${attachment.filename}": ${reason}`, {
      cause: error,
    });
  }

  if (stat.size > MAX_ATTACHMENT_BYTES) {
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
    const limitMB = (MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0);
    throw new Error(
      `Attachment "${attachment.filename}" is ${sizeMB} MB, exceeds the ${limitMB} MB per-file limit`,
    );
  }

  switch (attachment.kind) {
    case 'image': {
      const data = await readBase64(attachment.path, attachment.filename);
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: attachment.mediaType,
          data,
        },
      };
    }
    case 'pdf': {
      const data = await readBase64(attachment.path, attachment.filename);
      return {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data,
        },
      };
    }
    case 'text': {
      const content = await readUtf8(attachment.path, attachment.filename);
      return {
        type: 'text',
        text: `<file path="${attachment.path}">\n${content}\n</file>`,
      };
    }
  }
}

async function readBase64(path: string, filename: string): Promise<string> {
  try {
    const buffer = await fs.readFile(path);
    return buffer.toString('base64');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read attachment "${filename}": ${reason}`, { cause: error });
  }
}

async function readUtf8(path: string, filename: string): Promise<string> {
  try {
    return await fs.readFile(path, 'utf-8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read attachment "${filename}": ${reason}`, { cause: error });
  }
}
