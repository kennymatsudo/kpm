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

export type PlanActionsCallback = (actions: PlanAction[]) => void;
