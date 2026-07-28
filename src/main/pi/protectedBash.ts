import { spawn, type ChildProcess } from 'child_process';
import type { BashOperations } from '@earendil-works/pi-coding-agent';
import { findCodexBinaryPath } from '../codex/binary';
import {
  buildCodexPermissionConfig,
  CODEX_WRITE_PROFILE,
  codexConfigOverrideArgs,
} from '../codex/permissionProfile';
import { getDeniedPathRoots } from '../services/files/pathSecurity';

export interface ProtectedBashSpawn {
  command: string;
  args: string[];
}

export function buildProtectedBashSpawn(
  cwd: string,
  command: string,
  deniedPathRoots: readonly string[],
  codexPath = findCodexBinaryPath(),
): ProtectedBashSpawn {
  const shell = process.platform === 'win32'
    ? process.env.ComSpec ?? 'cmd.exe'
    : process.env.SHELL ?? '/bin/sh';
  const shellArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c']
    : ['-lc'];
  const permissionConfig = buildCodexPermissionConfig(true, deniedPathRoots);

  return {
    command: codexPath,
    args: [
      'sandbox',
      ...codexConfigOverrideArgs(permissionConfig),
      '-P',
      CODEX_WRITE_PROFILE,
      '-C',
      cwd,
      '--',
      shell,
      ...shellArgs,
      command,
    ],
  };
}

function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      child.kill();
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    child.kill();
  }
}

export function createProtectedBashOperations(): BashOperations {
  return {
    async exec(command, cwd, { onData, signal, timeout, env }) {
      if (signal?.aborted) throw new Error('aborted');

      const invocation = buildProtectedBashSpawn(cwd, command, getDeniedPathRoots());
      const child = spawn(invocation.command, invocation.args, {
        cwd,
        detached: process.platform !== 'win32',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);

      let timedOut = false;
      const timeoutId = timeout === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            terminateProcessTree(child);
          }, timeout * 1000);
      const abort = (): void => terminateProcessTree(child);
      signal?.addEventListener('abort', abort, { once: true });

      try {
        const exitCode = await new Promise<number | null>((resolve, reject) => {
          child.once('error', reject);
          child.once('close', resolve);
        });
        if (signal?.aborted) throw new Error('aborted');
        if (timedOut) throw new Error(`timeout:${timeout}`);
        return { exitCode };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abort);
      }
    },
  };
}
