/**
 * Context builders for Claude sessions.
 *
 * These functions build the context objects needed for Claude sessions,
 * separating data fetching from the session lifecycle management.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CONTEXT_FILE_NAMES } from '../../shared/contextFile';
import type {
  IAttachmentRepository,
  IPlanItemRepository,
  IProjectRepository,
  IRepoRepository,
  ITaskPromptTemplateRepository,
} from '../db/interfaces';
import type { PlanContext } from './prompts/types';

export interface BuildContextDeps {
  projects: IProjectRepository;
  repos: IRepoRepository;
  attachments: IAttachmentRepository;
  planItems: IPlanItemRepository;
  taskPromptTemplates: ITaskPromptTemplateRepository;
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
    const claudeMdContent = readContextFile(project.folder_path);

    return {
      project,
      repos,
      attachments,
      planItems,
      focusedResources: [], // Will be populated by message sender
      taskPromptTemplate,
      claudeMdContent,
    };
  };
}
