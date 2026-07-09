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
import type { EventDefinition, EventPayload } from '../../../shared/ipc/appEvents';
import { scheduledLoopEvents } from '../../../shared/ipc/scheduledLoopEvents';
import type { PollScheduler, PollTickResult } from '../core/PollScheduler';
import type { UpdateEventBus } from '../core/UpdateEventBus';
import type { McpDiscoveryService } from '../core/McpDiscoveryService';
import { buildSdkOptions } from '../../claude/sdkOptionsBuilder';
import { runClaudeQuery, type RunClaudeQueryResult } from '../../claude/runClaudeQuery';
import { createContextBuilder } from '../../claude/contextBuilders';
import {
  runWithToolExecutionContext,
  subscribeToKpmToolProposals,
} from '../../kpmTools/runtimeRegistry';
import { resolveScopedPath, ensureParentDirectory } from '../files/scopedFs';

const LOOP_TIMEOUT_MS = 10 * 60 * 1000;
const RUN_HISTORY_LIMIT = 50;
const NO_FINDINGS = 'NO_FINDINGS';
const LOOP_MEMORY_DELIMITER = '===LOOP MEMORY===';
const MAX_MEMORY_LENGTH = 4000;
const RECENT_RUNS_WITH_MEMORY = 5;
const RECENT_RUNS_WITHOUT_MEMORY = 10;
const MEMORY_WRITEBACK_INSTRUCTION = `At the very end of your reply, after everything else, append:

${LOOP_MEMORY_DELIMITER}
<compact plain-text state of everything this loop currently knows: items already reported, the current status of each watched item, and relevant timestamps. Max ~30 lines. This fully replaces the previous memory, so carry forward anything still relevant.>`;
/** Broadcast to renderer windows after each run so loop status/history refresh. */
export const SCHEDULED_LOOP_RUN_CHANNEL = scheduledLoopEvents.run.channel;

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
  /** Fuller detail behind the summary (e.g. the notify body), for run history. */
  detail: string | null;
  error: string | null;
  artifactPath: string | null;
  /** Replacement loop memory extracted from the reply, or null if none was sent. */
  memory: string | null;
}

interface ParsedLoopReply {
  reply: string;
  memory: string | null;
}

function taskIdFor(loopId: string): string {
  return `loop:${loopId}`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'loop';
}

function joinPromptSections(sections: (string | null)[]): string {
  return sections.filter((section): section is string => Boolean(section)).join('\n\n');
}

/** Splits an agent reply on the last memory delimiter, trimming and capping the carried-forward memory. */
function parseLoopReply(rawText: string): ParsedLoopReply {
  const delimiterIndex = rawText.lastIndexOf(LOOP_MEMORY_DELIMITER);
  if (delimiterIndex === -1) return { reply: rawText.trim(), memory: null };

  return {
    reply: rawText.slice(0, delimiterIndex).trim(),
    memory: rawText.slice(delimiterIndex + LOOP_MEMORY_DELIMITER.length).trim().slice(0, MAX_MEMORY_LENGTH),
  };
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

  /** Type-checks a broadcast against the app event registry before forwarding to the generic `broadcastToWindows`. */
  function broadcast<E extends EventDefinition>(event: E, payload: EventPayload<E>): void {
    deps.broadcastToWindows(event.channel, payload);
  }

  // Shared between scheduled ticks and manual "Run now" so the two paths
  // never overlap for the same loop — maintain mode's document-update
  // subscriptions are keyed by loop id, and a concurrent run would cross-wire
  // them.
  const runningLoops = new Set<string>();

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

  function buildKnownStateBlock(loop: ScheduledLoop): string {
    const memory = loop.memory?.trim() || null;
    const runLimit = memory ? RECENT_RUNS_WITH_MEMORY : RECENT_RUNS_WITHOUT_MEMORY;
    const runLines = deps.loopRuns
      .listByLoop(loop.id, runLimit)
      .filter((run) => run.outcome !== 'error' && run.summary != null)
      .map((run) => `- ${run.started_at} [${run.outcome}] ${run.summary!.slice(0, 200)}`);

    if (!memory && runLines.length === 0) return '';

    return joinPromptSections([
      '## Already known from previous runs',
      memory,
      runLines.length > 0 ? `Recent runs:\n${runLines.join('\n')}` : null,
    ]);
  }

  function buildLoopSdkOptions(projectId: string) {
    const context = buildContext(projectId);
    if (!context) return null;
    return buildSdkOptions({
      context,
      model: 'sonnet',
      mainWindow: deps.getMainWindow(),
      // No UI is present to answer permission prompts on a background tick.
      autoApprove: true,
      ...mcpConfigs(),
    });
  }

  async function executeNotify(loop: ScheduledLoop): Promise<LoopExecutionResult> {
    const sdkOptions = buildLoopSdkOptions(loop.project_id);
    if (!sdkOptions) return { outcome: 'error', summary: null, detail: null, error: 'Project not found', artifactPath: null, memory: null };

    const knownState = buildKnownStateBlock(loop);
    const prompt = joinPromptSections([
      `You are running as a scheduled background check (read-only — do not modify anything). Investigate the following and report only what is noteworthy.`,
      loop.prompt,
      knownState || null,
      knownState
        ? 'Only report findings that are genuinely NEW relative to what is already known above. Do not re-report items listed there, even to note they are unchanged.'
        : null,
      `If there is nothing new or noteworthy to report, reply with exactly \`${NO_FINDINGS}: <one-line reason why not>\`. Otherwise reply with a short alert: a one-line title, then 1–3 sentences of detail.`,
      MEMORY_WRITEBACK_INSTRUCTION,
    ]);

    const result = await runClaudeQuery({ prompt, sdkOptions, timeoutMs: LOOP_TIMEOUT_MS });
    const { reply: text, memory } = parseLoopReply(result.text);
    if (!text || text.toUpperCase().startsWith(NO_FINDINGS)) {
      const reason = text.slice(NO_FINDINGS.length).replace(/^[:\s]+/, '').trim();
      return { outcome: 'no_op', summary: reason || 'Nothing to report', detail: null, error: null, artifactPath: null, memory };
    }

    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const title = lines[0] ?? loop.name;
    const body = lines.slice(1).join('\n') || undefined;
    emitFinding(loop, title, body);
    return { outcome: 'ok', summary: title, detail: body ?? null, error: null, artifactPath: null, memory };
  }

  async function executeReport(loop: ScheduledLoop): Promise<LoopExecutionResult> {
    const project = deps.projects.get(loop.project_id);
    if (!project) return { outcome: 'error', summary: null, detail: null, error: 'Project not found', artifactPath: null, memory: null };

    const sdkOptions = buildLoopSdkOptions(loop.project_id);
    if (!sdkOptions) return { outcome: 'error', summary: null, detail: null, error: 'Project not found', artifactPath: null, memory: null };

    const knownState = buildKnownStateBlock(loop);
    const prompt = joinPromptSections([
      `You are running as a scheduled background report (read-only — do not modify anything). Produce a clear, well-structured Markdown report for the following.`,
      loop.prompt,
      knownState || null,
      knownState ? 'Where relevant, highlight what has changed since previous runs.' : null,
      `Output only the report as Markdown.`,
      MEMORY_WRITEBACK_INSTRUCTION,
    ]);

    const result = await runClaudeQuery({ prompt, sdkOptions, timeoutMs: LOOP_TIMEOUT_MS });
    const { reply: content, memory } = parseLoopReply(result.text);
    if (!content) {
      return { outcome: 'no_op', summary: 'No report content generated', detail: null, error: null, artifactPath: null, memory };
    }

    const outputsDir = path.join(project.folder_path, 'outputs', 'loops');
    fs.mkdirSync(outputsDir, { recursive: true });
    const fullPath = path.join(outputsDir, `${slugify(loop.name)}.md`);
    const header = `# ${loop.name}\n\n_Updated ${new Date().toLocaleString()}_\n\n`;
    fs.writeFileSync(fullPath, header + content, 'utf-8');
    const relativePath = path.relative(project.folder_path, fullPath);

    emitFinding(loop, `Report updated: ${loop.name}`, undefined, relativePath);
    return { outcome: 'ok', summary: `Wrote ${relativePath}`, detail: null, error: null, artifactPath: relativePath, memory };
  }

  async function executeMaintain(loop: ScheduledLoop): Promise<LoopExecutionResult> {
    const project = deps.projects.get(loop.project_id);
    if (!project) return { outcome: 'error', summary: null, detail: null, error: 'Project not found', artifactPath: null, memory: null };

    const sdkOptions = buildLoopSdkOptions(loop.project_id);
    if (!sdkOptions) return { outcome: 'error', summary: null, detail: null, error: 'Project not found', artifactPath: null, memory: null };

    // Synthetic session key so the singleton tool emitters scope this run's
    // proposals to us (and not to any open chat session).
    const sessionKey = taskIdFor(loop.id);
    // Last write wins per file — sequential edits to one file accumulate the
    // full content in the latest proposal payload.
    const fileWrites = new Map<string, string>();

    const unsubscribeProposals = subscribeToKpmToolProposals((proposal) => {
      if (proposal.chatSessionId !== sessionKey) return;
      if (proposal.type === 'document-update') fileWrites.set(proposal.filePath, proposal.content);
      if (proposal.type === 'project-context-update') fileWrites.set(proposal.filename, proposal.newContent);
    });

    const knownState = buildKnownStateBlock(loop);
    const prompt = joinPromptSections([
      `You are running as a scheduled maintenance loop for this project. Investigate the following and make the necessary updates to the project's documents and context file using the document tools (propose_document_create / propose_document_edit / the context-file tool).`,
      loop.prompt,
      knownState || null,
      `Make only the changes that are warranted. When done, briefly summarize what you changed.`,
      MEMORY_WRITEBACK_INSTRUCTION,
    ]);

    let result: RunClaudeQueryResult;
    try {
      result = await runWithToolExecutionContext(
        { projectId: loop.project_id, chatSessionId: sessionKey },
        () => runClaudeQuery({ prompt, sdkOptions, timeoutMs: LOOP_TIMEOUT_MS })
      );
    } finally {
      unsubscribeProposals();
    }

    const { memory } = parseLoopReply(result.text);

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
      return { outcome: 'no_op', summary: 'No updates were needed', detail: null, error: null, artifactPath: null, memory };
    }
    const summary = `Updated ${applied} file${applied === 1 ? '' : 's'}`;
    const fileList = Array.from(fileWrites.keys()).join(', ');
    emitFinding(loop, `${loop.name}: ${summary}`, fileList);
    return { outcome: 'ok', summary, detail: fileList, error: null, artifactPath: null, memory };
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
    if (runningLoops.has(loopId)) return { outcome: 'noop', message: 'already running' };

    runningLoops.add(loopId);
    try {
      const startedAt = new Date().toISOString();
      log(`Running loop "${loop.name}" (${loop.output_mode})`);

      let result: LoopExecutionResult;
      try {
        result = await execute(loop);
      } catch (e) {
        result = {
          outcome: 'error',
          summary: null,
          detail: null,
          error: e instanceof Error ? e.message : String(e),
          artifactPath: null,
          memory: null,
        };
      }

      deps.loopRuns.create({
        loop_id: loopId,
        outcome: result.outcome,
        summary: result.summary,
        detail: result.detail,
        error: result.error,
        artifact_path: result.artifactPath,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      });
      deps.loopRuns.pruneOld(loopId, RUN_HISTORY_LIMIT);
      deps.scheduledLoops.recordRunOutcome(loopId, result.outcome, result.error, startedAt);
      if (result.outcome !== 'error' && result.memory !== null) {
        deps.scheduledLoops.updateMemory(loopId, result.memory);
      }
      broadcast(scheduledLoopEvents.run, {
        projectId: loop.project_id,
        loopId,
        outcome: result.outcome,
      });

      const pollOutcome = result.outcome === 'error' ? 'error' : result.outcome === 'no_op' ? 'noop' : 'ok';
      return { outcome: pollOutcome, message: result.summary ?? result.error ?? undefined };
    } finally {
      runningLoops.delete(loopId);
    }
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

  function runNow(loopId: string): Promise<void> {
    // Runs directly so it works even when the loop is disabled (not registered).
    // Fire-and-forget: the underlying query can run for minutes (LOOP_TIMEOUT_MS),
    // so callers don't wait on it. The result reaches the renderer via the
    // SCHEDULED_LOOP_RUN_CHANNEL broadcast at the end of runTick.
    void runTick(loopId).catch((e) => {
      log(`Manual run of ${loopId} failed to start: ${e instanceof Error ? e.message : String(e)}`);
    });
    return Promise.resolve();
  }

  function start(): void {
    const enabled = deps.scheduledLoops.getAllEnabled();
    log(`Reconciling ${enabled.length} enabled loop(s) on startup`);
    for (const loop of enabled) syncLoop(loop);
  }

  return { syncLoop, removeLoop, runNow, start };
}

export type ScheduledLoopRunnerService = ReturnType<typeof createScheduledLoopRunnerService>;
