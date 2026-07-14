/**
 * FileSummaryService
 *
 * Maintains AI-generated summaries for project files.
 * Called fire-and-forget from FileExplorerService write paths and ProjectWatcherService.
 */

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { runGeneration } from '../../generation';
import type { IProjectFileMetadataRepository } from '../../db/interfaces/files';

const SUMMARIZABLE_EXTENSIONS = new Set(['.md', '.txt', '.mdx', '.rst', '.yaml', '.yml', '.json', '.toml']);
const MAX_CONTENT_CHARS = 16_000;
const MAX_DISK_SUMMARY_CONCURRENCY = 2;
const MAX_DISK_SUMMARY_QUEUE_SIZE = 500;

const SYSTEM_PROMPT = `You are a document indexer for a developer's project management tool. Given a project document, write exactly 1–2 sentences summarizing what it covers. Include the document type (e.g. spec, research, meeting notes, design doc, implementation plan), the main subject or feature, and any notable scope. Output only the summary sentences — no preamble, no markdown, no labels.`;

interface DiskSummaryTask {
  projectId: string;
  filePath: string;
  fullPath: string;
  key: string;
}

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
  const diskQueue: DiskSummaryTask[] = [];
  let activeDiskJobs = 0;
  let disposed = false;
  const pendingDebounce = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingAfterActive = new Map<string, DiskSummaryTask>();

  async function generateSummary(projectId: string, filePath: string, content: string): Promise<string | null> {
    const truncated = content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) : content;
    const prompt = `File: ${filePath}\n\n${truncated}`;

    try {
      const result = await runGeneration({
        purpose: 'file_summary',
        tier: 'cheap',
        systemPrompt: SYSTEM_PROMPT,
        prompt,
        maxTurns: 1,
        timeoutMs: 30_000,
        timeoutMessage: 'File summary timed out',
        projectId,
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
    if (disposed) return;

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
      const summary = await generateSummary(projectId, filePath, content);
      if (summary && !disposed) {
        repository.setSummaryForHash(projectId, filePath, hash, summary);
      }
    } finally {
      inFlight.delete(key);
    }
  }

  async function processFileFromDisk(projectId: string, filePath: string, fullPath: string): Promise<void> {
    if (disposed) return;

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
    if (disposed) return;

    while (activeDiskJobs < MAX_DISK_SUMMARY_CONCURRENCY && diskQueue.length > 0) {
      const task = diskQueue.shift()!;
      activeDiskJobs += 1;
      void processFileFromDisk(task.projectId, task.filePath, task.fullPath).finally(() => {
        queuedDiskKeys.delete(task.key);
        if (disposed) {
          activeDiskJobs -= 1;
          return;
        }
        const pendingTask = pendingAfterActive.get(task.key);
        if (pendingTask) {
          pendingAfterActive.delete(task.key);
          queuedDiskKeys.add(pendingTask.key);
          diskQueue.push(pendingTask);
        }
        activeDiskJobs -= 1;
        drainDiskQueue();
      });
    }
  }

  function hasQueueCapacityForNewKey(key: string): boolean {
    if (queuedDiskKeys.has(key) || pendingDebounce.has(key) || pendingAfterActive.has(key)) {
      return true;
    }
    return queuedDiskKeys.size + pendingDebounce.size + pendingAfterActive.size < MAX_DISK_SUMMARY_QUEUE_SIZE;
  }

  function enqueueDiskTask(task: DiskSummaryTask, options: { rerunAfterActive?: boolean } = {}): boolean {
    if (disposed || !hasQueueCapacityForNewKey(task.key)) {
      return false;
    }

    if (queuedDiskKeys.has(task.key)) {
      if (options.rerunAfterActive) {
        pendingAfterActive.set(task.key, task);
      }
      return false;
    }

    queuedDiskKeys.add(task.key);
    diskQueue.push(task);
    drainDiskQueue();
    return true;
  }

  function enqueueFileFromDisk(projectId: string, filePath: string, fullPath: string, delayMs = 0): boolean {
    if (disposed) return false;

    if (!isSummarizable(filePath)) {
      repository.deleteByPath(projectId, filePath);
      return false;
    }

    const key = diskQueueKey(projectId, filePath);
    const task = { projectId, filePath, fullPath, key };

    if (delayMs > 0) {
      if (!hasQueueCapacityForNewKey(key)) {
        return false;
      }
      const existing = pendingDebounce.get(key);
      if (existing) clearTimeout(existing);
      pendingDebounce.set(
        key,
        setTimeout(() => {
          pendingDebounce.delete(key);
          enqueueDiskTask(task, { rerunAfterActive: true });
        }, delayMs)
      );
      return true;
    }

    return enqueueDiskTask(task);
  }

  return {
    processFile,
    processFileFromDisk,
    enqueueFileFromDisk,
    getMetadataMap,
    shouldSummarizePath: isSummarizable,
    dispose(): void {
      disposed = true;
      for (const timer of pendingDebounce.values()) {
        clearTimeout(timer);
      }
      pendingDebounce.clear();
      pendingAfterActive.clear();
      queuedDiskKeys.clear();
      diskQueue.length = 0;
    },
    deleteEntry(projectId: string, filePath: string): void {
      repository.deleteByPath(projectId, filePath);
    },
    deleteFolder(projectId: string, folderPath: string): void {
      repository.deleteByPathPrefix(projectId, folderPath);
    },
  };
}

export type FileSummaryService = ReturnType<typeof createFileSummaryService>;
