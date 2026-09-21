import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import { CodexAppServerClient, CodexAppServerError } from './CodexAppServerClient';

class FakeProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly sent: unknown[] = [];
  readonly stdin = { write: (line: string) => { this.sent.push(JSON.parse(line)); return true; } };
  kill = vi.fn(() => true);
  reply(message: unknown): void { this.stdout.write(`${JSON.stringify(message)}\n`); }
}

async function initializedClient(process: FakeProcess): Promise<CodexAppServerClient> {
  const client = new CodexAppServerClient({ binaryPath: '/fake/codex', spawnProcess: () => process });
  const initializing = client.initialize();
  process.reply({ id: 1, result: {} });
  await initializing;
  return client;
}

describe('CodexAppServerClient', () => {
  it('correlates JSON-RPC requests and replies to server requests', async () => {
    const process = new FakeProcess();
    const client = await initializedClient(process);
    client.setServerRequestHandler(async (method, params) => ({ method, command: params.command }));
    const request = client.request('thread/start', { model: 'gpt' });
    process.reply({ id: 2, result: { thread: { id: 'thread-1' } } });
    await expect(request).resolves.toEqual({ thread: { id: 'thread-1' } });
    process.reply({ id: 99, method: 'item/commandExecution/requestApproval', params: { command: 'git status' } });
    await vi.waitFor(() => expect(process.sent).toContainEqual({ id: 99, result: { method: 'item/commandExecution/requestApproval', command: 'git status' } }));
  });

  it('rejects with the server\'s JSON-RPC error, preserving its code', async () => {
    const process = new FakeProcess();
    const client = await initializedClient(process);
    const request = client.request('thread/start', { model: 'gpt' });
    process.reply({ id: 2, error: { code: -32000, message: 'boom' } });

    await expect(request).rejects.toBeInstanceOf(CodexAppServerError);
    await expect(request).rejects.toMatchObject({ message: 'boom', code: -32000 });
  });

  it('rejects pending calls when the process exits and cleans up on close', async () => {
    const process = new FakeProcess();
    const client = await initializedClient(process);
    const request = client.request('turn/start', { threadId: 'thread-1', input: [] });
    process.emit('exit', 1, null);
    await expect(request).rejects.toThrow('exited');
    client.close();
    expect(process.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
