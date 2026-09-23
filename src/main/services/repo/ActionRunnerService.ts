/**
 * ActionRunnerService
 *
 * Executes actions — saved prompts that either run on a trigger or when invoked.
 * Interval-triggered actions get one task each on the shared PollScheduler
 * (`action:<id>`); event-triggered ones subscribe to the update bus. Every run is
 * a single grounded agent turn.
 *
 * There is one execution path, not one per output mode: what a run may touch and
 * where its result lands both come from the action's capability grant. The grant
 * is enforced by the tool runtime, so a run without `propose_documents` cannot
 * reach a propose tool even if the prompt asks it to.
 *
 * Delivery follows from the grant:
 *   - report_finding: a noteworthy result becomes a notification (silent if none)
 *   - write_outputs:  the result is written to outputs/actions/<name>.md
 *   - neither:        the result lands in run history only
 *
 * Chat-mode actions never reach here — the renderer sends those into a real chat
 * session so their proposals go through the normal review flow.
 *
 * Runs only while the app is open. Interval registration is reconciled on boot
 * via start(); the scheduler is torn down by AppLifecycleService.stopAll().
 */

import type { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  formatTrigger,
  isAutomatic,
  type ActionCapability,
  type ActionDefinition,
  type ActionRunOutcome,
  type ActionTriggerEvent,
} from '../../../shared/actions';
import type { ClaudeModel } from '../../../shared/types';
import type {
  IActionRepository,
  IActionRunRepository,
  IProjectRepository,
  IRepoRepository,
  IAttachmentRepository,
  IPlanItemRepository,
  ITaskPromptTemplateRepository,
} from '../../db/interfaces';
import type { EventDefinition, EventPayload } from '../../../shared/ipc/appEvents';
import { actionEvents } from '../../../shared/ipc/actionEvents';
import type { PollScheduler, PollTickResult } from '../core/PollScheduler';
import type { UpdateEvent, UpdateEventBus } from '../core/UpdateEventBus';
import type { McpDiscoveryService } from '../core/McpDiscoveryService';
import { buildSdkOptions } from '../../claude/sdkOptionsBuilder';
import { runClaudeQuery } from '../../claude/runClaudeQuery';
import { createContextBuilder } from '../../claude/contextBuilders';
import { runWithToolExecutionContext } from '../../kpmTools/runtimeRegistry';
import { toolCapabilitiesFor } from '../core/actionCapabilities';

const ACTION_TIMEOUT_MS = 10 * 60 * 1000;
const RUN_HISTORY_LIMIT = 50;
const NO_FINDINGS = 'NO_FINDINGS';
const MEMORY_DELIMITER = '===ACTION MEMORY===';
const MAX_MEMORY_LENGTH = 4000;
const RECENT_RUNS_WITH_MEMORY = 5;
const RECENT_RUNS_WITHOUT_MEMORY = 10;

const MEMORY_WRITEBACK_INSTRUCTION = `At the very end of your reply, after everything else, append:

${MEMORY_DELIMITER}
<compact plain-text state of everything this action currently knows: items already reported, the current status of each watched item, and relevant timestamps. Max ~30 lines. This fully replaces the previous memory, so carry forward anything still relevant.>`;

/**
 * Which update-bus events map to which trigger. `app_opened` has no bus event —
 * the lifecycle fires it directly via `handleAppOpened`.
 */
const TRIGGER_FOR_EVENT_KIND: Partial<Record<UpdateEvent['kind'], ActionTriggerEvent>> = {
  pr_changed: 'pr_changed',
  ticket_changed: 'ticket_changed',
  branch_changed: 'branch_changed',
  board_agent: 'board_agent_finished',
};

export interface ActionRunnerDeps {
  actions: IActionRepository;
  actionRuns: IActionRunRepository;
  // Repos needed to build the grounded agent context.
  projects: IProjectRepository;
  repos: IRepoRepository;
  attachments: IAttachmentRepository;
  planItems: IPlanItemRepository;
  taskPromptTemplates: ITaskPromptTemplateRepository;
  scheduler: PollScheduler;
  eventBus: UpdateEventBus;
  mcpDiscoveryService: McpDiscoveryService;
  /** The Claude model to use when an action does not pin one. */
  getDefaultClaudeModel: () => ClaudeModel;
  /** Project a global action runs against when the trigger names none. */
  getFallbackProjectId: () => string | null;
  getMainWindow: () => BrowserWindow | null;
  broadcastToWindows: (channel: string, payload: unknown) => void;
}

interface ActionExecutionResult {
  outcome: ActionRunOutcome;
  summary: string | null;
  detail: string | null;
  error: string | null;
  artifactPath: string | null;
  /** Replacement memory extracted from the reply, or null if none was sent. */
  memory: string | null;
}

function taskIdFor(actionId: string): string {
  return `action:${actionId}`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'action';
}

function joinPromptSections(sections: (string | null)[]): string {
  return sections.filter((section): section is string => Boolean(section)).join('\n\n');
}

function has(capabilities: ActionCapability[], capability: ActionCapability): boolean {
  return capabilities.includes(capability);
}

/** Splits a reply on the last memory delimiter, trimming and capping the carried-forward memory. */
function parseReply(rawText: string): { reply: string; memory: string | null } {
  const delimiterIndex = rawText.lastIndexOf(MEMORY_DELIMITER);
  if (delimiterIndex === -1) return { reply: rawText.trim(), memory: null };

  return {
    reply: rawText.slice(0, delimiterIndex).trim(),
    memory: rawText.slice(delimiterIndex + MEMORY_DELIMITER.length).trim().slice(0, MAX_MEMORY_LENGTH),
  };
}

function failed(error: string): ActionExecutionResult {
  return { outcome: 'error', summary: null, detail: null, error, artifactPath: null, memory: null };
}

export function createActionRunnerService(deps: ActionRunnerDeps) {
  const buildContext = createContextBuilder({
    projects: deps.projects,
    repos: deps.repos,
    attachments: deps.attachments,
    planItems: deps.planItems,
    taskPromptTemplates: deps.taskPromptTemplates,
  });

  const log = (msg: string) => console.log(`[Actions] ${msg}`);

  /** Type-checks a broadcast against the app event registry before forwarding. */
  function broadcast<E extends EventDefinition>(event: E, payload: EventPayload<E>): void {
    deps.broadcastToWindows(event.channel, payload);
  }

  // Shared between triggered runs and manual invocation so the two never overlap
  // for the same action.
  const running = new Set<string>();

  /** Assemble the user's enabled MCP plugins and disabled tools, mirroring the chat path. */
  function mcpConfigs() {
    const plugins = deps.mcpDiscoveryService.getEnabledPluginPaths();
    const managed = deps.mcpDiscoveryService.getCachedManagedServers();
    const disabledTools = managed.ok ? deps.mcpDiscoveryService.getDisabledMcpTools(managed.data) : null;
    const disabledNames = managed.ok ? deps.mcpDiscoveryService.getDisabledMcpServerNames(managed.data) : null;
    return {
      enabledPluginPaths: plugins.ok ? plugins.data : [],
      disabledMcpTools: disabledTools?.ok ? disabledTools.data : [],
      disabledMcpServerNames: disabledNames?.ok ? disabledNames.data : [],
    };
  }

  /**
   * A global action has no project of its own, so a run borrows one: the project
   * the triggering event named, else the last one the user opened.
   */
  function resolveProjectId(action: ActionDefinition, eventProjectId?: string): string | null {
    return action.projectId ?? eventProjectId ?? deps.getFallbackProjectId();
  }

  function buildKnownStateBlock(action: ActionDefinition): string {
    const memory = action.memory?.trim() || null;
    const runLimit = memory ? RECENT_RUNS_WITH_MEMORY : RECENT_RUNS_WITHOUT_MEMORY;
    const runLines = deps.actionRuns
      .listByAction(action.id, runLimit)
      .filter((run) => run.outcome !== 'error' && run.summary != null)
      .map((run) => `- ${run.startedAt} [${run.outcome}] ${run.summary!.slice(0, 200)}`);

    if (!memory && runLines.length === 0) return '';

    return joinPromptSections([
      '## Already known from previous runs',
      memory,
      runLines.length > 0 ? `Recent runs:\n${runLines.join('\n')}` : null,
    ]);
  }

  /**
   * The prompt describes the run's own boundaries so the model does not spend
   * turns attempting tools the grant already withholds.
   */
  function buildPrompt(action: ActionDefinition): string {
    const reportsFindings = has(action.capabilities, 'report_finding');
    const writesOutputs = has(action.capabilities, 'write_outputs');
    const mayPropose = has(action.capabilities, 'propose_documents') || has(action.capabilities, 'propose_plan');
    const knownState = buildKnownStateBlock(action);

    return joinPromptSections([
      isAutomatic(action.trigger)
        ? `You are running as a background action (${formatTrigger(action.trigger).toLowerCase()}).`
        : 'You are running as an action the user invoked.',
      mayPropose ? null : 'You cannot modify anything on this run — investigate and report only.',
      action.prompt,
      knownState || null,
      knownState
        ? 'Only report what is genuinely NEW relative to what is already known above. Do not re-report items listed there, even to note they are unchanged.'
        : null,
      writesOutputs
        ? 'Reply with the finished result as Markdown, and nothing else — it is saved to a file verbatim.'
        : null,
      reportsFindings && !writesOutputs
        ? `If there is nothing new or noteworthy to report, reply with exactly \`${NO_FINDINGS}: <one-line reason why not>\`. Otherwise reply with a short alert: a one-line title, then 1–3 sentences of detail.`
        : null,
      !reportsFindings && !writesOutputs
        ? 'Reply with a one-line summary of what you found.'
        : null,
      MEMORY_WRITEBACK_INSTRUCTION,
    ]);
  }

  function emitFinding(
    action: ActionDefinition,
    projectId: string,
    title: string,
    body?: string,
    artifactPath?: string
  ): void {
    deps.eventBus.emit({
      kind: 'action_finding',
      source: 'action',
      detectedAt: new Date().toISOString(),
      actionId: action.id,
      projectId,
      actionName: action.name,
      title,
      body,
      artifactPath,
    });
  }

  function writeOutput(
    action: ActionDefinition,
    projectFolder: string,
    content: string
  ): string {
    const outputsDir = path.join(projectFolder, 'outputs', 'actions');
    fs.mkdirSync(outputsDir, { recursive: true });
    const fullPath = path.join(outputsDir, `${slugify(action.name)}.md`);
    const header = `# ${action.name}\n\n_Updated ${new Date().toLocaleString()}_\n\n`;
    fs.writeFileSync(fullPath, header + content, 'utf-8');
    return path.relative(projectFolder, fullPath);
  }

  async function execute(
    action: ActionDefinition,
    projectId: string
  ): Promise<ActionExecutionResult> {
    const project = deps.projects.get(projectId);
    if (!project) return failed('Project not found');

    const context = buildContext(projectId);
    if (!context) return failed('Project context could not be built');

    const sdkOptions = buildSdkOptions({
      context,
      model: action.model ?? deps.getDefaultClaudeModel(),
      mainWindow: deps.getMainWindow(),
      // A background run has no UI to ask in, so it can only write if the
      // user has already granted writes in this project.
      grantedCapabilities: toolCapabilitiesFor(action.capabilities),
      ...mcpConfigs(),
    });

    const result = await runWithToolExecutionContext(
      {
        projectId,
        chatSessionId: taskIdFor(action.id),
        grantedCapabilities: toolCapabilitiesFor(action.capabilities),
      },
      () => runClaudeQuery({ prompt: buildPrompt(action), sdkOptions, timeoutMs: ACTION_TIMEOUT_MS })
    );

    const { reply, memory } = parseReply(result.text);

    if (!reply) {
      return { outcome: 'no_op', summary: 'No result produced', detail: null, error: null, artifactPath: null, memory };
    }

    if (reply.toUpperCase().startsWith(NO_FINDINGS)) {
      const reason = reply.slice(NO_FINDINGS.length).replace(/^[:\s]+/, '').trim();
      return { outcome: 'no_op', summary: reason || 'Nothing to report', detail: null, error: null, artifactPath: null, memory };
    }

    if (has(action.capabilities, 'write_outputs')) {
      const relativePath = writeOutput(action, project.folder_path, reply);
      if (has(action.capabilities, 'report_finding')) {
        emitFinding(action, projectId, `${action.name} updated`, undefined, relativePath);
      }
      return { outcome: 'ok', summary: `Wrote ${relativePath}`, detail: null, error: null, artifactPath: relativePath, memory };
    }

    const lines = reply.split('\n').map((line) => line.trim()).filter(Boolean);
    const title = lines[0] ?? action.name;
    const body = lines.slice(1).join('\n') || undefined;

    if (has(action.capabilities, 'report_finding')) {
      emitFinding(action, projectId, title, body);
    }
    return { outcome: 'ok', summary: title, detail: body ?? null, error: null, artifactPath: null, memory };
  }

  async function runOnce(actionId: string, eventProjectId?: string): Promise<PollTickResult> {
    const action = deps.actions.get(actionId);
    if (!action) return { outcome: 'noop', message: 'action no longer exists' };
    if (running.has(actionId)) return { outcome: 'noop', message: 'already running' };
    if (action.manualRun === 'chat' && !isAutomatic(action.trigger)) {
      return { outcome: 'noop', message: 'chat-mode actions run in a chat session' };
    }

    const projectId = resolveProjectId(action, eventProjectId);
    if (!projectId) return { outcome: 'noop', message: 'no project to run against' };

    running.add(actionId);
    try {
      const startedAt = new Date().toISOString();
      log(`Running "${action.name}"`);

      let result: ActionExecutionResult;
      try {
        result = await execute(action, projectId);
      } catch (e) {
        result = failed(e instanceof Error ? e.message : String(e));
      }

      deps.actionRuns.create({
        actionId,
        outcome: result.outcome,
        summary: result.summary,
        detail: result.detail,
        error: result.error,
        artifactPath: result.artifactPath,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
      deps.actionRuns.pruneOld(actionId, RUN_HISTORY_LIMIT);
      deps.actions.recordRunOutcome(actionId, result.outcome, result.error, startedAt);
      if (result.outcome !== 'error' && result.memory !== null) {
        deps.actions.updateMemory(actionId, result.memory);
      }
      broadcast(actionEvents.run, { actionId, projectId, outcome: result.outcome });

      const pollOutcome = result.outcome === 'error' ? 'error' : result.outcome === 'no_op' ? 'noop' : 'ok';
      return { outcome: pollOutcome, message: result.summary ?? result.error ?? undefined };
    } finally {
      running.delete(actionId);
    }
  }

  function syncAction(action: ActionDefinition, opts?: { immediate?: boolean }): void {
    const id = taskIdFor(action.id);
    // Unregister first so an interval or enabled change re-registers cleanly.
    deps.scheduler.unregister(id);
    if (!action.enabled || action.trigger.kind !== 'interval') return;
    deps.scheduler.register({
      id,
      intervalMs: action.trigger.minutes * 60 * 1000,
      handler: () => runOnce(action.id),
      runImmediately: opts?.immediate ?? false,
    });
    deps.scheduler.start(id);
  }

  function removeAction(actionId: string): void {
    deps.scheduler.unregister(taskIdFor(actionId));
  }

  function runNow(actionId: string): Promise<void> {
    // Runs directly so it works even when the action is disabled (not
    // registered). Fire-and-forget: the query can run for minutes, so callers
    // don't wait. The result reaches the renderer via the run broadcast.
    void runOnce(actionId).catch((e) => {
      log(`Manual run of ${actionId} failed to start: ${e instanceof Error ? e.message : String(e)}`);
    });
    return Promise.resolve();
  }

  /** Fan a bus event out to every action listening for it. */
  function handleUpdateEvent(event: UpdateEvent): void {
    const trigger = TRIGGER_FOR_EVENT_KIND[event.kind];
    if (!trigger) return;
    // Only a settled board phase is worth waking an action for; mid-flight
    // phases fire constantly.
    if (event.kind === 'board_agent' && event.phase !== 'ready_for_review') return;

    const eventProjectId = 'projectId' in event ? event.projectId : undefined;
    for (const action of deps.actions.listEnabledForEvent(trigger)) {
      void runOnce(action.id, eventProjectId);
    }
  }

  /** Called once the app is up, for actions triggered on open. */
  function handleAppOpened(): void {
    for (const action of deps.actions.listEnabledForEvent('app_opened')) {
      void runOnce(action.id);
    }
  }

  function start(): void {
    const intervalTriggered = deps.actions.listEnabledIntervalTriggered();
    if (intervalTriggered.length > 0) {
      log(`Reconciling ${intervalTriggered.length} interval-triggered action(s) on startup`);
    }
    for (const action of intervalTriggered) syncAction(action);

    deps.eventBus.onAny(handleUpdateEvent);
  }

  return { syncAction, removeAction, runNow, handleAppOpened, start };
}

export type ActionRunnerService = ReturnType<typeof createActionRunnerService>;
