// Shared Zod schemas and types used across multiple tool files.
// Centralised here to avoid duplication without coupling individual files.

import { z } from 'zod';
import type { PlanAction } from '../../../shared/types';

export const StatusCategoryEnum = z.enum([
  'not_started',
  'in_progress',
  'in_review',
  'done',
  'blocked',
  'canceled',
]);

// Tool-facing plan-item hierarchy vocabulary. `story` is the label
// PlanActionService applies by default when create_item omits one, so it must
// stay settable and filterable alongside the hierarchy tiers.
export const LabelEnum = z.enum(['project', 'story', 'feature', 'task']);

export type PlanActionsCallback = (actions: PlanAction[]) => void;
