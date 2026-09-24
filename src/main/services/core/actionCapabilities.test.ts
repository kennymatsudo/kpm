import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toolCapabilitiesFor } from './actionCapabilities';
import { getKpmToolRuntime, warmupKpmToolRuntime } from '../../kpmTools/runtimeRegistry';
import { ACTION_CAPABILITIES } from '../../../shared/actions';

vi.mock('../../db/connection', () => ({
  getDatabase: () => ({}),
}));

function warmup(): void {
  warmupKpmToolRuntime({
    container: {
      projects: {},
      planItems: {},
      planRelations: {},
      groups: {},
      repos: {},
      devSessions: {},
      confluenceLinks: {},
    } as never,
    services: { fileExplorerService: {} } as never,
    getMainWindow: () => null,
  });
}

describe('toolCapabilitiesFor', () => {
  it('grants plan reads without plan proposals', () => {
    const resolved = toolCapabilitiesFor(['read_project']);
    expect(resolved).toContain('plan_items.read');
    expect(resolved).not.toContain('plan_items.propose');
    expect(resolved).not.toContain('documents.propose');
  });

  it('treats delivery grants as no tool access', () => {
    expect(toolCapabilitiesFor(['report_finding', 'write_outputs'])).toEqual([]);
  });

  it('deduplicates overlapping grants', () => {
    const resolved = toolCapabilitiesFor(['read_project', 'read_project', 'propose_plan']);
    expect(new Set(resolved).size).toBe(resolved.length);
    expect(resolved).toContain('plan_items.propose');
  });

  it('covers every action capability', () => {
    for (const capability of ACTION_CAPABILITIES) {
      expect(() => toolCapabilitiesFor([capability])).not.toThrow();
    }
  });
});

describe('capability filtering in the tool runtime', () => {
  beforeEach(warmup);

  it('withholds propose tools from a read-only grant', () => {
    const runtime = getKpmToolRuntime();
    const names = runtime
      .listTools({ scope: 'main', grantedCapabilities: toolCapabilitiesFor(['read_project']) })
      .map((tool) => tool.name);

    expect(names).toContain('query_plan_items');
    expect(names).toContain('read_project_file');
    expect(names).not.toContain('modify_plan');
    expect(names).not.toContain('bulk_modify_plan');
    expect(names).not.toContain('propose_document_edit');
    expect(names).not.toContain('propose_context_edit');
  });

  it('admits document proposals only when that grant is present', () => {
    const runtime = getKpmToolRuntime();
    const names = runtime
      .listTools({
        scope: 'main',
        grantedCapabilities: toolCapabilitiesFor(['read_project', 'propose_documents']),
      })
      .map((tool) => tool.name);

    expect(names).toContain('propose_document_edit');
    expect(names).toContain('propose_context_edit');
    expect(names).not.toContain('modify_plan');
  });

  it('never lets an action run reach the configuration tools, whatever it is granted', () => {
    const names = getKpmToolRuntime()
      .listTools({ scope: 'main', grantedCapabilities: toolCapabilitiesFor(ACTION_CAPABILITIES) })
      .map((tool) => tool.name);

    expect(names).toContain('modify_plan');
    expect(names).not.toContain('read_config');
    expect(names).not.toContain('propose_config_change');
  });

  it('offers the configuration tools to main chat only', () => {
    const runtime = getKpmToolRuntime();

    expect(runtime.listTools({ scope: 'main' }).map((tool) => tool.name)).toContain('propose_config_change');
    expect(runtime.listTools({ scope: 'focus_document' }).map((tool) => tool.name)).not.toContain('propose_config_change');
  });

  it('leaves the tool set unfiltered when no grant is passed', () => {
    const runtime = getKpmToolRuntime();
    const granted = runtime.listTools({ scope: 'main', grantedCapabilities: toolCapabilitiesFor(['read_project']) });
    const ungated = runtime.listTools({ scope: 'main' });

    expect(ungated.length).toBeGreaterThan(granted.length);
    expect(ungated.map((tool) => tool.name)).toContain('modify_plan');
  });
});
