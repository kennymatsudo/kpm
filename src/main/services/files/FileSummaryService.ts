/**
 * FileSummaryService
 *
 * Maintains AI-generated summaries for project files.
 * Called fire-and-forget from FileExplorerService write paths and ProjectWatcherService.
 */

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ClaudeQueryUsage } from '../../claude/runClaudeQuery';
import { runClaudeQuery } from '../../claude/runClaudeQuery';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';
import type { IProjectFileMetadataRepository } from '../../db/interfaces/files';

const SUMMARIZABLE_EXTENSIONS = new Set(['.md', '.txt', '.mdx', '.rst', '.yaml', '.yml', '.json', '.toml']);
const MAX_CONTENT_CHARS = 16_000;
const MAX_DISK_SUMMARY_CONCURRENCY = 2;

const SYSTEM_PROMPT = `You are a document indexer for a developer's project management tool. Given a project document, write exactly 1–2 sentences summarizing what it covers. Include the document type (e.g. spec, research, meeting notes, design doc, implementation plan), the main subject or feature, and any notable scope. Output only the summary sentences — no preamble, no markdown, no labels.`;

export interface FileSummaryServiceDeps {
  repository: IProjectFileMetadataRepository;
}

function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function isSummarizable(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUMMARIZABLE_EXTENSIONS.has(ext);
}

export function createFileSummaryService(deps: FileSummaryServiceDeps) {
  const { repository } = deps;
  const inFlight = new Set<string>();
  const queuedDiskKeys = new Set<string>();
  let activeDiskJobs = 0;

    const truncated = content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) : content;
    const prompt = `File: ${filePath}\n\n${truncated}`;

    try {
      const result = await runClaudeQuery({
        prompt,
        sdkOptions: {
          model: 'haiku',
          systemPrompt: SYSTEM_PROMPT,
          tools: [],
          persistSession: false,
          maxTurns: 1,
          ...getClaudeSdkSpawnOptions(),
        },
        timeoutMs: 30_000,
        timeoutMessage: 'File summary timed out',
        recordUsage: deps.recordUsage
          : undefined,
      });

      return result.text.trim() || null;
    } catch (err) {
      console.error('[FileSummaryService] Summary generation failed:', err);
      return null;
    }
  }

  function getMetadataMap(projectId: string): Map<string, string> {
    const rows = repository.getAllForProject(projectId);
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.summary) {
        map.set(row.path, row.summary);
      }
    }
    return map;
  }

  function inFlightKey(projectId: string, filePath: string, hash: string): string {
    return `${projectId}\0${filePath}\0${hash}`;
  }

  function diskQueueKey(projectId: string, filePath: string): string {
    return `${projectId}\0${filePath}`;
  }

  async function processFile(projectId: string, filePath: string, content: string): Promise<void> {
    if (!content.trim() || !isSummarizable(filePath)) {
      // Empty or non-summarizable writes evict prior metadata so stale summaries cannot leak into listings.
      repository.deleteByPath(projectId, filePath);
      return;
    }

    const hash = computeHash(content);
    const existing = repository.getByPath(projectId, filePath);

    if (existing?.content_hash === hash && existing.summary) {
      return;
    }

    if (existing?.content_hash !== hash) {
      repository.upsertHash(projectId, filePath, hash);
    }

    const key = inFlightKey(projectId, filePath, hash);
    if (inFlight.has(key)) {
      return;
    }

    inFlight.add(key);
    try {
        repository.setSummaryForHash(projectId, filePath, hash, summary);
      }
    } finally {
      inFlight.delete(key);
    }
  }

  async function processFileFromDisk(projectId: string, filePath: string, fullPath: string): Promise<void> {
    if (!isSummarizable(filePath)) {
      repository.deleteByPath(projectId, filePath);
      return;
    }

    try {
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      await processFile(projectId, filePath, content);
    } catch (err) {
      // File watcher/listing callers can race with deletes or moves.
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return;
      }
      console.debug('[FileSummaryService] Failed to read file for summary:', {
        projectId,
        filePath,
        fullPath,
        err,
      });
    }
  }

  function drainDiskQueue(): void {
    while (activeDiskJobs < MAX_DISK_SUMMARY_CONCURRENCY && diskQueue.length > 0) {
      const task = diskQueue.shift()!;
      activeDiskJobs += 1;
      void processFileFromDisk(task.projectId, task.filePath, task.fullPath).finally(() => {
        queuedDiskKeys.delete(task.key);
        activeDiskJobs -= 1;
        drainDiskQueue();
      });
    }
  }

    if (!isSummarizable(filePath)) {
      repository.deleteByPath(projectId, filePath);
      return false;
    }

    const key = diskQueueKey(projectId, filePath);
  }

  return {
    processFile,
    processFileFromDisk,
    enqueueFileFromDisk,
    getMetadataMap,
    shouldSummarizePath: isSummarizable,
    deleteEntry(projectId: string, filePath: string): void {
      repository.deleteByPath(projectId, filePath);
    },
    deleteFolder(projectId: string, folderPath: string): void {
      repository.deleteByPathPrefix(projectId, folderPath);
    },
  };
}

export type FileSummaryService = ReturnType<typeof createFileSummaryService>;
