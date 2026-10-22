import { getConfig } from '../config';
import { CodexAppServerClient } from './CodexAppServerClient';

/**
 * Ask Codex which models this account can use, over the same app-server
 * protocol chat already runs on. Returns the raw `model/list` result; parsing
 * lives in `shared/modelCatalog.ts` so it can be tested without a process.
 */
export async function listCodexModels(
  createClient: () => CodexAppServerClient = () => new CodexAppServerClient(),
): Promise<unknown> {
  const client = createClient();
  // Closing rejects the pending request, so a hung app-server cannot outlive the timeout.
  const timer = setTimeout(() => client.close(), getConfig().session.modelCatalogTimeoutMs);
  try {
    await client.initialize();
    return await client.request('model/list', {});
  } finally {
    clearTimeout(timer);
    client.close();
  }
}
