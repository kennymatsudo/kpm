/**
 * Renderer-side wrappers around the chat attachment IPC surface.
 *
 * Note: these are *separate* from the project-level Attachment APIs in
 * `window.api.attachments` (which manage permanent files attached to a
 * project). These helpers only deal with ephemeral chat attachments living in
 * the temp cache.
 */

export interface PickedChatAttachment {
  path: string;
  filename: string;
  kind: 'image' | 'pdf' | 'text';
  mediaType: string;
}

export interface PickAttachmentsResult {
  picked: PickedChatAttachment[];
  errors: { filename: string; error: string }[];
}

export function pickChatAttachments(): Promise<PickAttachmentsResult> {
  return window.api.attachments.pickForChat();
}

export async function saveDroppedFile(file: File): Promise<
  | { success: true; path: string; filename: string; kind: 'image' | 'pdf' | 'text'; mediaType: string }
  | { success: false; error: string }
> {
  const arrayBuffer = await file.arrayBuffer();
  return window.api.attachments.saveDropped({
    data: new Uint8Array(arrayBuffer),
    filename: file.name,
    mimeType: file.type || undefined,
  });
}

export function readAttachmentAsDataUrl(filePath: string, mediaType: string) {
  return window.api.attachments.readAsDataUrl({ filePath, mediaType });
}

export function openTempAttachment(filePath: string): Promise<{ success: boolean; error?: string }> {
  return window.api.attachments.openTemp({ filePath });
}
