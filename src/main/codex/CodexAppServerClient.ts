import { spawn, type SpawnOptionsWithoutStdio } from 'child_process';
import { createInterface } from 'readline';
import { findCodexBinaryPath } from './binary';

type JsonObject = Record<string, unknown>;

export interface CodexAppServerProcess {
  stdin: { write(chunk: string): boolean };
  stdout: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
  once(event: 'error' | 'exit', listener: (...args: unknown[]) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type CodexAppServerSpawn = (
  binary: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => CodexAppServerProcess;

export interface CodexAppServerClientOptions {
  binaryPath?: string;
  env?: NodeJS.ProcessEnv;
  spawnProcess?: CodexAppServerSpawn;
}

export class CodexAppServerError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = 'CodexAppServerError';
  }
}

type ServerRequestHandler = (method: string, params: JsonObject) => Promise<unknown>;
type NotificationHandler = (method: string, params: JsonObject) => void;

/**
 * Small JSONL client for the app-server protocol. It deliberately owns only
 * the stable request/response and server-request mechanics KPM chat needs;
 * generated bindings are version-specific and would make packaging brittle.
 */
export class CodexAppServerClient {
  private readonly options: CodexAppServerClientOptions;
  private process: CodexAppServerProcess | null = null;
  private nextRequestId = 1;
  private closed = false;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly notifications = new Set<NotificationHandler>();
  private serverRequestHandler: ServerRequestHandler | null = null;

  constructor(options: CodexAppServerClientOptions = {}) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    if (this.process) return;
    const spawnProcess = this.options.spawnProcess ?? ((binary, args, options) => (
      spawn(binary, args, options)
    ));
    const binary = this.options.binaryPath ?? findCodexBinaryPath();
    const process = spawnProcess(binary, ['app-server', '--stdio'], {
      env: this.options.env ?? processEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = process;
    const lines = createInterface({ input: process.stdout });
    lines.on('line', (line) => this.receiveLine(line));
    process.once('error', (error) => this.failAll(error instanceof Error ? error : new Error(String(error))));
    process.once('exit', (code, signal) => {
      const exitReason = typeof code === 'number' ? String(code) : typeof signal === 'string' ? signal : 'unknown';
      if (!this.closed) this.failAll(new Error(`Codex app-server exited (${exitReason})`));
    });

    await this.request('initialize', {
      clientInfo: { name: 'kpm', title: 'KPM', version: '1.0.0' },
      capabilities: { mcpServerOpenaiFormElicitation: true },
    });
    this.notify('initialized', {});
  }

  onNotification(handler: NotificationHandler): () => void {
    this.notifications.add(handler);
    return () => this.notifications.delete(handler);
  }

  setServerRequestHandler(handler: ServerRequestHandler): void {
    this.serverRequestHandler = handler;
  }

  request(method: string, params: JsonObject = {}): Promise<unknown> {
    if (!this.process || this.closed) return Promise.reject(new Error('Codex app-server is not running'));
    const id = this.nextRequestId++;
    const result = new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.send({ method, id, params });
    return result;
  }

  notify(method: string, params: JsonObject = {}): void {
    if (!this.process || this.closed) return;
    this.send({ method, params });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.failAll(new Error('Codex app-server closed'));
    this.process?.kill('SIGTERM');
    this.process = null;
  }

  private send(message: JsonObject): void {
    this.process?.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receiveLine(line: string): void {
    let message: JsonObject;
    try {
      message = JSON.parse(line) as JsonObject;
    } catch {
      console.warn('[CodexAppServer] Ignoring invalid JSONL message');
      return;
    }
    const id = typeof message.id === 'number' ? message.id : null;
    const method = typeof message.method === 'string' ? message.method : null;
    const params = isObject(message.params) ? message.params : {};

    if (id !== null && method) {
      void this.respondToServerRequest(id, method, params);
      return;
    }
    if (id !== null) {
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      if (isObject(message.error)) {
        const errorMessage = typeof message.error.message === 'string' ? message.error.message : 'Codex app-server request failed';
        pending.reject(new CodexAppServerError(errorMessage, typeof message.error.code === 'number' ? message.error.code : undefined));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (method) {
      for (const handler of this.notifications) handler(method, params);
    }
  }

  private async respondToServerRequest(id: number, method: string, params: JsonObject): Promise<void> {
    try {
      const result = this.serverRequestHandler
        ? await this.serverRequestHandler(method, params)
        : {};
      this.send({ id, result });
    } catch (error) {
      this.send({ id, error: { code: -32603, message: error instanceof Error ? error.message : 'Request handler failed' } });
    }
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function processEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}
