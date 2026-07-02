/**
 * Slash Command Service
 *
 * Discovers the user's custom slash commands (~/.claude/commands/**\/*.md) and
 * skills (~/.claude/skills/*\/SKILL.md) so the chat input can offer a typeahead
 * menu before any session exists. Discovery only: expansion is handled by the
 * Agent SDK, which loads the same files via settingSources: ['user'].
 *
 * Once a session is live, the SDK's own command list (supportedCommands /
 * commands_changed) replaces the scan — it also covers plugin skills. The
 * selectVisibleSlashCommands policy below decides which of those to surface.
 *
 * Naming matches SDK behavior (verified against the init message's slash_commands):
 * subdirectory segments join with ':' — commands/sub/foo.md → 'sub:foo'; a skill's
 * name is its directory name.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { wrap, type ServiceResult } from '../result';
import type { SlashCommandInfo } from '../../../shared/types';

const MAX_DESCRIPTION_LENGTH = 120;
const FRONTMATTER_DELIMITER = '---';

export interface SlashCommandServiceDeps {
  /** Override for tests; defaults to ~/.claude/commands */
  commandsDir?: string;
  /** Override for tests; defaults to ~/.claude/skills */
  skillsDir?: string;
}

/** Init-message context needed to classify the SDK's command list by source. */
export interface SdkCommandContext {
  /** Skill-backed command names (init message `skills`) */
  skillNames: string[];
  /** Installed plugin names (init message `plugins[].name`) */
  pluginNames: string[];
}

/** Claude Code appends the settings scope to descriptions of user/project commands. */
const SCOPE_SUFFIX_PATTERN = / \((user|project)\)$/;

/**
 * Filter the SDK's full slash-command list down to what KPM surfaces in the
 * typeahead: user/project commands and skills, plus plugin-provided ones.
 * CLI built-ins (/compact, /clear, …) are excluded — they have no scope
 * suffix, aren't skill-backed, and don't belong to a plugin namespace.
 */
export function selectVisibleSlashCommands(
  sdkCommands: { name: string; description?: string; argumentHint?: string }[],
  context: SdkCommandContext,
): SlashCommandInfo[] {
  const skills = new Set(context.skillNames);
  const plugins = new Set(context.pluginNames);
  const seen = new Set<string>();
  const results: SlashCommandInfo[] = [];

  for (const command of sdkCommands) {
    const { name } = command;
    if (!name || /\s/.test(name) || seen.has(name)) continue;

    const description = command.description ?? '';
    const scoped = SCOPE_SUFFIX_PATTERN.test(description);
    const namespace = name.includes(':') ? name.slice(0, name.indexOf(':')) : name;
    // `plugins.has(name)` covers a skill named after its own plugin, which the
    // SDK reports un-namespaced (e.g. plugin 'frontend-design' → '/frontend-design').
    const fromPlugin = plugins.has(namespace) || plugins.has(name);
    if (!scoped && !skills.has(name) && !fromPlugin) continue;

    seen.add(name);
    const cleanDescription = description.replace(SCOPE_SUFFIX_PATTERN, '').trim();
    const argumentHint = command.argumentHint?.trim() || undefined;
    results.push(
      argumentHint
        ? { name, description: cleanDescription, argumentHint }
        : { name, description: cleanDescription },
    );
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/** Strip matching single or double quotes around a frontmatter value. */
function unquote(value: string): string {
  if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'")) && value.endsWith(value[0])) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse a command markdown file into its display metadata.
 * Frontmatter is intentionally minimal (key: value lines only) — commands are
 * authored for Claude Code, which is just as forgiving for these two keys.
 */
export function parseSlashCommandFile(name: string, content: string): SlashCommandInfo {
  let description = '';
  let argumentHint: string | undefined;
  let body = content;

  const lines = content.split('\n');
  if (lines[0]?.trim() === FRONTMATTER_DELIMITER) {
    const closeIndex = lines.findIndex((line, i) => i > 0 && line.trim() === FRONTMATTER_DELIMITER);
    if (closeIndex > 0) {
      for (const line of lines.slice(1, closeIndex)) {
        const separator = line.indexOf(':');
        if (separator === -1) continue;
        const key = line.slice(0, separator).trim();
        const value = unquote(line.slice(separator + 1).trim());
        if (key === 'description') description = value;
        if (key === 'argument-hint') argumentHint = value || undefined;
      }
      body = lines.slice(closeIndex + 1).join('\n');
    }
  }

  if (!description) {
    const firstLine = body
      .split('\n')
      .map((line) => line.replace(/^#+\s*/, '').trim())
      .find((line) => line.length > 0 && line !== FRONTMATTER_DELIMITER);
    description = firstLine ?? '';
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    description = `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }

  return argumentHint ? { name, description, argumentHint } : { name, description };
}

/**
 * `Dirent.isDirectory()` / `isFile()` report the symlink's own type, not its
 * target's — so command/skill directories symlinked in from elsewhere (e.g. a
 * shared skills repo) would otherwise be silently skipped. Resolve through the
 * symlink with `statSync`; a broken link just falls through to `false`.
 */
function resolvedType(entry: fs.Dirent, fullPath: string): { isDirectory: boolean; isFile: boolean } {
  if (!entry.isSymbolicLink()) return { isDirectory: entry.isDirectory(), isFile: entry.isFile() };
  try {
    const stat = fs.statSync(fullPath);
    return { isDirectory: stat.isDirectory(), isFile: stat.isFile() };
  } catch {
    return { isDirectory: false, isFile: false };
  }
}

function collectCommandFiles(dir: string, segments: string[], results: SlashCommandInfo[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    const { isDirectory, isFile } = resolvedType(entry, fullPath);
    if (isDirectory) {
      collectCommandFiles(fullPath, [...segments, entry.name], results);
      continue;
    }
    if (!isFile || !entry.name.endsWith('.md')) continue;
    const name = [...segments, entry.name.slice(0, -3)].join(':');
    if (/\s/.test(name)) continue; // not invocable as a slash command
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue; // unreadable file shouldn't break the whole listing
    }
    results.push(parseSlashCommandFile(name, content));
  }
}

/** One skill per directory: <skillsDir>/<name>/SKILL.md, name taken from the directory. */
function collectSkillFiles(skillsDir: string, results: SlashCommandInfo[]): void {
  const seen = new Set(results.map((command) => command.name));
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith('.') || !resolvedType(entry, path.join(skillsDir, name)).isDirectory) continue;
    if (/\s/.test(name) || seen.has(name)) continue;
    let content: string;
    try {
      content = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf8');
    } catch {
      continue; // no SKILL.md (or unreadable) — not a skill
    }
    results.push(parseSlashCommandFile(name, content));
  }
}

export function createSlashCommandService(deps: SlashCommandServiceDeps = {}) {
  const commandsDir = deps.commandsDir ?? path.join(os.homedir(), '.claude', 'commands');
  const skillsDir = deps.skillsDir ?? path.join(os.homedir(), '.claude', 'skills');

  /** Scan on every call — listings are cheap and the user edits these files outside KPM. */
  function listCommands(): ServiceResult<SlashCommandInfo[]> {
    return wrap(() => {
      const results: SlashCommandInfo[] = [];
      if (fs.existsSync(commandsDir)) {
        collectCommandFiles(commandsDir, [], results);
      }
      if (fs.existsSync(skillsDir)) {
        collectSkillFiles(skillsDir, results);
      }
      results.sort((a, b) => a.name.localeCompare(b.name));
      return results;
    });
  }

  /** Whether the text invokes a known command: leading /name, optionally followed by arguments. */
  function isCommandInvocation(text: string): boolean {
    const match = /^\/([A-Za-z0-9_:-]+)(?:\s|$)/.exec(text.trimStart());
    if (!match) return false;
    const result = listCommands();
    return result.ok && result.data.some((command) => command.name === match[1]);
  }

  return { listCommands, isCommandInvocation };
}

export type SlashCommandService = ReturnType<typeof createSlashCommandService>;
