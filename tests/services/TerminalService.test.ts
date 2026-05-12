import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { homedir, tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { TerminalService } from '../../src/main/services/streaming/TerminalService';

// Helper: wait for a predicate to hold or fail after timeoutMs.
async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitFor timed out');
}

describe('TerminalService', () => {
  let service: TerminalService;
  let tempDir: string;

  beforeEach(() => {
    service = new TerminalService();
    tempDir = mkdtempSync(join(tmpdir(), 'kpm-terminal-test-'));
  });

  afterEach(() => {
    service.shutdown();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a session and emits data from the shell', async () => {
    let received = '';
    service.on('data', (_id: string, chunk: string) => {
      received += chunk;
    });

    const result = service.create({
      id: 't1',
      cwd: tempDir,
      cols: 80,
      rows: 24,
      shell: '/bin/sh',
    });
    expect(result.ok).toBe(true);
    expect(service.has('t1')).toBe(true);
    expect(service.size()).toBe(1);

    service.write('t1', "echo hello-kpm\n");
    await waitFor(() => received.includes('hello-kpm'));
  });

  it('refuses duplicate ids', () => {
    service.create({ id: 'dup', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    const second = service.create({ id: 'dup', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    expect(second.ok).toBe(false);
  });

  it('falls back to homedir when cwd does not exist', () => {
    const bogus = join(tempDir, 'does-not-exist-here');
    const result = service.create({ id: 't-fallback', cwd: bogus, cols: 80, rows: 24, shell: '/bin/sh' });
    expect(result.ok).toBe(true);
    // The PTY itself was spawned; cwd resolution falling back is internal to
    // the service. Confirm by issuing pwd and reading output.
    let received = '';
    service.on('data', (_id: string, chunk: string) => {
      received += chunk;
    });
    service.write('t-fallback', 'pwd\n');
    return waitFor(() => received.includes(homedir()));
  });

  it('falls back to homedir when cwd is omitted', () => {
    const result = service.create({ id: 't-home', cols: 80, rows: 24, shell: '/bin/sh' });
    expect(result.ok).toBe(true);

    let received = '';
    service.on('data', (_id: string, chunk: string) => {
      received += chunk;
    });
    service.write('t-home', 'pwd\n');
    return waitFor(() => received.includes(homedir()));
  });

  it('resize updates the underlying PTY without throwing', () => {
    service.create({ id: 'r1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    const result = service.resize('r1', 120, 40);
    expect(result.ok).toBe(true);
  });

  it('kill emits exit and clears the session', async () => {
    let exited: { id: string; code: number } | null = null;
    service.on('exit', (id: string, exitCode: number) => {
      exited = { id, code: exitCode };
    });

    service.create({ id: 'k1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    service.kill('k1');

    await waitFor(() => exited !== null);
    expect(exited!.id).toBe('k1');
    expect(service.has('k1')).toBe(false);
  });

  it('write/resize on missing id returns failure', () => {
    expect(service.write('nope', 'x').ok).toBe(false);
    expect(service.resize('nope', 10, 10).ok).toBe(false);
  });

  it('shutdown kills every live PTY', () => {
    service.create({ id: 's1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    service.create({ id: 's2', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    expect(service.size()).toBe(2);
    service.shutdown();
    expect(service.size()).toBe(0);
  });

  it('caps the per-session output buffer at 1MB', async () => {
    service.create({ id: 'buf', cwd: tempDir, cols: 200, rows: 50, shell: '/bin/sh' });
    // Generate well over the 1MB cap: 2MB of bytes.
    service.write('buf', 'yes a | head -c 2000000\n');
    await waitFor(() => {
      const buf = service.getBuffer('buf');
      return buf !== undefined && buf.length >= 1024 * 1024;
    }, 8000);
    const buf = service.getBuffer('buf')!;
    expect(buf.length).toBeLessThanOrEqual(1024 * 1024 + 1024); // small slack for trim boundary
  });
});
