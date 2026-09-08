import { beforeEach, describe, expect, it } from 'vitest';
import os from 'os';
import path from 'path';
import type { HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import { createTestConfig, setConfig } from '../config';
import { evaluateSearchToolCall } from './searchGuardHook';

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

describe('evaluateSearchToolCall', () => {
  it('denies a Grep addressed at a credential root via ~', async () => {
    expect(isDeny(await evaluateSearchToolCall(preToolUse('Grep', { pattern: 'key', path: '~/.ssh' })))).toBe(true);
  });

  it('denies a Glob addressed at a credential root by absolute path', async () => {
    expect(isDeny(await evaluateSearchToolCall(preToolUse('Glob', { pattern: '**/*', path: path.join(os.homedir(), '.aws') })))).toBe(true);
  });

  // The traversal check is what a plain realpath deny misses: the search starts
  // above the credential root and walks down into it.
  it('denies a recursive search rooted above a credential directory', async () => {
    expect(isDeny(await evaluateSearchToolCall(preToolUse('Grep', { pattern: 'key', path: os.homedir() })))).toBe(true);
  });

  it('allows a search inside the repo', async () => {
    expect(isAllow(await evaluateSearchToolCall(preToolUse('Grep', { pattern: 'foo', path: '/repo/src' })))).toBe(true);
  });

  it('allows a search with no path argument when cwd is the repo', async () => {
    expect(isAllow(await evaluateSearchToolCall(preToolUse('Grep', { pattern: 'foo' })))).toBe(true);
  });

  it('leaves non-search tools to canUseTool', async () => {
    expect(isAllow(await evaluateSearchToolCall(preToolUse('Read', { file_path: '~/.ssh/id_rsa' })))).toBe(true);
  });
});
