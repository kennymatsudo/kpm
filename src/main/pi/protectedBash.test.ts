import { describe, expect, it } from 'vitest';
import { buildProtectedBashSpawn } from './protectedBash';

describe('buildProtectedBashSpawn', () => {
  it('runs the shell in a write-capable profile with protected paths denied', () => {
    const invocation = buildProtectedBashSpawn(
      '/repos/my-app',
      'printf hello > output.txt',
      ['/protected/credentials'],
      '/tmp/codex',
    );

    expect(invocation.command).toBe('/tmp/codex');
    expect(invocation.args).toContain('kpm-chat-write');
    expect(invocation.args).toContain('default_permissions="kpm-chat-write"');
    expect(invocation.args).toContain('permissions.kpm-chat-write.filesystem.":root"="write"');
    expect(invocation.args).toContain(
      'permissions.kpm-chat-write.filesystem."/protected/credentials"="deny"',
    );
    expect(invocation.args).toContain('permissions.kpm-chat-write.network.enabled=false');
    expect(invocation.args.at(-1)).toBe('printf hello > output.txt');
  });
});
