import { z } from 'zod';
import { resultOf, type EndpointDefinition } from './endpoints';
import { playbookStepSchema, type BoardProvider, type Playbook } from '../playbooks';
import type { SlashCommandInfo } from '../types';

type Response<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

const id = z.string().min(1).max(200);
const editable = z.object({ name: z.string().trim().min(1).max(120), steps: z.array(playbookStepSchema).min(1).max(50) });

export const playbookEndpoints = {
  list: { channel: 'playbook:list', params: null, result: resultOf<Response<{ playbooks: Playbook[]; defaultId: string }>>() },
  create: { channel: 'playbook:create', params: editable, result: resultOf<Response<{ playbook: Playbook }>>() },
  update: { channel: 'playbook:update', params: editable.extend({ id }), result: resultOf<Response<{ playbook: Playbook }>>() },
  delete: { channel: 'playbook:delete', params: z.object({ id }), result: resultOf<Response>() },
  duplicate: { channel: 'playbook:duplicate', params: z.object({ id }), result: resultOf<Response<{ playbook: Playbook }>>() },
  setDefault: { channel: 'playbook:set-default', params: z.object({ id }), result: resultOf<Response>() },
  providers: { channel: 'playbook:providers', params: null, result: resultOf<Response<{ providers: BoardProvider[] }>>() },
  skills: { channel: 'playbook:skills', params: null, result: resultOf<Response<{ skills: SlashCommandInfo[] }>>() },
} satisfies Record<string, EndpointDefinition>;

export type PlaybookEndpointName = keyof typeof playbookEndpoints;
