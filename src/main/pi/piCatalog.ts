/**
 * Reads the user's pi provider/model catalog by running `piCatalogProcess.mjs`
 * in a child process.
 *
 * It has to be a child process. Enumerating pi's catalog means loading the
 * user's pi extensions, and an extension load mutates process-global state
 * that live pi sessions depend on: `pi-cursor-sdk` rebuilds its pi-tool bridge
 * singleton on every load, and a load that never becomes an `AgentSession`
 * leaves that singleton holding an extension runtime nobody bound. In-process,
 * that killed every follow-up turn of an already-running chat with "Extension
 * runtime not initialized", because `ChatModelChoiceService.resolveForTurn`
 * reloads the catalog on each send.
 */

import { spawn, type SpawnOptions } from 'child_process';
import { randomUUID } from 'crypto';
import { homedir } from 'os';
import path from 'path';
import { z } from 'zod';
import { getConfig } from '../config';
import { resolvePiProjectTrust } from './PiChatSession';

const piCatalogSchema = z.object({
  /** `"<provider>/<modelId>"` the user's own pi CLI defaults to, or null if unset. */
  defaultSelector: z.string().nullable(),
  credentials: z.array(z.string()),
  providerNames: z.record(z.string(), z.string()),
  models: z.array(z.object({
    provider: z.string(),
    id: z.string(),
    name: z.string(),
    contextWindow: z.number().optional(),
  })),
  extensionErrors: z.array(z.string()),
  diagnostics: z.array(z.string()),
});

export type PiCatalogSnapshot = z.infer<typeof piCatalogSchema>;

export interface PiCatalogProcess {
  /** Nullable to match `ChildProcess`; always piped for the stdio this module asks for. */
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'error' | 'close', listener: (...args: unknown[]) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type PiCatalogSpawn = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => PiCatalogProcess;

export interface ReadPiCatalogDeps {
  spawnProcess?: PiCatalogSpawn;
  scriptPath?: string;
  timeoutMs?: number;
}

function collect(stream: NodeJS.ReadableStream | null): { text: () => string } {
  let text = '';
  stream?.setEncoding('utf8');
  stream?.on('data', (chunk: string) => { text += chunk; });
  return { text: () => text };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function extractMarkedPayload(stdout: string, marker: string): string | undefined {
  const start = stdout.indexOf(marker);
  if (start < 0) return undefined;
  const end = stdout.indexOf(marker, start + marker.length);
  return end < 0 ? undefined : stdout.slice(start + marker.length, end);
}

/**
 * The sidecar is emitted next to the built main bundle, so it resolves the
 * same way in dev and in the packaged app — including from inside `app.asar`,
 * which `ELECTRON_RUN_AS_NODE` still reads.
 */
function defaultScriptPath(): string {
  return path.join(__dirname, 'piCatalogProcess.mjs');
}

export async function readPiCatalog(deps: ReadPiCatalogDeps = {}): Promise<PiCatalogSnapshot> {
  const marker = `<<<kpm-pi-catalog:${randomUUID()}>>>`;
  const spawnProcess = deps.spawnProcess ?? ((command, args, options) => spawn(command, args, options));
  const timeoutMs = deps.timeoutMs ?? getConfig().session.piCatalogTimeoutMs;
  // `cwd` cannot affect the result: project trust is denied, so no
  // `<cwd>/.pi/` resource is ever read. Some directory is still required.
  const sidecarOptions = JSON.stringify({
    marker,
    cwd: homedir(),
    projectTrusted: await resolvePiProjectTrust(),
  });
  const child = spawnProcess(
    process.execPath,
    [deps.scriptPath ?? defaultScriptPath(), sidecarOptions],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const stdout = collect(child.stdout);
  const stderr = collect(child.stderr);

  return await new Promise<PiCatalogSnapshot>((resolve, reject) => {
    // Extensions can hang indefinitely (an MCP server that never connects, a
    // model catalog fetch with no timeout of its own), and callers race this
    // promise rather than owning the process — so kill it here or it leaks.
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`pi catalog process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (error: unknown) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start the pi catalog process: ${error instanceof Error ? error.message : String(error)}`));
    });

    child.on('close', (code: unknown) => {
      clearTimeout(timer);
      const payload = extractMarkedPayload(stdout.text(), marker);
      if (!payload) {
        const detail = stderr.text().trim() || stdout.text().trim() || 'no output';
        reject(new Error(`pi catalog process exited (${String(code)}) without a result: ${detail}`));
        return;
      }
      const parsed = piCatalogSchema.safeParse(parseJson(payload));
      if (!parsed.success) {
        reject(new Error(`pi catalog process returned an unreadable result: ${parsed.error.message}`));
        return;
      }
      resolve(parsed.data);
    });
  });
}
