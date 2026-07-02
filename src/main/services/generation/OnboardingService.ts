/**
 * Onboarding Service
 *
 * Scans connected repositories at user-specified directories and uses
 * Claude Sonnet to generate a rich AGENTS.md project context file.
 *
 * Two-phase pipeline:
 *   Phase 1: Scan repos (git metadata, directory structure, manifests, READMEs)
 *   Phase 2: Claude Sonnet synthesis → AGENTS.md content
 */

import type { query, Options as SDKOptions } from '@anthropic-ai/claude-agent-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { gitExec } from '../repo/gitUtils';
import { getConfig } from '../../config';
import { writeProjectContextFilesSync } from '../../project-context/contextFileCompat';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';
import { runClaudeQuery, type ClaudeQueryUsage } from '../../claude/runClaudeQuery';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingScanOptions {
  projectId: string;
  projectName: string;
  projectPath: string;
  description?: string;
  repoDirectories: Record<string, string[]>; // repoPath → scoped dirs
  /** Existing project context content (for regeneration, not initial creation) */
  existingContext?: string | null;
}

export interface OnboardingCallbacks {
  onProgress: (message: string) => void;
  onThinking: (text: string) => void;
  onComplete: (content: string) => void;
  onError: (error: string) => void;
}

interface RepoScanResult {
  repoPath: string;
  repoName: string;
  remotes: string;
  recentCommits: string;
  branches: string;
  manifests: Record<string, string>;
  readmeContent: string | null;
  existingClaudeMd: string | null;
  /** Directory-only map of the repo root, so the agent knows where to investigate. */
  repoTree: string;
  scopedDirectories: ScopedDirectoryScan[];
}

interface ScopedDirectoryScan {
  directory: string;
  fileTree: string;
  keyFiles: { path: string; snippet: string }[];
}

// =============================================================================
// Dependencies
// =============================================================================

export interface OnboardingServiceDeps {
  getReposByProject: (projectId: string) => { id: string; path: string }[];
  getProjectFolder: (projectId: string) => string | null;
  queryFn?: typeof query;
  getTimeoutMs?: () => number;
  /** Optional centralized usage recorder. */
  recordUsage?: (event: {
    projectId: string;
    source: 'onboarding';
    model: string;
    usage: ClaudeQueryUsage;
    totalCostUsd?: number | null;
  }) => void;
}

// =============================================================================
// Helpers
// =============================================================================

/** Source file extensions we read snippets from when scanning scoped directories. */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb']);

function readFileSafe(filePath: string, maxChars = 2000): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.length > maxChars ? content.slice(0, maxChars) + '\n... (truncated)' : content;
  } catch {
    return null;
  }
}

function getDirectoryTree(
  dirPath: string,
  maxDepth: number,
  currentDepth = 0,
  dirsOnly = false,
  maxEntriesPerLevel = 30,
): string {
  const SKIP = new Set([
    'node_modules', '.git', '__pycache__', 'dist', 'build', '.next',
    '.venv', 'venv', '.tox', '.mypy_cache', 'target', '.gradle',
    'coverage', '.turbo', '.cache',
  ]);

  const lines: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return '';
  }

  const filtered = entries
    .filter(e => !SKIP.has(e.name) && !e.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, maxEntriesPerLevel); // Cap entries per level

  const indent = '  '.repeat(currentDepth);
  for (const entry of filtered) {
    if (entry.isDirectory()) {
      lines.push(`${indent}${entry.name}/`);
      if (currentDepth < maxDepth) {
        lines.push(getDirectoryTree(path.join(dirPath, entry.name), maxDepth, currentDepth + 1, dirsOnly, maxEntriesPerLevel));
      }
    } else if (!dirsOnly) {
      lines.push(`${indent}${entry.name}`);
    }
  }

  return lines.filter(Boolean).join('\n');
}

async function scanRepo(
  repoPath: string,
  scopedDirs: string[],
  callbacks: OnboardingCallbacks,
): Promise<RepoScanResult> {
  const repoName = path.basename(repoPath);
  callbacks.onProgress(`Scanning ${repoName}/...`);

  // Git metadata (parallel, fire-and-forget errors)
  const [remotes, recentCommits, branches] = await Promise.all([
    gitExec(['remote', '-v'], { cwd: repoPath }).then(r => r.stdout.trim()).catch(() => ''),
    gitExec(['log', '--oneline', '-20'], { cwd: repoPath }).then(r => r.stdout.trim()).catch(() => ''),
    gitExec(['branch', '-a'], { cwd: repoPath }).then(r => r.stdout.trim()).catch(() => ''),
  ]);

  // Manifests
  const manifestFiles = ['package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'requirements.txt'];
  const manifests: Record<string, string> = {};
  for (const mf of manifestFiles) {
    const content = readFileSafe(path.join(repoPath, mf), 1500);
    if (content) manifests[mf] = content;
  }

  // README and existing context files
  const readmeContent = readFileSafe(path.join(repoPath, 'README.md'));
  const existingClaudeMd =
    readFileSafe(path.join(repoPath, 'AGENTS.md')) ??
    readFileSafe(path.join(repoPath, 'CLAUDE.md'));

  // Directory-only map of the repo root (top two levels, wider per-level cap so a
  // monorepo's full top level is captured). This is the agent's starting map: it
  // decides which areas the description points at, then uses Grep/Glob/Read to
  // investigate them. Cheap, and present even when no scoped dirs were provided.
  const repoTree = getDirectoryTree(repoPath, 2, 0, true, 60);

  // Scoped directory scans
  const scopedDirectories: ScopedDirectoryScan[] = [];
  for (const dir of scopedDirs) {
    const fullDir = path.join(repoPath, dir);
    if (!fs.existsSync(fullDir)) continue;

    callbacks.onProgress(`  Reading ${repoName}/${dir}`);

    const fileTree = getDirectoryTree(fullDir, 2);

    // Read a few key files for context (up to 5 source files, first 200 lines each)
    const keyFiles: { path: string; snippet: string }[] = [];
    try {
      const allFiles = fs.readdirSync(fullDir, { withFileTypes: true });
      const sourceFiles = allFiles
        .filter(f => f.isFile() && SOURCE_EXTENSIONS.has(path.extname(f.name)))
        .slice(0, 5);

      for (const sf of sourceFiles) {
        const content = readFileSafe(path.join(fullDir, sf.name), 3000);
        if (content) {
          keyFiles.push({ path: `${dir}${sf.name}`, snippet: content });
        }
      }
    } catch {
      // Skip if we can't read
    }

    scopedDirectories.push({ directory: dir, fileTree, keyFiles });
  }

  return {
    repoPath,
    repoName,
    remotes,
    recentCommits,
    branches,
    manifests,
    readmeContent,
    existingClaudeMd,
    repoTree,
    scopedDirectories,
  };
}

function buildPrompt(
  projectName: string,
  description: string,
  scanResults: RepoScanResult[],
  existingContext?: string | null,
): string {
  const sections: string[] = [];

  sections.push(`## Project: ${projectName}`);
  if (description) {
    sections.push(`## User Description\n${description}`);
  }
  if (existingContext) {
    sections.push(`## Previous Project Context (reference only)\nThe following is the existing context document. It is provided so you can understand what the user previously found important. Generate the most accurate document possible from the current repository state -- do not copy stale information from this document. If the user added custom sections or notes that are not derivable from repo data, include them only if they still appear relevant.\n\n${existingContext}`);
  }

  for (const repo of scanResults) {
    sections.push(`\n## Repository: ${repo.repoName}\nPath: ${repo.repoPath}`);

    if (repo.remotes) {
      sections.push(`### Git Remotes\n\`\`\`\n${repo.remotes}\n\`\`\``);
    }
    if (repo.recentCommits) {
      sections.push(`### Recent Commits\n\`\`\`\n${repo.recentCommits}\n\`\`\``);
    }

    for (const [name, content] of Object.entries(repo.manifests)) {
      sections.push(`### ${name}\n\`\`\`\n${content}\n\`\`\``);
    }

    if (repo.readmeContent) {
      sections.push(`### README.md\n${repo.readmeContent}`);
    }
    if (repo.existingClaudeMd) {
      sections.push(`### Existing AGENTS.md / CLAUDE.md\n${repo.existingClaudeMd}`);
    }

    if (repo.repoTree) {
      sections.push(
        `### Repository Structure (top levels, directories only)\n\`\`\`\n${repo.repoTree}\n\`\`\`\n` +
        `Use this as your starting map: pick the directories the user description points at, then Grep/Glob/Read inside them to find the specific files and sections. This is truncated -- Glob for deeper or wider structure when a relevant area is not shown.`,
      );
    }

    for (const scoped of repo.scopedDirectories) {
      sections.push(`### Scoped Directory: ${repo.repoName}/${scoped.directory}\n\`\`\`\n${scoped.fileTree}\n\`\`\``);
      for (const kf of scoped.keyFiles) {
        sections.push(`#### ${kf.path}\n\`\`\`\n${kf.snippet}\n\`\`\``);
      }
    }
  }

  return sections.join('\n\n');
}

function sanitizeGeneratedContext(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return trimmed;

  const firstHeadingMatch = /^\s*#\s+.+$/m.exec(trimmed);
  if (firstHeadingMatch && typeof firstHeadingMatch.index === 'number' && firstHeadingMatch.index > 0) {
    return trimmed.slice(firstHeadingMatch.index).trim();
  }

  return trimmed;
}

const SYSTEM_PROMPT = `You generate or update a project context file (AGENTS.md) for KPM.

This file orients a future coding agent or developer joining an ongoing project. Its only useful content is what a single-repo agentic search cannot cheaply discover on its own -- cross-repo relationships, verified commands, and non-obvious constraints. Everything else the agent will re-derive by reading the code, so writing it down here just adds context that goes stale. This file may be read by tools outside KPM too, so keep it tool-agnostic: exclude KPM-only operational rules unless they are also a real constraint for external tools.

You will receive pre-scanned repository data (git metadata, a directory-structure map of each repo, manifests, READMEs, and any user-scoped directories) in the user message. The connected repositories are available to your Read, Grep, and Glob tools. Do NOT write any files -- the application handles saving; just return the content as your text response.

## Investigation

Treat the user's description as your investigation brief. Do not synthesize only from the pre-scanned data -- actively locate the code that matters:

- Use the description to decide which areas are relevant, then read the directory-structure map to choose concrete starting directories. The description states intent in plain language; you map that intent to real paths in the repos. The literal words of the description need not appear in a path.
- Run targeted Grep/Glob inside those directories to confirm relevance and find the specific files and sections involved (for example, for a dependency upgrade, grep the manifests and the deprecated APIs). Prefer narrow, targeted searches over broad repo-wide ones.
- Verify build/test/lint/run commands against actual manifests, lockfiles, Makefiles, or CI config -- never guess from convention or repo type.
- Read the files you find to verify before relying on them; drop candidates that turn out to be unrelated.
- The directory map is truncated and shallow. When a relevant area is not shown (a wide or deeply nested monorepo folder), Glob for it rather than assuming it does not exist.
- If no scoped directories were provided, this investigation is how you determine the relevant areas -- the directory map, manifests, and recent commits are your starting points.
- Keep the investigation focused and bounded: read enough to write an accurate, specific document, not everything.

## Anti-Goal: Do Not Restate What Search Can Find

Every line must earn its place by being non-discoverable, or expensive to rediscover, for an agent starting fresh in these repos. Do NOT include:
- Architecture narration, directory layouts, file inventories, or lists of components/hooks/helpers -- an agent finds these in seconds with Glob.
- A description of what the code "does" when that is visible from reading it.
- Anything you are not confident is still true -- omit rather than guess.

The cross-repo relationship map is the one exception and the highest-value content in this file: a search scoped to a single repo cannot see how it relates to its siblings.

## Regeneration Context

If an existing context document is provided, it is for REFERENCE ONLY:
- Always generate from the current repository state -- prioritize accuracy over preserving old content
- Use the existing document to understand what the user cared about (which sections, what emphasis)
- Do not copy information from the old document unless it is confirmed by current repo data
- Custom sections or notes the user added (not derivable from code) may be included if still relevant

## Writing Quality

- Keep the document concise and focused -- under 80 lines. Shorter is better.
- Write a durable orientation document, not a changelog or repository walkthrough.
- Be specific: "React 18 with TypeScript and Vite" not "modern web framework."
- Prefer repo-relative file paths over inline code snippets.
- Put executable commands early with full flags.
- Do NOT include style guidelines, linting rules, or general architecture explanations available by reading the code.

## Required Sections

1. **Overview** -- one or two sentences: what this project is and why it exists. If the user provided a description, incorporate it.

2. **Connected Repos & How They Relate** -- name each connected repo with a one-line purpose, then the cross-repo map: which repo depends on, calls, or publishes to which, and any deploy or build-order constraints between them. This is the content a single-repo agentic search cannot discover, so it carries the most weight in this file. For a single-repo project, collapse this to the repo's purpose in a couple of lines.

3. **Commands** -- build/test/lint/run commands per repo, with full flags, verified against manifests, lockfiles, or Makefiles.

4. **Boundaries & Conventions** -- what must not be touched, non-obvious gotchas that would cost an agent real turns to discover the hard way (multi-repo deploy ordering, environment setup quirks, shared state between services), and naming/structure rules actually enforced in the code -- not aspirational ones.

5. **Documentation Pointers** -- file paths to authoritative docs (README, docs/, wikis, ADRs) in each repo, so the assistant can read them when needed.

## Output Rules

- The first line must be a markdown H1 title for the project or feature.
- Return ONLY the markdown content. No preamble, no wrapping code fences.
- Do not mention the scanning process, repository scan results, or whether the provided input was sufficient.
- Do not introduce the document with phrases like "here is the context file" or "based on the scanned repository data."
- Do NOT use Write, Edit, or Bash tools. Do NOT write files.
- No emojis. Plain markdown only: headers, bold, lists, tables, code blocks.
- Use repo basenames (not full paths) when referencing repos.
- Omit sections where you lack confident data rather than guessing.`;

// =============================================================================
// Service Factory
// =============================================================================

export function createOnboardingService(deps: OnboardingServiceDeps) {
  return {
    async scanAndGenerate(
      options: OnboardingScanOptions,
      callbacks: OnboardingCallbacks,
    ): Promise<void> {
      try {
        // Phase 1: Scan repos
        callbacks.onProgress('Starting repository scan...');
        console.log('[OnboardingService] Starting scan for project:', options.projectId);

        const repos = deps.getReposByProject(options.projectId);
        console.log('[OnboardingService] Found repos:', repos.length, repos.map(r => r.path));

        const scanResults: RepoScanResult[] = [];

        for (const repo of repos) {
          const scopedDirs = options.repoDirectories[repo.path] ?? [];
          console.log('[OnboardingService] Scanning repo:', repo.path, 'scopedDirs:', scopedDirs);
          const result = await scanRepo(repo.path, scopedDirs, callbacks);
          scanResults.push(result);
        }

        if (scanResults.length === 0) {
          console.error('[OnboardingService] No repos found for project');
          callbacks.onError('No repositories found for this project');
          return;
        }

        callbacks.onProgress('Scan complete. Generating project context...');

        // Phase 2: Claude Sonnet synthesis
        const userPrompt = buildPrompt(
          options.projectName,
          options.description ?? '',
          scanResults,
          options.existingContext,
        );

        console.log('[OnboardingService] Built prompt, length:', userPrompt.length);

        const sdkOptions: SDKOptions = {
          model: getConfig().generation.deepModel,
          // Adaptive thinking with summarized display: OnboardingService streams thinking to UI.
          // Opus 4.8 / Sonnet 5 default to 'omitted', which would surface as empty strings.
          thinking: { type: 'adaptive' as const, display: 'summarized' as const },
          systemPrompt: SYSTEM_PROMPT,
          cwd: options.projectPath,
          additionalDirectories: scanResults.map(result => result.repoPath),
          persistSession: false, // Ephemeral one-shot query, no need to persist
          // Room to actually investigate (read the map, Grep/Glob/Read across repos)
          // before writing. The onboardingTimeoutMs is the hard cap.
          maxTurns: 20,
          canUseTool: (toolName, input) => Promise.resolve(
            toolName === 'Write' || toolName === 'Edit' || toolName === 'Bash'
              ? {
                  behavior: 'deny' as const,
                  message: 'Onboarding context generation is read-only. Use Read, Grep, or Glob if more repository context is needed.',
                }
              : { behavior: 'allow' as const, updatedInput: input }
          ),
          ...getClaudeSdkSpawnOptions(),
        };

        console.log('[OnboardingService] Calling Claude Agent SDK query()...');

        const timeoutMs = deps.getTimeoutMs?.() ?? getConfig().generation.onboardingTimeoutMs;
        const sdkModel = getConfig().generation.deepModel;

        const queryResult = await runClaudeQuery({
          prompt: userPrompt,
          sdkOptions,
          timeoutMs,
          timeoutMessage: 'Context generation timed out',
          queryFn: deps.queryFn,
          onThinking: callbacks.onThinking,
          recordUsage: deps.recordUsage
            ? ({ usage, totalCostUsd }) => {
                deps.recordUsage!({
                  projectId: options.projectId,
                  source: 'onboarding',
                  model: sdkModel,
                  usage,
                  totalCostUsd,
                });
              }
            : undefined,
        });

        const generatedContent = queryResult.text;

        callbacks.onProgress('Context generated successfully');
        callbacks.onComplete(sanitizeGeneratedContext(generatedContent));
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[OnboardingService] Error:', msg);
        if (error instanceof Error && error.stack) {
          console.error('[OnboardingService] Stack:', error.stack);
        }
        callbacks.onError(`Context generation failed: ${msg}`);
      }
    },

    saveContext(projectId: string, content: string): { success: boolean; error?: string } {
      try {
        const folderPath = deps.getProjectFolder(projectId);
        if (!folderPath) {
          return { success: false, error: 'Project folder not found' };
        }

        writeProjectContextFilesSync(fs, folderPath, content);
        return { success: true };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: msg };
      }
    },
  };
}

export type OnboardingService = ReturnType<typeof createOnboardingService>;
