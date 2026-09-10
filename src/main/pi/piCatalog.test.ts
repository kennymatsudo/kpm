import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import { readPiCatalog, type PiCatalogSnapshot } from './piCatalog';

class FakeProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  kill = vi.fn(() => true);
}

interface SpawnCall {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

function fakeSpawn(child: FakeProcess): { spawnProcess: typeof spawnStub; calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  const spawnStub = (command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => {
    calls.push({ command, args, env: options.env ?? {} });
    return child;
  };
  return { spawnProcess: spawnStub, calls };
}

/** The marker is generated per run, so a fake sidecar has to echo the one it was handed. */
function markerFrom(call: SpawnCall): string {
  return (JSON.parse(call.args[1]) as { marker: string }).marker;
}

async function respond(child: FakeProcess, stdout: string, exitCode = 0): Promise<void> {
  child.stdout.write(stdout);
  await new Promise((resolve) => setImmediate(resolve));
  child.emit('close', exitCode, null);
}

const payload: PiCatalogSnapshot = {
  defaultSelector: 'cursor/grok-4.6',
  credentials: ['cursor'],
  providerNames: { cursor: 'Cursor' },
  models: [{ provider: 'cursor', id: 'grok-4.6', name: 'Grok 4.6', contextWindow: 200_000 }],
  extensionErrors: [],
  diagnostics: [],
};

describe('readPiCatalog', () => {
  it('runs the sidecar as a node process so pi extensions load outside the main process', async () => {
    const child = new FakeProcess();
    const { spawnProcess, calls } = fakeSpawn(child);

    const reading = readPiCatalog({ spawnProcess, scriptPath: '/app/dist/main/piCatalogProcess.mjs', timeoutMs: 1000 });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await respond(child, `${markerFrom(calls[0])}${JSON.stringify(payload)}${markerFrom(calls[0])}`);
    await reading;

    expect(calls[0].command).toBe(process.execPath);
    expect(calls[0].args[0]).toBe('/app/dist/main/piCatalogProcess.mjs');
    expect(calls[0].env.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('denies project trust so no repo-local pi resource is loaded', async () => {
    const child = new FakeProcess();
    const { spawnProcess, calls } = fakeSpawn(child);

    const reading = readPiCatalog({ spawnProcess, timeoutMs: 1000 });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await respond(child, `${markerFrom(calls[0])}${JSON.stringify(payload)}${markerFrom(calls[0])}`);
    await reading;

    expect(JSON.parse(calls[0].args[1])).toMatchObject({ projectTrusted: false });
  });

  it('reads the marked payload out of stdout an extension has logged into', async () => {
    const child = new FakeProcess();
    const { spawnProcess, calls } = fakeSpawn(child);

    const reading = readPiCatalog({ spawnProcess, timeoutMs: 1000 });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const marker = markerFrom(calls[0]);
    await respond(child, `pi-mcp-adapter: connecting\n${marker}${JSON.stringify(payload)}${marker}\ntrailing noise\n`);

    await expect(reading).resolves.toEqual(payload);
  });

  it('rejects with the sidecar stderr when it exits without a payload', async () => {
    const child = new FakeProcess();
    const { spawnProcess, calls } = fakeSpawn(child);

    const reading = readPiCatalog({ spawnProcess, timeoutMs: 1000 });
    const rejection = expect(reading).rejects.toThrow("exited (1) without a result: Cannot find module 'typebox'");
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    child.stderr.write("Cannot find module 'typebox'");
    await respond(child, '', 1);

    await rejection;
  });

  it('rejects a payload that does not match the catalog shape', async () => {
    const child = new FakeProcess();
    const { spawnProcess, calls } = fakeSpawn(child);

    const reading = readPiCatalog({ spawnProcess, timeoutMs: 1000 });
    const rejection = expect(reading).rejects.toThrow('unreadable result');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const marker = markerFrom(calls[0]);
    await respond(child, `${marker}${JSON.stringify({ credentials: 'cursor' })}${marker}`);

    await rejection;
  });

  it('kills a sidecar that never reports', async () => {
    const child = new FakeProcess();
    const { spawnProcess, calls } = fakeSpawn(child);

    const reading = readPiCatalog({ spawnProcess, timeoutMs: 5 });

    await expect(reading).rejects.toThrow('timed out after 5ms');
    expect(calls).toHaveLength(1);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('rejects when the sidecar cannot be started', async () => {
    const child = new FakeProcess();
    const { spawnProcess, calls } = fakeSpawn(child);

    const reading = readPiCatalog({ spawnProcess, timeoutMs: 1000 });
    const rejection = expect(reading).rejects.toThrow('Failed to start the pi catalog process: spawn ENOENT');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    child.emit('error', new Error('spawn ENOENT'));

    await rejection;
  });
});
