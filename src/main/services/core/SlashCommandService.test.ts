import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createSlashCommandService,
  parseSlashCommandFile,
  selectVisibleSlashCommands,
} from './SlashCommandService';

describe('parseSlashCommandFile', () => {
  it('reads description and argument-hint from frontmatter', () => {
    const content = [
      '---',
      'description: Review the current diff',
      'argument-hint: <branch>',
      '---',
      'Do the review.',
    ].join('\n');

    expect(parseSlashCommandFile('review', content)).toEqual({
      name: 'review',
      description: 'Review the current diff',
      argumentHint: '<branch>',
    });
  });

  it('strips quotes from frontmatter values', () => {
    const content = ['---', 'description: "Quoted description"', '---', 'Body'].join('\n');
    expect(parseSlashCommandFile('cmd', content).description).toBe('Quoted description');
  });

  it('falls back to the first body line when frontmatter has no description', () => {
    const content = ['---', 'argument-hint: <file>', '---', '', '# Summarize the file', 'More.'].join('\n');
    expect(parseSlashCommandFile('cmd', content).description).toBe('Summarize the file');
  });

  it('uses the first non-empty line when there is no frontmatter', () => {
    expect(parseSlashCommandFile('cmd', '\n\nExplain the codebase.\n').description).toBe(
      'Explain the codebase.',
    );
  });

  it('treats an unclosed frontmatter block as plain body', () => {
    const content = ['---', 'description: never closed'].join('\n');
    // No closing delimiter: the '---' line itself is skipped as a heading-stripped
    // empty line and the next line becomes the description.
    expect(parseSlashCommandFile('cmd', content).description).toBe('description: never closed');
  });

  it('truncates long descriptions', () => {
    const long = 'x'.repeat(300);
    const { description } = parseSlashCommandFile('cmd', long);
    expect(description.length).toBe(120);
    expect(description.endsWith('…')).toBe(true);
  });

  it('omits argumentHint when the frontmatter value is empty', () => {
    const content = ['---', 'description: d', 'argument-hint:', '---', 'Body'].join('\n');
    expect(parseSlashCommandFile('cmd', content)).toEqual({ name: 'cmd', description: 'd' });
  });
});

describe('SlashCommandService.listCommands', () => {
  let dir: string;
  let commandsDir: string;
  let skillsDir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpm-slash-'));
    commandsDir = path.join(dir, 'commands');
    skillsDir = path.join(dir, 'skills');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function createService() {
    return createSlashCommandService({ commandsDir, skillsDir });
  }

  function write(relativePath: string, content: string): void {
    const fullPath = path.join(commandsDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  function writeSkill(name: string, content: string): void {
    const skillDir = path.join(skillsDir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
  }

  it('returns an empty list when neither directory exists', () => {
    expect(createService().listCommands()).toEqual({ ok: true, data: [] });
  });

  it('lists commands sorted by name with subdirectories namespaced by colons', () => {
    write('review.md', '---\ndescription: Review code\n---\nBody');
    write('git/commit.md', '---\ndescription: Commit changes\n---\nBody');

    const result = createService().listCommands();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((c) => c.name)).toEqual(['git:commit', 'review']);
  });

  it('lists skills by directory name alongside commands', () => {
    write('review.md', '---\ndescription: Review code\n---\nBody');
    writeSkill('commit', '---\ndescription: Commit with approval\nargument-hint: <scope>\n---\nBody');

    const result = createService().listCommands();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([
      { name: 'commit', description: 'Commit with approval', argumentHint: '<scope>' },
      { name: 'review', description: 'Review code' },
    ]);
  });

  it('prefers the commands-dir entry when a skill has the same name', () => {
    write('commit.md', '---\ndescription: From commands dir\n---\nBody');
    writeSkill('commit', '---\ndescription: From skills dir\n---\nBody');

    const result = createService().listCommands();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([{ name: 'commit', description: 'From commands dir' }]);
  });

  it('ignores skill directories without a SKILL.md', () => {
    fs.mkdirSync(path.join(skillsDir, 'not-a-skill'), { recursive: true });
    writeSkill('real', 'A real skill');

    const result = createService().listCommands();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((c) => c.name)).toEqual(['real']);
  });

  it('recognizes invocations of known commands and skills only', () => {
    write('review.md', 'Review code');
    write('git/commit.md', 'Commit changes');
    writeSkill('squash', 'Squash commits');

    const service = createService();

    expect(service.isCommandInvocation('/review')).toBe(true);
    expect(service.isCommandInvocation('/review the last diff')).toBe(true);
    expect(service.isCommandInvocation('/git:commit -m fix')).toBe(true);
    expect(service.isCommandInvocation('/squash')).toBe(true);
    expect(service.isCommandInvocation('/unknown')).toBe(false);
    expect(service.isCommandInvocation('/Users/foo/bar.txt looks odd')).toBe(false);
    expect(service.isCommandInvocation('use /review here')).toBe(false);
  });

  it('ignores non-markdown files, hidden entries, and names containing whitespace', () => {
    write('valid.md', 'A command');
    write('notes.txt', 'not a command');
    write('.hidden.md', 'hidden');
    write('bad name.md', 'space in name');

    const result = createService().listCommands();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((c) => c.name)).toEqual(['valid']);
  });
});

describe('selectVisibleSlashCommands', () => {
  const context = {
    skillNames: ['commit', 'verify', 'codex:review'],
    pluginNames: ['codex', 'frontend-design'],
  };

  it('keeps scope-suffixed commands and strips the suffix', () => {
    const result = selectVisibleSlashCommands(
      [{ name: 'commit', description: 'Commit with approval (user)', argumentHint: '' }],
      { skillNames: [], pluginNames: [] },
    );
    expect(result).toEqual([{ name: 'commit', description: 'Commit with approval' }]);
  });

  it('keeps skill-backed and plugin commands but drops built-ins', () => {
    const result = selectVisibleSlashCommands(
      [
        { name: 'verify', description: 'Verify a change' },
        { name: 'codex:rescue', description: 'Hand off to Codex' },
        { name: 'frontend-design', description: 'Design UI' },
        { name: 'compact', description: 'Compact the conversation' },
        { name: 'clear', description: 'Clear the conversation' },
      ],
      context,
    );
    expect(result.map((c) => c.name)).toEqual(['codex:rescue', 'frontend-design', 'verify']);
  });

  it('normalizes empty argument hints to undefined and sorts by name', () => {
    const result = selectVisibleSlashCommands(
      [
        { name: 'verify', description: 'Verify (user)', argumentHint: '' },
        { name: 'commit', description: 'Commit (user)', argumentHint: '<scope>' },
      ],
      { skillNames: [], pluginNames: [] },
    );
    expect(result).toEqual([
      { name: 'commit', description: 'Commit', argumentHint: '<scope>' },
      { name: 'verify', description: 'Verify' },
    ]);
  });

  it('drops duplicates and names containing whitespace', () => {
    const result = selectVisibleSlashCommands(
      [
        { name: 'commit', description: 'First (user)' },
        { name: 'commit', description: 'Second (user)' },
        { name: 'bad name', description: 'Broken (user)' },
      ],
      { skillNames: [], pluginNames: [] },
    );
    expect(result).toEqual([{ name: 'commit', description: 'First' }]);
  });
});
