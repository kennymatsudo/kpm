import { z } from 'zod';
import type { KpmToolDefinition } from './runtime';

const JSON_SCHEMA_OPTIONS = { io: 'input', target: 'draft-7' } as const;

export function toKpmToolInputJsonSchema(inputSchema: Record<string, unknown>) {
  return z.toJSONSchema(z.object(inputSchema), JSON_SCHEMA_OPTIONS);
}

export function assertKpmToolInputSchemas(
  tools: Pick<KpmToolDefinition, 'name' | 'inputSchema'>[],
): void {
  const checkedToolNames = new Set<string>();
  for (const tool of tools) {
    if (checkedToolNames.has(tool.name)) continue;
    checkedToolNames.add(tool.name);

    try {
      toKpmToolInputJsonSchema(tool.inputSchema);
    } catch (error) {
      throw new Error(`KPM tool "${tool.name}" input schema is not JSON Schema compatible.`, { cause: error });
    }
  }
}
