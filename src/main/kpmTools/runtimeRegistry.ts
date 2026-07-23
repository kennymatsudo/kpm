import type { BrowserWindow } from 'electron';
import fs from 'fs';
import { CONTEXT_FILE_NAMES, CONTEXT_FILE_PENDING_CACHE_KEY } from '../../shared/contextFile';
import type { ChatSessionScope, PlanAction } from '../../shared/types';
import type { IRepositoryContainer } from '../db/interfaces';
import { resolveScopedPath } from '../services/files/scopedFs';
import type { AppServices } from '../services/appServices';
import { processKpmToolProposalSink } from './proposals';
import {
  getCurrentKpmToolProposalSink,
  getCurrentToolExecutionContext,
  KpmToolRuntime,
  type KpmToolAvailability,
  type KpmToolCapability,
  type KpmToolDefinition,
  type KpmToolExecutionResult,
  type KpmToolGroup,
} from './runtime';
import { createBriefingTools } from './tools/briefing';
import { createContextFileEditTools, type ContextFileUpdatePayload } from './tools/context-file-update';
import { createConfluenceTools } from './tools/confluence';
import { createDocumentEditTools } from './tools/document-edit';
import { createDocumentReadTools } from './tools/document-read';
import { createDocumentCreateTools, type DocumentUpdatePayload } from './tools/document-update';
import { createFileDeleteTools, type FileDeleteCallback } from './tools/file-delete';
import { createFileMoveTools } from './tools/file-move';
import { createGitReadTools } from './tools/git-read';
import { createGitHubTools } from './tools/github';
import { createGroupTools } from './tools/groups';
import { createJiraTools } from './tools/jira';
import { createListProjectFilesTools } from './tools/list-project-files';
import { createPlanChangeTools } from './tools/plan-changes';
import { createPlanItemTools } from './tools/plan-items';
import { createPlanRefTools } from './tools/plan-refs';
import { createRelationTools } from './tools/relations';
import { createSpillReadTools } from './tools/spill-read';
import { createStorybookTools } from './tools/storybook';

export { runWithToolExecutionContext, type KpmToolDefinition, type KpmToolRuntime } from './runtime';
export { subscribeToKpmToolProposals, type KpmToolProposal, type PlanActionsEvent } from './proposals';

export const KPM_MCP_INSTRUCTIONS = `KPM tools are local project-planning tools. Chat is read-only against repos: do not write repo files from chat. Plan-mutating tools propose PlanAction[] for KPM review or auto-apply; they must not bypass KPM's approval flow or write plan rows directly. Document, context-file, move, and delete tools emit proposals for KPM to surface to the user. Use @plan/<uuid> only for plan item UUIDs returned by KPM tools. Keep responses concise and utilitarian.`;

export interface KpmToolRuntimeDeps {
  container: Pick<
    IRepositoryContainer,
    | 'projects'
    | 'planItems'
    | 'planRelations'
    | 'groups'
    | 'repos'
    | 'devSessions'
    | 'confluenceLinks'
  >;
  services: Pick<AppServices, 'briefingService' | 'fileExplorerService'>;
  getMainWindow: () => BrowserWindow | null;
}

let kpmToolRuntimeDeps: KpmToolRuntimeDeps | null = null;
let cachedRuntime: KpmToolRuntime | null = null;

// Cache for pending document content (proposed but not yet accepted). Keyed by
// `${chatSessionId}:${filePath}` for documents and
// `${chatSessionId}:${CONTEXT_FILE_PENDING_CACHE_KEY}` for the project context
// file. Scoping by session prevents concurrent sessions from polluting each
// other. Cleared at the start of every new turn.
const pendingDocumentContent = new Map<string, string>();
const resolvedContextFilename = new Map<string, string>();

export function warmupKpmToolRuntime(deps: KpmToolRuntimeDeps): void {
  kpmToolRuntimeDeps = deps;
  cachedRuntime = null;
  // Build once at startup so tool construction failures surface early.
  getKpmToolRuntime().listToolManifest();
}

function getKpmToolRuntimeDeps(): KpmToolRuntimeDeps {
  if (!kpmToolRuntimeDeps) {
    throw new Error('KPM tool runtime not initialized. Call warmupKpmToolRuntime() during app startup.');
  }
  return kpmToolRuntimeDeps;
}

export function clearPendingDocumentContent(chatSessionId: string): void {
  const prefix = `${chatSessionId}:`;
  for (const key of pendingDocumentContent.keys()) {
    if (key.startsWith(prefix)) pendingDocumentContent.delete(key);
  }
  resolvedContextFilename.delete(chatSessionId);
}

async function readProjectFile(projectId: string, filePath: string): Promise<string | null> {
  const { container } = getKpmToolRuntimeDeps();
  const project = container.projects.get(projectId);
  if (!project) return null;

  const scoped = resolveScopedPath(project.folder_path, filePath);
  if (!scoped.valid) return null;

  try {
    return await fs.promises.readFile(scoped.fullPath, 'utf-8');
  } catch {
    return null;
  }
}

async function readProjectContextFile(projectId: string): Promise<{ content: string; filename: string } | null> {
  const chatSessionId = getCurrentToolExecutionContext()?.chatSessionId;
  const memoized = chatSessionId ? resolvedContextFilename.get(chatSessionId) : undefined;
  if (memoized) {
    const content = await readProjectFile(projectId, memoized);
    if (content !== null) return { content, filename: memoized };
    resolvedContextFilename.delete(chatSessionId!);
  }

  for (const filename of CONTEXT_FILE_NAMES) {
    const content = await readProjectFile(projectId, filename);
    if (content !== null) {
      if (chatSessionId) resolvedContextFilename.set(chatSessionId, filename);
      return { content, filename };
    }
  }
  return null;
}

async function readProjectContextFileWithPending(projectId: string): Promise<{ content: string; filename: string } | null> {
  const chatSessionId = getCurrentToolExecutionContext()?.chatSessionId;
  if (chatSessionId) {
    const cached = pendingDocumentContent.get(`${chatSessionId}:${CONTEXT_FILE_PENDING_CACHE_KEY}`);
    if (cached !== undefined) {
      const filename = resolvedContextFilename.get(chatSessionId);
      if (filename) return { content: cached, filename };
    }
  }
  return readProjectContextFile(projectId);
}

function emitPlanActions(actions: PlanAction[]): void {
  const context = getCurrentToolExecutionContext();
  if (!context?.projectId || !context?.chatSessionId) {
    console.warn('[KPM Tools] Skipping unscoped plan actions event');
    return;
  }

  context.proposalSink?.propose({
    type: 'plan-actions',
    projectId: context.projectId,
    chatSessionId: context.chatSessionId,
    actions,
  });
}

function emitContextFileUpdate(update: ContextFileUpdatePayload): void {
  const context = getCurrentToolExecutionContext();
  const chatSessionId = update.chatSessionId ?? context?.chatSessionId;
  if (chatSessionId) {
    pendingDocumentContent.set(`${chatSessionId}:${CONTEXT_FILE_PENDING_CACHE_KEY}`, update.newContent);
    resolvedContextFilename.set(chatSessionId, update.filename);
  }

  getCurrentKpmToolProposalSink()?.propose({ type: 'project-context-update', ...update, chatSessionId });
}

function emitDocumentUpdate(update: DocumentUpdatePayload): void {
  const context = getCurrentToolExecutionContext();
  const chatSessionId = update.chatSessionId ?? context?.chatSessionId;
  if (chatSessionId) pendingDocumentContent.set(`${chatSessionId}:${update.filePath}`, update.content);

  getCurrentKpmToolProposalSink()?.propose({ type: 'document-update', ...update, chatSessionId });
}

const emitFileMove = (payload: { projectId: string; chatSessionId?: string; sourcePath: string; targetPath: string }) => {
  const context = getCurrentToolExecutionContext();
  const chatSessionId = payload.chatSessionId ?? context?.chatSessionId;
  getCurrentKpmToolProposalSink()?.propose({ type: 'file-move', ...payload, chatSessionId });
};

const emitFileDelete: FileDeleteCallback = (payload) => {
  const context = getCurrentToolExecutionContext();
  const chatSessionId = payload.chatSessionId ?? context?.chatSessionId;
  getCurrentKpmToolProposalSink()?.propose({ type: 'file-delete', ...payload, chatSessionId });
};

async function readProjectFileWithPending(projectId: string, filePath: string): Promise<string | null> {
  const chatSessionId = getCurrentToolExecutionContext()?.chatSessionId;
  if (chatSessionId) {
    const cached = pendingDocumentContent.get(`${chatSessionId}:${filePath}`);
    if (cached !== undefined) return cached;
  }
  return readProjectFile(projectId, filePath);
}

export function peekPendingDocumentContent(chatSessionId: string | undefined, filePath: string): string | undefined {
  if (!chatSessionId) return undefined;
  return pendingDocumentContent.get(`${chatSessionId}:${filePath}`);
}

export function recordPendingDocumentContent(chatSessionId: string | undefined, filePath: string, content: string): void {
  if (!chatSessionId) return;
  pendingDocumentContent.set(`${chatSessionId}:${filePath}`, content);
}

const MAIN_ONLY: KpmToolAvailability = { main: true, focus_document: false };
const ALL_CHAT_SCOPES: KpmToolAvailability = { main: true, focus_document: true };

function group(
  id: string,
  availability: KpmToolAvailability,
  capabilities: KpmToolCapability[],
  tools: KpmToolDefinition[],
): KpmToolGroup {
  return { id, availability, capabilities, tools };
}

function buildToolGroups(): KpmToolGroup[] {
  const { container, services } = getKpmToolRuntimeDeps();
  const projectRepo = container.projects;
  const planItemRepo = container.planItems;
  const planRelationRepo = container.planRelations;
  const groupRepo = container.groups;
  const repoRepo = container.repos;

  return [
    group('plan-items', MAIN_ONLY, ['plan_items.read', 'plan_items.propose'], createPlanItemTools(planItemRepo, planRelationRepo, emitPlanActions)),
    group('plan-relations', MAIN_ONLY, ['plan_relations.read'], createRelationTools(planItemRepo)),
    group('groups', MAIN_ONLY, ['groups.read'], createGroupTools(groupRepo)),
    group('plan-changes', MAIN_ONLY, ['plan_items.propose'], createPlanChangeTools(emitPlanActions, repoRepo)),
    group('jira', MAIN_ONLY, ['integrations.read'], createJiraTools()),
    group('storybook', MAIN_ONLY, ['integrations.read'], createStorybookTools(projectRepo)),
    group('project-context', ALL_CHAT_SCOPES, ['project_context.propose'], createContextFileEditTools(readProjectContextFileWithPending, emitContextFileUpdate)),
    group('document-read', ALL_CHAT_SCOPES, ['documents.read'], createDocumentReadTools(readProjectFileWithPending)),
    group('document-create', ALL_CHAT_SCOPES, ['documents.propose'], createDocumentCreateTools(emitDocumentUpdate)),
    group('document-edit', ALL_CHAT_SCOPES, ['documents.propose'], createDocumentEditTools(readProjectFileWithPending, emitDocumentUpdate)),
    group('github', MAIN_ONLY, ['integrations.read'], createGitHubTools(planItemRepo, repoRepo, container.devSessions)),
    group('confluence', MAIN_ONLY, ['integrations.read'], createConfluenceTools(container.confluenceLinks)),
    group('briefing', MAIN_ONLY, ['briefing.read'], createBriefingTools(services.briefingService)),
    group('file-move', MAIN_ONLY, ['file_changes.propose'], createFileMoveTools({ onFileMove: emitFileMove })),
    group('file-delete', MAIN_ONLY, ['file_changes.propose'], createFileDeleteTools({ fileExplorerService: services.fileExplorerService, onFileDelete: emitFileDelete })),
    group('project-files', ALL_CHAT_SCOPES, ['project_files.read'], createListProjectFilesTools({ fileExplorerService: services.fileExplorerService })),
    group('plan-refs', ALL_CHAT_SCOPES, ['plan_refs.read'], createPlanRefTools({ planItems: planItemRepo, projects: projectRepo })),
    group('spill-read', MAIN_ONLY, ['spill.read'], createSpillReadTools()),
    group('git-read', MAIN_ONLY, ['repo.read'], createGitReadTools({ repos: repoRepo })),
  ];
}

export function getKpmToolRuntime(): KpmToolRuntime {
  if (!cachedRuntime) cachedRuntime = new KpmToolRuntime(buildToolGroups, processKpmToolProposalSink);
  return cachedRuntime;
}

export function getKpmToolDefinitions(options: { scope: ChatSessionScope }): KpmToolDefinition[] {
  return getKpmToolRuntime().listTools({ scope: options.scope });
}

export function executeKpmTool(options: {
  name: string;
  args: unknown;
  extra?: unknown;
  projectId: string;
  chatSessionId?: string;
  scope: ChatSessionScope;
}): Promise<KpmToolExecutionResult> {
  return getKpmToolRuntime().executeTool(options);
}
