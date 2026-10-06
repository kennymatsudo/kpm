import { BrowserWindow, session } from 'electron';
import fs from 'fs';
import path from 'path';
import { failure, success, type AsyncResult } from '../services/result';
import { isHtmlPreviewRequestAllowed } from '../security/htmlPreviewRequest';
import { isPreviewableHtmlPath } from '../../shared/htmlPreview';

/**
 * Renders an HTML file from the workspace as a page, in a window that shares
 * nothing with KPM's own.
 *
 * The page is untrusted: an agent or a repo may have written it. So it runs
 * sandboxed with no preload (no `window.api`, no IPC), in an in-memory session
 * of its own, with no network, no permissions, no downloads, no popups, and
 * file reads limited to the folder it was opened from.
 */

/** No `persist:` prefix, so whatever a page stores is gone when KPM quits. */
const PREVIEW_PARTITION = 'kpm-html-preview';

/** The folder each preview may read from, keyed by its webContents id. */
const previewRoots = new Map<number, string>();
/** One window per file, so previewing a file again reloads it in place. */
const previewWindows = new Map<string, BrowserWindow>();
let previewSessionReady: Promise<void> | null = null;

async function configurePreviewSession(): Promise<void> {
  const previewSession = session.fromPartition(PREVIEW_PARTITION);
  previewSession.webRequest.onBeforeRequest((details, callback) => {
    const rootDir = details.webContentsId === undefined ? undefined : previewRoots.get(details.webContentsId);
    const allowed = isHtmlPreviewRequestAllowed(details.url, rootDir);
    if (!allowed) {
      console.warn(`[HtmlPreview] Blocked request: ${details.url}`);
    }
    callback({ cancel: !allowed });
  });
  previewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  previewSession.setPermissionCheckHandler(() => false);
  previewSession.on('will-download', (event) => event.preventDefault());
  // The request filter above never sees WebRTC. Its UDP is shut off per window
  // (see openHtmlPreview), which leaves TCP, and WebRTC sends TCP through the
  // session proxy. A proxy nothing listens on, with loopback not exempt,
  // makes those connections fail too.
  await previewSession.setProxy({ proxyRules: 'http://127.0.0.1:9', proxyBypassRules: '<-loopback>' });
}

export async function openHtmlPreview(filePath: string): AsyncResult<void> {
  if (!isPreviewableHtmlPath(filePath)) {
    return failure('Only .html and .htm files can be previewed');
  }

  // Load the page by its realpath, so its relative URLs share the prefix the
  // folder check compares against.
  let realPath: string;
  try {
    realPath = await fs.promises.realpath(filePath);
  } catch {
    return failure('File does not exist');
  }

  const existing = previewWindows.get(realPath);
  if (existing && !existing.isDestroyed()) {
    existing.webContents.reload();
    existing.focus();
    return success(undefined);
  }

  previewSessionReady ??= configurePreviewSession();
  await previewSessionReady;
  const rootDir = path.dirname(realPath);
  const previewWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    title: path.basename(realPath),
    webPreferences: {
      partition: PREVIEW_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  });

  const contents = previewWindow.webContents;
  const contentsId = contents.id;
  previewRoots.set(contentsId, rootDir);
  previewWindows.set(realPath, previewWindow);
  previewWindow.on('closed', () => {
    previewRoots.delete(contentsId);
    previewWindows.delete(realPath);
  });

  // WebRTC may not send UDP unless a proxy carries it; the session proxy cannot.
  contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event) => {
    if (!isHtmlPreviewRequestAllowed(event.url, rootDir)) {
      event.preventDefault();
    }
  });

  void previewWindow.loadFile(realPath);
  return success(undefined);
}
