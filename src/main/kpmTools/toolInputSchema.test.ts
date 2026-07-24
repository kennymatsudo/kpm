import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { assertKpmToolInputSchemas } from './toolInputSchema';

function toolWithInputSchema(name: string, inputSchema: Record<string, unknown>) {
  return {
    name,
    description: name,
    inputSchema,
    handler: vi.fn(),
  };
}

describe('assertKpmToolInputSchemas', () => {
  it('identifies a tool whose input cannot be represented as JSON Schema', () => {
    expect(() => assertKpmToolInputSchemas([
      toolWithInputSchema('invalid_tool', { value: z.custom(() => true) }),
    ])).toThrow('KPM tool "invalid_tool" input schema is not JSON Schema compatible.');
  });
});
