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

import * as fs from 'fs';
import * as path from 'path';
import { gitExec } from '../repo/gitUtils';
import { getConfig } from '../../config';

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
}

// =============================================================================
// Helpers
// =============================================================================

function readFileSafe(filePath: string, maxChars = 2000): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.length > maxChars ? content.slice(0, maxChars) + '\n... (truncated)' : content;
  } catch {
    return null;
  }
}

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

  const indent = '  '.repeat(currentDepth);
  for (const entry of filtered) {
    if (entry.isDirectory()) {
      lines.push(`${indent}${entry.name}/`);
      if (currentDepth < maxDepth) {
      }
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


This file is for a future coding agent or developer who is joining an ongoing project. Its job is to orient them quickly and remain useful as the codebase evolves. Write for durable understanding, not for a point-in-time code inventory.


## Audience And Goal

The reader needs to:
- Understand what the project or feature is and why it exists
- See which repos are connected and how they relate to each other
- Find the stable entry points and ownership areas for further investigation
- Know the build, test, and verification workflows
- Understand important boundaries and constraints

The reader does NOT need:
- A narration of how you gathered the information
- A dump of repository scan results
- An exhaustive snapshot of current components, hooks, helpers, or other volatile implementation details


## Regeneration Context

If an existing context document is provided, it is for REFERENCE ONLY:
- Always generate from the current repository state -- prioritize accuracy over preserving old content
- Use the existing document to understand what the user cared about (which sections, what emphasis)
- Do not copy information from the old document unless it is confirmed by current repo data
- Custom sections or notes the user added (not derivable from code) may be included if still relevant

## Writing Quality

- Keep the document concise and focused -- under 150 lines. Shorter is better.
- Write a durable orientation document, not a changelog or repository walkthrough.
- Be specific: "React 18 with TypeScript and Vite" not "modern web framework."
- Prefer repo-relative file paths or directory paths over inline code snippets.
- Add line numbers only when precision materially helps and the anchor is likely to remain stable (for example: a canonical entry point, exported interface, schema, or config declaration).
- Avoid line numbers for general architecture notes, because they drift as the code changes.
- Put executable commands early with full flags.
- Focus on what an agent cannot infer from the code alone.
- Prefer stable entry points, subsystem boundaries, and ownership areas over inventories of current component or hook filenames.
- Mention individual files only when they are canonical entry points, contracts, or other high-signal anchors that are likely to remain useful as the code evolves.
- If a detail is likely to churn during normal development, summarize it at the directory, subsystem, or contract level instead.
- Do NOT include style guidelines or linting rules.

## Required Sections

1. **Project/Feature Overview** -- title, one-line description, and the purpose or goal of this project. If the user provided a description, incorporate it. If this spans multiple repos, explain why.

2. **Connected Repos** -- table with each repo's basename, inferred purpose, and tech stack with versions where detectable. This is how the assistant knows what it's working with.

   Keep this at the directory or subsystem level unless a specific file is the durable entry point.

4. **Architecture** -- how the repos relate to each other (frontend -> backend -> service, monorepo packages, shared libraries). Include data flow if detectable. This helps the assistant reason about cross-repo impact during planning.

5. **Build and Test Commands** -- exact commands with flags to build, test, lint, and type-check each repo. These should be useful to an agent or developer who needs to understand, validate, or change the code.

6. **Boundaries** -- project constraints that matter to any agent or developer working in these repos:
  - Never commit secrets
  - Protected or generated areas that should not be edited casually
  - Repo-specific constraints (e.g. deploy freezes, required review flows, protected branches)

7. **Documentation Pointers** -- point to docs/ directories, READMEs, wikis, or ADRs found in the repos. Use file paths so the assistant can read them when needed.

## Optional Sections (include only when relevant)

- **Gotchas** -- non-obvious constraints: multi-repo deploy ordering, environment setup quirks, shared state between services
- **Key Dependencies** -- critical external services, APIs, or infrastructure the project depends on (only if detectable from config/manifests)

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
          thinking: { type: 'adaptive' as const, display: 'summarized' as const },
          systemPrompt: SYSTEM_PROMPT,
          cwd: options.projectPath,
          additionalDirectories: scanResults.map(result => result.repoPath),
          persistSession: false, // Ephemeral one-shot query, no need to persist
          canUseTool: (toolName, input) => Promise.resolve(
            toolName === 'Write' || toolName === 'Edit' || toolName === 'Bash'
              ? {
                  behavior: 'deny' as const,
                  message: 'Onboarding context generation is read-only. Use Read, Grep, or Glob if more repository context is needed.',
                }
              : { behavior: 'allow' as const, updatedInput: input }
          ),
        };

        console.log('[OnboardingService] Calling Claude Agent SDK query()...');

              }
        });


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
