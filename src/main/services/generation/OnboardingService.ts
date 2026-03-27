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
): string {
  const sections: string[] = [];

  sections.push(`## Project: ${projectName}`);
  if (description) {
    sections.push(`## User Description\n${description}`);
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

        const repos = deps.getReposByProject(options.projectId);
        const scanResults: RepoScanResult[] = [];

        for (const repo of repos) {
          const scopedDirs = options.repoDirectories[repo.path] ?? [];
          const result = await scanRepo(repo.path, scopedDirs, callbacks);
          scanResults.push(result);
        }

        if (scanResults.length === 0) {
          callbacks.onError('No repositories found for this project');
          return;
        }

        callbacks.onProgress('Scan complete. Generating project context...');

        // Phase 2: Claude Sonnet synthesis
        const userPrompt = buildPrompt(
          options.projectName,
          options.description ?? '',
          scanResults,
        );

        const sdkOptions: SDKOptions = {
          systemPrompt: SYSTEM_PROMPT,
        };


        });


        callbacks.onProgress('Context generated successfully');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[OnboardingService] Error:', msg);
        callbacks.onError(`Context generation failed: ${msg}`);
      }
    },

    saveContext(projectId: string, content: string): { success: boolean; error?: string } {
      try {
        const folderPath = deps.getProjectFolder(projectId);
        if (!folderPath) {
          return { success: false, error: 'Project folder not found' };
        }

        return { success: true };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: msg };
      }
    },
  };
}

export type OnboardingService = ReturnType<typeof createOnboardingService>;
