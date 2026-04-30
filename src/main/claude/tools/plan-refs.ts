/**
 *
 */

import { z } from 'zod';
import * as path from 'path';
import { promises as fs } from 'fs';
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
      ].join('\n\n'),
      {
      },

        let content: string;
        try {
          content = await fs.readFile(absolute, 'utf-8');
        } catch (e) {
        }

        const expanded = expandPlanRefs(content, items);
        const refs = expanded.map((e) => ({
          id: e.id,
          resolved: e.item !== null,
          title: e.item?.title ?? null,
          status_category: e.item?.status_category ?? null,
          external_key: e.item?.external_key ?? null,
        }));
        return jsonResult({
          refs,
          unresolvedCount: refs.filter((r) => !r.resolved).length,
        });
      },
      { annotations: { readOnlyHint: true, idempotentHint: true } },
    ),
  ];
}
