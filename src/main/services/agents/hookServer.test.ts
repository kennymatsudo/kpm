import { describe, expect, it } from 'vitest';
import { hookEventToActivity, parseHookSessionId } from './hookServer';

describe('hookServer', () => {
  it('accepts review session hook paths with a -review suffix', () => {
    expect(parseHookSessionId('/hook/123e4567-e89b-12d3-a456-426614174000-review'))
      .toBe('123e4567-e89b-12d3-a456-426614174000-review');
  });

  it('rejects unrelated hook paths', () => {
    expect(parseHookSessionId('/hook/not/valid')).toBeNull();
    expect(parseHookSessionId('/nope/123')).toBeNull();
  });
});

describe('hookEventToActivity kind classification', () => {
  it('classifies Claude Code native tool names by what they do', () => {
    expect(hookEventToActivity({ event: 'pre_tool_use', toolName: 'Read' })).toMatchObject({ kind: 'read' });
    expect(hookEventToActivity({ event: 'pre_tool_use', toolName: 'Edit' })).toMatchObject({ kind: 'edit' });
    expect(hookEventToActivity({ event: 'pre_tool_use', toolName: 'Bash' })).toMatchObject({ kind: 'run' });
  });

  it('classifies Gemini CLI tool names by what they do', () => {
    expect(hookEventToActivity({ event: 'post_tool_use', toolName: 'read_file' })).toMatchObject({ kind: 'read' });
    expect(hookEventToActivity({ event: 'post_tool_use', toolName: 'write_file' })).toMatchObject({ kind: 'edit' });
    expect(hookEventToActivity({ event: 'post_tool_use', toolName: 'run_shell_command' })).toMatchObject({ kind: 'run' });
  });

  it('falls back to kind "other" for an unrecognized tool name', () => {
    expect(hookEventToActivity({ event: 'pre_tool_use', toolName: 'some_mcp_tool' })).toMatchObject({ kind: 'other' });
  });

  it('threads an optional callId through when the hook payload carries one', () => {
    expect(hookEventToActivity({ event: 'pre_tool_use', toolName: 'Bash', callId: 'call-1' }))
      .toMatchObject({ callId: 'call-1' });
    // No current producer sets one — verify the field stays undefined rather than a synthesized value.
    expect(hookEventToActivity({ event: 'pre_tool_use', toolName: 'Bash' })?.callId).toBeUndefined();
  });
});
