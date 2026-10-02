/**
 * Plan-reference tools for Claude. Read-only tools that let the agent inspect
 * `@plan/<uuid>` tokens in a file and see how each one resolves.
 *
 * Documents are identified by their project-relative file path (e.g.
 * "design/export-pipeline.md"), exactly as returned by `list_project_files`.
 * There is no separate document store — files live on disk under the project's
 * `folder_path`.
 */

import { z } from 'zod';
import * as path from 'path';
import { promises as fs } from 'fs';
import type { IPlanItemRepository, IProjectRepository } from '../../db/interfaces';
import { tool, jsonResult, toolError, projectScoped } from './index';
import { expandPlanRefs } from '../../../shared/planRefs';

export interface PlanRefToolDeps {
  planItems: IPlanItemRepository;
  projects: IProjectRepository;
}

export function createPlanRefTools(deps: PlanRefToolDeps) {
  return [
    tool(
      'list_document_plan_refs',
      'List every @plan/<uuid> reference in a project file with the title and status it resolves to. resolved: false means no plan item has that ID, so the reference is to a deleted item or was invented. Use it to check a document\'s references, or to see which plan items a document covers without reading the whole file.',
      {
        filePath: z
          .string()
          .min(1)
          .describe('Project-relative file path, e.g. "design/export.md"'),
      },
      projectScoped(async ({ projectId, filePath }) => {
        const project = deps.projects.get(projectId);
        if (!project?.folder_path) return toolError(`Project not found: ${projectId}`);

        const absolute = path.join(project.folder_path, filePath);
        // Basic path traversal guard
        if (!absolute.startsWith(project.folder_path)) {
          return toolError('File path must be within the project folder');
        }

        let content: string;
        try {
          content = await fs.readFile(absolute, 'utf-8');
        } catch (e) {
          return toolError(`Failed to read file: ${(e as Error).message}`);
        }

        const items = deps.planItems.getByProject(projectId);
        const expanded = expandPlanRefs(content, items);
        const refs = expanded.map((e) => ({
          id: e.id,
          resolved: e.item !== null,
          title: e.item?.title,
          status_category: e.item?.status_category,
          external_key: e.item?.external_key ?? undefined,
        }));
        return jsonResult({
          path: filePath,
          refs,
          unresolvedCount: refs.filter((r) => !r.resolved).length,
        });
      }),
      { annotations: { readOnlyHint: true, idempotentHint: true } },
    ),
  ];
}
