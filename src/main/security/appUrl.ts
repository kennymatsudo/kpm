import { app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function getRendererDevOrigin(): string | null {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (!rendererUrl) return null;
  return parseUrl(rendererUrl)?.origin ?? null;
}

function getPackagedRendererIndexPath(): string {
  return path.resolve(__dirname, '../renderer/index.html');
}

function getTrustedRendererIndexPaths(): Set<string> {
  const paths = new Set<string>([getPackagedRendererIndexPath()]);

  try {
    paths.add(path.resolve(app.getAppPath(), 'dist/renderer/index.html'));
  } catch {
    // app.getAppPath() can be unavailable in lightweight unit-test mocks.
  }

  if (!app.isPackaged) {
    paths.add(path.resolve(process.cwd(), 'dist/renderer/index.html'));
  }

  return paths;
}

function isTrustedFileUrl(parsed: URL): boolean {
  try {
    const filePath = path.resolve(fileURLToPath(parsed));
    return getTrustedRendererIndexPaths().has(filePath);
  } catch {
    return false;
  }
}

/**
 * Returns true for the app's own renderer document.
 *
 * This is intentionally narrower than the external URL allowlist: renderer
 * navigation and IPC sender validation should trust only the KPM app frame,
 * while external links continue to open in the user's default browser.
 */
export function isTrustedAppUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;

  const devOrigin = getRendererDevOrigin();
  if (!app.isPackaged && devOrigin && parsed.origin === devOrigin) {
    return true;
  }

  if (parsed.protocol === 'file:') {
    return isTrustedFileUrl(parsed);
  }

  return false;
}
