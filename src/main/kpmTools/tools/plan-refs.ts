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
import { tool, jsonResult, toolError } from './index';
import { expandPlanRefs } from '../../../shared/planRefs';

export interface PlanRefToolDeps {
  planItems: IPlanItemRepository;
  projects: IProjectRepository;
}

export function createPlanRefTools(deps: PlanRefToolDeps) {
  return [
    tool(
      'extract_plan_items_from_doc',
      [
        'List every `@plan/<uuid>` token in a project file and report how each resolves.',
        '**INPUT:** `projectId` + `filePath` (project-relative path, e.g. "design/export.md" — same format as `list_project_files` output).',
        '**RETURNS:** `{ path, refs: [{ id, resolved, title?, status_category?, external_key? }], unresolvedCount }`. `resolved: false` means the UUID is unknown — the doc is referencing a deleted or hallucinated item.',
        'Use this before proposing edits to a file with refs so you do not break tokens the user expects to remain stable.',
      ].join('\n\n'),
      {
        projectId: z.string().uuid().describe('Project UUID'),
        filePath: z
          .string()
          .min(1)
          .describe('Project-relative file path, e.g. "design/export.md". Same format as list_project_files output.'),
      },
      async ({ projectId, filePath }) => {
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
          title: e.item?.title ?? null,
          status_category: e.item?.status_category ?? null,
          external_key: e.item?.external_key ?? null,
        }));
        return jsonResult({
          path: filePath,
          refs,
          unresolvedCount: refs.filter((r) => !r.resolved).length,
        });
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } },
    ),
  ];
}
