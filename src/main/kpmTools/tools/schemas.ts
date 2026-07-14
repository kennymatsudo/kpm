// Shared Zod schemas and types used across multiple tool files.
// Centralised here to avoid duplication without coupling individual files.

import { z } from 'zod';
import { STATUS_CATEGORIES } from '../../../shared/types';
import type { PlanAction } from '../../../shared/types';

export const StatusCategoryEnum = z.enum(STATUS_CATEGORIES);

// Tool-facing plan-item hierarchy vocabulary. `story` is the label
// PlanActionService applies by default when create_item omits one, so it must
// stay settable and filterable alongside the hierarchy tiers.
export const LabelEnum = z.enum(['project', 'story', 'feature', 'task']);

export type PlanActionsCallback = (actions: PlanAction[]) => void;
