/**
 * Context builders for Claude sessions.
 *
 * These functions build the context objects needed for Claude sessions,
 * separating data fetching from the session lifecycle management.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CONTEXT_FILE_NAMES } from '../../shared/contextFile';
import type {
  IAppSettingsRepository,
  IAttachmentRepository,
  IPlanItemRepository,
  IProjectRepository,
  IRepoRepository,
  ITaskPromptTemplateRepository,
} from '../db/interfaces';
import { getSetting } from '../db/appSettingsAccess';
import type { PlanContext } from '../chat/prompts/types';

export interface BuildContextDeps {
  projects: IProjectRepository;
  repos: IRepoRepository;
  attachments: IAttachmentRepository;
  planItems: IPlanItemRepository;
  taskPromptTemplates: ITaskPromptTemplateRepository;
  /**
   * When provided, the developer's global `~/.claude/CLAUDE.md` is folded into
   * the chat system prompt (gated by the `respectGlobalClaudeMd` setting). Omit
   * for non-chat callers (e.g. scheduled loops) that should not inherit it.
   */
  appSettings?: IAppSettingsRepository;
}

/**
 * Read the project context file (AGENTS.md or CLAUDE.md) from a project's folder.
 * Checks AGENTS.md first, then falls back to CLAUDE.md.
 * Returns null if neither file exists or is unreadable.
 */
function readContextFile(folderPath: string): string | null {
  for (const filename of CONTEXT_FILE_NAMES) {
    try {
      const filePath = path.join(folderPath, filename);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
    } catch {
      // File doesn't exist or isn't readable — try next
    }
  }
  return null;
}

/**
 * Read the developer's global instructions from `~/.claude/CLAUDE.md`, honoring
 * the `respectGlobalClaudeMd` setting. Returns null when the setting is off, the
 * file is absent, or it can't be read. `@import` directives are not expanded.
 */
function readUserGlobalInstructions(appSettings?: IAppSettingsRepository): string | null {
  if (!appSettings || !getSetting(appSettings, 'respectGlobalClaudeMd')) {
    return null;
  }
  try {
    const filePath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch {
    // File doesn't exist or isn't readable
  }
  return null;
}

export function createContextBuilder(deps: BuildContextDeps) {
  /**
   * Build the context for a main chat session.
   * @returns PlanContext or null if project not found
   */
  return function buildContext(projectId: string): PlanContext | null {
    const project = deps.projects.get(projectId);
    if (!project) {
      return null;
    }

    const repos = deps.repos.getByProject(projectId);
    const attachments = deps.attachments.getByProject(projectId);
    const planItems = deps.planItems.getByProject(projectId);
    const taskPromptTemplate = deps.taskPromptTemplates.getEffective(projectId);
    const contextFileContent = readContextFile(project.folder_path);
    const userGlobalInstructions = readUserGlobalInstructions(deps.appSettings);

    return {
      project,
      repos,
      attachments,
      planItems,
      focusedResources: [], // Will be populated by message sender
      taskPromptTemplate,
      contextFileContent,
      userGlobalInstructions,
    };
  };
}
