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

  it('attach spawns a session and emits data from the shell', async () => {
    let received = '';
    service.on('data', (_id: string, chunk: string) => {
      received += chunk;
    });

    const result = service.attach({ id: 't1', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    expect(result.ok).toBe(true);
    expect(service.list('p1')).toHaveLength(1);

    service.write('t1', 'echo hello-kpm\n');
    await waitFor(() => received.includes('hello-kpm'));
  });

  it('attaching twice returns the same session without spawning a second PTY', () => {
    const first = service.attach({ id: 'dup', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    const second = service.attach({ id: 'dup', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(service.list('p1')).toHaveLength(1);
  });

  it('a detached session keeps buffering silently and replays scrollback on re-attach', async () => {
    service.attach({ id: 'detach1', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });

    let dataEvents = 0;
    service.on('data', () => {
      dataEvents += 1;
    });

    const detachResult = service.detach('detach1');
    expect(detachResult.ok).toBe(true);

    service.write('detach1', 'echo something\n');
    await new Promise((r) => setTimeout(r, 300));
    expect(dataEvents).toBe(0);

    let scrollback = '';
    await waitFor(() => {
      const reattached = service.attach({ id: 'detach1', projectId: 'p1', cols: 80, rows: 24 });
      if (reattached.ok) scrollback = reattached.data.scrollback;
      return scrollback.includes('something');
    });
  });

  it('resumes emitting once a new view re-attaches', async () => {
    service.attach({ id: 'resume1', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    service.detach('resume1');

    let received = '';
    service.on('data', (_id: string, chunk: string) => {
      received += chunk;
    });

    expect(service.attach({ id: 'resume1', projectId: 'p1', cols: 80, rows: 24 }).ok).toBe(true);
    service.write('resume1', 'echo back-online\n');
    await waitFor(() => received.includes('back-online'));
  });

  it('re-attaching a live session resizes the PTY to the new view', async () => {
    service.attach({ id: 'refit', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    service.detach('refit');

    let received = '';
    service.on('data', (_id: string, chunk: string) => {
      received += chunk;
    });
    expect(service.attach({ id: 'refit', projectId: 'p1', cols: 132, rows: 40 }).ok).toBe(true);

    service.write('refit', 'stty size\n');
    await waitFor(() => received.includes('40 132'));
  });

  it('kill on an unknown id returns failure', () => {
    const result = service.kill('does-not-exist');
    expect(result.ok).toBe(false);
  });

  it('kill ends the session and removes it from list()', async () => {
    let exited: { id: string; code: number } | null = null;
    service.on('exit', (id: string, exitCode: number) => {
      exited = { id, code: exitCode };
    });

    service.attach({ id: 'k1', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    const result = service.kill('k1');
    expect(result.ok).toBe(true);

    expect(service.list('p1')).toHaveLength(0);
    await waitFor(() => exited !== null);
    expect(exited!.id).toBe('k1');
  });

  it('write/resize/detach on an unknown id return failure', () => {
    expect(service.write('nope', 'x').ok).toBe(false);
    expect(service.resize('nope', 10, 10).ok).toBe(false);
    expect(service.detach('nope').ok).toBe(false);
  });

  it('keeps an exited session in list() with its status and exit code, scrollback still readable', async () => {
    service.attach({ id: 'exit1', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    service.write('exit1', 'echo before-exit\nexit 0\n');

    await waitFor(() => service.list('p1').find((s) => s.id === 'exit1')?.status === 'exited');

    const snapshot = service.list('p1').find((s) => s.id === 'exit1');
    expect(snapshot).toBeDefined();
    expect(snapshot!.status).toBe('exited');
    expect(snapshot!.exitCode).toBe(0);

    const reattached = service.attach({ id: 'exit1', projectId: 'p1', cols: 80, rows: 24 });
    expect(reattached.ok).toBe(true);
    if (reattached.ok) {
      expect(reattached.data.scrollback).toContain('before-exit');
    }
  });

  it('falls back to homedir when cwd does not exist', () => {
    const bogus = join(tempDir, 'does-not-exist-here');
    const result = service.attach({ id: 't-fallback', projectId: 'p1', cwd: bogus, cols: 80, rows: 24, shell: '/bin/sh' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.session.cwd).toBe(homedir());
    }
  });

  it('falls back to homedir when cwd is omitted', () => {
    const result = service.attach({ id: 't-home', projectId: 'p1', cols: 80, rows: 24, shell: '/bin/sh' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.session.cwd).toBe(homedir());
    }
  });

  it('caps the per-session output buffer at 1MB', async () => {
    service.attach({ id: 'buf', projectId: 'p1', cwd: tempDir, cols: 200, rows: 50, shell: '/bin/sh' });
    // Generate well over the 1MB cap: 2MB of bytes.
    service.write('buf', 'yes a | head -c 2000000\n');
    await waitFor(() => {
      const snapshot = service.attach({ id: 'buf', projectId: 'p1', cols: 200, rows: 50 });
      return snapshot.ok && snapshot.data.scrollback.length >= 1024 * 1024;
    }, 8000);
    const result = service.attach({ id: 'buf', projectId: 'p1', cols: 200, rows: 50 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.scrollback.length).toBeLessThanOrEqual(1024 * 1024 + 1024); // small slack for trim boundary
    }
  });

  it('shutdown kills every live session', () => {
    service.attach({ id: 's1', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    service.attach({ id: 's2', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    expect(service.list('p1')).toHaveLength(2);
    service.shutdown();
    expect(service.list('p1')).toHaveLength(0);
  });

  it('list only returns the asking project\'s sessions', () => {
    service.attach({ id: 'a1', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    service.attach({ id: 'b1', projectId: 'p2', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });

    expect(service.list('p1').map((s) => s.id)).toEqual(['a1']);
    expect(service.list('p2').map((s) => s.id)).toEqual(['b1']);
  });

  it('killForProject ends only that project\'s sessions', () => {
    service.attach({ id: 'doomed', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    service.attach({ id: 'spared', projectId: 'p2', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });

    expect(service.killForProject('p1').ok).toBe(true);

    expect(service.list('p1')).toHaveLength(0);
    expect(service.list('p2').map((s) => s.id)).toEqual(['spared']);
  });

  it('counts running sessions per project, excluding exited ones', async () => {
    service.attach({ id: 'live-a', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    service.attach({ id: 'live-b', projectId: 'p1', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });
    service.attach({ id: 'dying', projectId: 'p2', cwd: tempDir, cols: 80, rows: 24, shell: '/bin/sh' });

    service.write('dying', 'exit 0\n');
    await waitFor(() => service.list('p2').find((s) => s.id === 'dying')?.status === 'exited');

    const counts = service.runningCountsByProject();
    expect(counts.get('p1')).toBe(2);
    expect(counts.has('p2')).toBe(false);
  });
});
