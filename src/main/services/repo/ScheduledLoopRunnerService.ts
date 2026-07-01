/**
 * ScheduledLoopRunnerService
 *
 * Drives scheduled loops on the shared PollScheduler. Each enabled loop gets
 * one scheduler task (`loop:<id>`); on every tick the loop's freeform prompt
 * runs as a single grounded agent turn (KPM MCP tools + the user's external
 * MCP servers), and the result is delivered according to the loop's output
 * mode:
 *
 *   - notify:   read-only; a finding becomes a notification (silent if none)
 *   - report:   read-only; the result is written to outputs/loops/<name>.md
 *   - maintain: the agent's document/context edits are auto-applied
 *
 * Runs only while the app is open. Registration is reconciled on boot via
 * start(); the scheduler is torn down by AppLifecycleService.stopAll().
 */

import type { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { ScheduledLoop, LoopRunOutcome } from '../../../shared/types';
import type {
  IScheduledLoopRepository,
  ILoopRunRepository,
  IProjectRepository,
  IRepoRepository,
  IAttachmentRepository,
  IPlanItemRepository,
  ITaskPromptTemplateRepository,
} from '../../db/interfaces';
import type { PollScheduler, PollTickResult } from '../core/PollScheduler';
import type { UpdateEventBus } from '../core/UpdateEventBus';
import type { McpDiscoveryService } from '../core/McpDiscoveryService';
import { buildSdkOptions } from '../../claude/sdkOptionsBuilder';
import { runClaudeQuery } from '../../claude/runClaudeQuery';
import { createContextBuilder } from '../../claude/contextBuilders';
import {
  runWithToolExecutionContext,
  subscribeToDocumentUpdate,
  subscribeToClaudeMdUpdate,
} from '../../claude/tools/createKpmServer';
import type { DocumentUpdatePayload } from '../../claude/tools/document-update';
import type { ClaudeMdUpdatePayload } from '../../claude/tools/claudemd-update';
import { resolveScopedPath, ensureParentDirectory } from '../files/scopedFs';

const RUN_HISTORY_LIMIT = 50;
const NO_FINDINGS = 'NO_FINDINGS';
/** Broadcast to renderer windows after each run so loop status/history refresh. */
export const SCHEDULED_LOOP_RUN_CHANNEL = 'scheduled-loop:run';

export interface ScheduledLoopRunnerDeps {
  scheduledLoops: IScheduledLoopRepository;
  loopRuns: ILoopRunRepository;
  // Repos needed to build the grounded agent context.
  projects: IProjectRepository;
  repos: IRepoRepository;
  attachments: IAttachmentRepository;
  planItems: IPlanItemRepository;
  taskPromptTemplates: ITaskPromptTemplateRepository;
  scheduler: PollScheduler;
  eventBus: UpdateEventBus;
  mcpDiscoveryService: McpDiscoveryService;
  getMainWindow: () => BrowserWindow | null;
  broadcastToWindows: (channel: string, payload: unknown) => void;
}

interface LoopExecutionResult {
  outcome: LoopRunOutcome;
  summary: string | null;
  error: string | null;
  artifactPath: string | null;
}

function taskIdFor(loopId: string): string {
  return `loop:${loopId}`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'loop';
}

export function createScheduledLoopRunnerService(deps: ScheduledLoopRunnerDeps) {
  const buildContext = createContextBuilder({
    projects: deps.projects,
    repos: deps.repos,
    attachments: deps.attachments,
    planItems: deps.planItems,
    taskPromptTemplates: deps.taskPromptTemplates,
  });

  const log = (msg: string) => console.log(`[ScheduledLoops] ${msg}`);

  /** Assemble the user's enabled MCP plugins/servers, mirroring the chat path. */
  function mcpConfigs() {
    const plugins = deps.mcpDiscoveryService.getEnabledPluginPaths();
    const userConfigs = deps.mcpDiscoveryService.getEnabledUserMcpConfigs();
    const managed = deps.mcpDiscoveryService.getCachedManagedServers();
    const disabledTools = managed.ok ? deps.mcpDiscoveryService.getDisabledMcpTools(managed.data) : null;
    const disabledNames = managed.ok ? deps.mcpDiscoveryService.getDisabledMcpServerNames(managed.data) : null;
    return {
      enabledPluginPaths: plugins.ok ? plugins.data : [],
      enabledUserMcpConfigs: userConfigs.ok ? userConfigs.data : {},
      disabledMcpTools: disabledTools?.ok ? disabledTools.data : [],
      disabledMcpServerNames: disabledNames?.ok ? disabledNames.data : [],
    };
  }

  function buildLoopSdkOptions(projectId: string) {
    const context = buildContext(projectId);
    if (!context) return null;
    return buildSdkOptions({
      context,
      model: 'sonnet',
      currentView: 'workspace',
      mainWindow: deps.getMainWindow(),
      // No UI is present to answer permission prompts on a background tick.
      autoApprove: true,
      ...mcpConfigs(),
    });
  }

  async function executeNotify(loop: ScheduledLoop): Promise<LoopExecutionResult> {
    const sdkOptions = buildLoopSdkOptions(loop.project_id);

    const prompt = `You are running as a scheduled background check (read-only — do not modify anything). Investigate the following and report only what is noteworthy.

${loop.prompt}


    const result = await runClaudeQuery({ prompt, sdkOptions, timeoutMs: LOOP_TIMEOUT_MS });
    const text = result.text.trim();
    if (!text || text.toUpperCase().startsWith(NO_FINDINGS)) {
    }

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const title = lines[0] ?? loop.name;
    const body = lines.slice(1).join('\n') || undefined;
    emitFinding(loop, title, body);
  }

  async function executeReport(loop: ScheduledLoop): Promise<LoopExecutionResult> {
    const project = deps.projects.get(loop.project_id);

    const sdkOptions = buildLoopSdkOptions(loop.project_id);

    const prompt = `You are running as a scheduled background report (read-only — do not modify anything). Produce a clear, well-structured Markdown report for the following.

${loop.prompt}

Output only the report as Markdown.`;

    const result = await runClaudeQuery({ prompt, sdkOptions, timeoutMs: LOOP_TIMEOUT_MS });
    const content = result.text.trim();
    if (!content) {
    }

    const outputsDir = path.join(project.folder_path, 'outputs', 'loops');
    fs.mkdirSync(outputsDir, { recursive: true });
    const fullPath = path.join(outputsDir, `${slugify(loop.name)}.md`);
    const header = `# ${loop.name}\n\n_Updated ${new Date().toLocaleString()}_\n\n`;
    fs.writeFileSync(fullPath, header + content, 'utf-8');
    const relativePath = path.relative(project.folder_path, fullPath);

    emitFinding(loop, `Report updated: ${loop.name}`, undefined, relativePath);
  }

  async function executeMaintain(loop: ScheduledLoop): Promise<LoopExecutionResult> {
    const project = deps.projects.get(loop.project_id);

    const sdkOptions = buildLoopSdkOptions(loop.project_id);

    // Synthetic session key so the singleton tool emitters scope this run's
    // proposals to us (and not to any open chat session).
    const sessionKey = taskIdFor(loop.id);
    // Last write wins per file — sequential edits to one file accumulate the
    // full content in the latest proposal payload.
    const fileWrites = new Map<string, string>();

    const unsubDoc = subscribeToDocumentUpdate((u: DocumentUpdatePayload) => {
      if (u.chatSessionId === sessionKey) fileWrites.set(u.filePath, u.content);
    });
    const unsubCtx = subscribeToClaudeMdUpdate((u: ClaudeMdUpdatePayload) => {
      if (u.chatSessionId === sessionKey) fileWrites.set(u.filename, u.newContent);
    });

    const prompt = `You are running as a scheduled maintenance loop for this project. Investigate the following and make the necessary updates to the project's documents and context file using the document tools (propose_document_create / propose_document_edit / the context-file tool).

${loop.prompt}

Make only the changes that are warranted. When done, briefly summarize what you changed.`;

    try {
      await runWithToolExecutionContext(
        { projectId: loop.project_id, chatSessionId: sessionKey },
        () => runClaudeQuery({ prompt, sdkOptions, timeoutMs: LOOP_TIMEOUT_MS })
      );
    } finally {
      unsubDoc();
      unsubCtx();
    }

    let applied = 0;
    for (const [relPath, content] of fileWrites) {
      const scoped = resolveScopedPath(project.folder_path, relPath);
      if (!scoped.valid) {
        log(`Skipping out-of-scope write: ${relPath}`);
        continue;
      }
      await ensureParentDirectory(scoped.fullPath);
      await fs.promises.writeFile(scoped.fullPath, content, 'utf-8');
      applied += 1;
    }

    if (applied === 0) {
    }
    const summary = `Updated ${applied} file${applied === 1 ? '' : 's'}`;
  }

  function emitFinding(loop: ScheduledLoop, title: string, body?: string, artifactPath?: string): void {
    deps.eventBus.emit({
      kind: 'loop_finding',
      source: 'loop',
      detectedAt: new Date().toISOString(),
      loopId: loop.id,
      projectId: loop.project_id,
      loopName: loop.name,
      outputMode: loop.output_mode,
      title,
      body,
      artifactPath,
    });
  }

  async function execute(loop: ScheduledLoop): Promise<LoopExecutionResult> {
    switch (loop.output_mode) {
      case 'notify':
        return executeNotify(loop);
      case 'report':
        return executeReport(loop);
      case 'maintain':
        return executeMaintain(loop);
    }
  }

  async function runTick(loopId: string): Promise<PollTickResult> {
    const loop = deps.scheduledLoops.get(loopId);
    if (!loop) return { outcome: 'noop', message: 'loop no longer exists' };
    if (!loop.enabled) return { outcome: 'noop', message: 'loop disabled' };

    try {

  }

  function syncLoop(loop: ScheduledLoop, opts?: { immediate?: boolean }): void {
    const id = taskIdFor(loop.id);
    // Unregister first so an interval/enabled change re-registers cleanly.
    deps.scheduler.unregister(id);
    if (!loop.enabled) return;
    deps.scheduler.register({
      id,
      intervalMs: loop.interval_minutes * 60 * 1000,
      handler: () => runTick(loop.id),
      runImmediately: opts?.immediate ?? false,
    });
    deps.scheduler.start(id);
  }

  function removeLoop(loopId: string): void {
    deps.scheduler.unregister(taskIdFor(loopId));
  }

    // Runs directly so it works even when the loop is disabled (not registered).
  }

  function start(): void {
    const enabled = deps.scheduledLoops.getAllEnabled();
    log(`Reconciling ${enabled.length} enabled loop(s) on startup`);
    for (const loop of enabled) syncLoop(loop);
  }

  return { syncLoop, removeLoop, runNow, start };
}

export type ScheduledLoopRunnerService = ReturnType<typeof createScheduledLoopRunnerService>;
