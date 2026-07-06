import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import os from 'os';
import path from 'path';
import type { HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import { createTestConfig, setConfig } from '../../config';
import { evaluateBoardToolCall } from './credentialGuardHook';

function preToolUse(
  toolName: string,
  toolInput: Record<string, unknown>,
  cwd = '/repo'
): HookInput {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: 'tu-1',
    session_id: 'sess-1',
    transcript_path: '/tmp/transcript',
    cwd,
  };
}

function isDeny(result: HookJSONOutput): boolean {
  return (
    'hookSpecificOutput' in result &&
    (result.hookSpecificOutput as { permissionDecision?: string } | undefined)?.permissionDecision ===
      'deny'
  );
}

function isAllow(result: HookJSONOutput): boolean {
  return 'continue' in result && result.continue === true;
}

beforeEach(() => {
  setConfig(createTestConfig({}));
});

afterEach(() => {
  setConfig(createTestConfig({}));
});

describe('evaluateBoardToolCall credential denial', () => {
  it('denies reading a credential file addressed via ~', async () => {
    const result = await evaluateBoardToolCall(
      preToolUse('Read', { file_path: '~/.ssh/id_rsa' })
    );
    expect(isDeny(result)).toBe(true);
  });

  it('denies editing a credential file addressed by absolute home path', async () => {
    const result = await evaluateBoardToolCall(
      preToolUse('Edit', { file_path: path.join(os.homedir(), '.aws', 'credentials') })
    );
    expect(isDeny(result)).toBe(true);
  });

  it('denies a Grep whose search path is a credential root', async () => {
    const result = await evaluateBoardToolCall(
      preToolUse('Grep', { pattern: 'AKIA', path: '~/.aws' })
    );
    expect(isDeny(result)).toBe(true);
  });

  it('denies a Bash command that reads a credential file', async () => {
    expect(isDeny(await evaluateBoardToolCall(preToolUse('Bash', { command: 'cat ~/.ssh/id_rsa' })))).toBe(true);
    expect(isDeny(await evaluateBoardToolCall(preToolUse('Bash', { command: 'cat $HOME/.aws/credentials' })))).toBe(true);
    expect(isDeny(await evaluateBoardToolCall(preToolUse('Bash', { command: 'cat /etc/sudoers' })))).toBe(true);
  });

  it('allows ordinary reads, writes, and bash commands', async () => {
    expect(isAllow(await evaluateBoardToolCall(preToolUse('Read', { file_path: '/repo/src/index.ts' })))).toBe(true);
    expect(isAllow(await evaluateBoardToolCall(preToolUse('Write', { file_path: '/repo/src/new.ts' })))).toBe(true);
    expect(isAllow(await evaluateBoardToolCall(preToolUse('Bash', { command: 'npm test && git commit -am wip' })))).toBe(true);
    expect(isAllow(await evaluateBoardToolCall(preToolUse('Grep', { pattern: 'TODO', path: 'src' })))).toBe(true);
  });
});

describe('evaluateBoardToolCall git-hooks write denial', () => {
  it('denies writing a git hook', async () => {
    expect(isDeny(await evaluateBoardToolCall(preToolUse('Write', { file_path: '/repo/.git/hooks/pre-commit' })))).toBe(true);
    expect(isDeny(await evaluateBoardToolCall(preToolUse('Edit', { file_path: '/repo/.git/hooks/pre-push' })))).toBe(true);
  });

  it('resolves a relative git-hook path against the tool cwd', async () => {
    const result = await evaluateBoardToolCall(
      preToolUse('Write', { file_path: '.git/hooks/pre-commit' }, '/repo')
    );
    expect(isDeny(result)).toBe(true);
  });

  it('allows reading a git hook (only writes are blocked)', async () => {
    const result = await evaluateBoardToolCall(
      preToolUse('Read', { file_path: '/repo/.git/hooks/pre-commit' })
    );
    expect(isAllow(result)).toBe(true);
  });
});

describe('evaluateBoardToolCall passthrough', () => {
  it('allows unknown tools and non-PreToolUse events', async () => {
    expect(isAllow(await evaluateBoardToolCall(preToolUse('SomeOtherTool', { foo: 'bar' })))).toBe(true);
    const post = { hook_event_name: 'PostToolUse', tool_name: 'Read' } as unknown as HookInput;
    expect(isAllow(await evaluateBoardToolCall(post))).toBe(true);
  });
});
