import type {
  AgentCandidate,
  BoardProvider,
  Playbook,
  PlaybookStep,
} from './playbooks';

export interface ResolvedAgent {
  provider: string;
  model: string;
  effort?: Exclude<AgentCandidate, string>['effort'];
}

export interface ResolvedPlaybookStep {
  stepId: string;
  runs: (ResolvedAgent | null)[];
}

export function resolveCandidateChain(
  candidates: AgentCandidate[] | undefined,
  providers: BoardProvider[],
): ResolvedAgent | null {
  const available = providers.filter((provider) => provider.available);
  for (const candidate of candidates ?? []) {
    const provider = available.find((entry) => entry.id === candidate.provider);
    if (!provider) continue;
    const model = provider.models.find((entry) => entry.id === candidate.model)
      ?? provider.models.find((entry) => entry.isDefault)
      ?? provider.models[0];
    if (!model) continue;
    return {
      provider: provider.id,
      model: model.id,
      ...(candidate.effort ? { effort: candidate.effort } : {}),
    };
  }
  return null;
}

export function resolvePlaybookPlan(playbook: Playbook, providers: BoardProvider[]): {
  main: ResolvedAgent | null;
  steps: ResolvedPlaybookStep[];
} {
  const firstMain = playbook.steps.find((step) => step.session === 'main');
  const main = resolveCandidateChain(firstMain?.agents ?? [{ provider: 'claude' }], providers);
  return {
    main,
    steps: playbook.steps.map((step) => ({
      stepId: step.id,
      runs: step.session === 'main'
        ? [main]
        : step.runs
          ? step.runs.map((chain) => resolveCandidateChain(chain, providers))
          : [resolveCandidateChain(step.agents, providers)],
    })),
  };
}

export type PlaybookAdvance =
  | { kind: 'step'; stepId: string; passCounts: Record<string, number> }
  | { kind: 'pause'; stepId: string; reason: 'gate' | 'max_passes'; passCounts: Record<string, number> }
  | { kind: 'complete'; passCounts: Record<string, number> };

function defaultNext(playbook: Playbook, step: PlaybookStep): string | undefined {
  const index = playbook.steps.findIndex((entry) => entry.id === step.id);
  return step.next ?? playbook.steps[index + 1]?.id;
}

/** Pure cursor transition used by the persisted interpreter. */
export function advancePlaybook(
  playbook: Playbook,
  completedStepId: string,
  hasFindings: boolean,
  passCounts: Record<string, number>,
): PlaybookAdvance {
  const step = playbook.steps.find((entry) => entry.id === completedStepId);
  if (!step) return { kind: 'complete', passCounts };

  let nextId: string | undefined;
  let nextCounts = passCounts;
  if (hasFindings && step.onFindings) {
    const spent = passCounts[step.id] ?? 0;
    if (spent >= step.onFindings.maxPasses) {
      if (step.onFindings.onMaxPasses === 'pause') {
        return { kind: 'pause', stepId: step.id, reason: 'max_passes', passCounts };
      }
      nextId = step.next;
    } else {
      nextCounts = { ...passCounts, [step.id]: spent + 1 };
      nextId = step.onFindings.goto;
    }
  } else if (step.verdict === 'findings' && step.onFindings && !step.next) {
    nextId = undefined;
  } else {
    nextId = defaultNext(playbook, step);
  }

  if (!nextId) return { kind: 'complete', passCounts: nextCounts };
  const next = playbook.steps.find((entry) => entry.id === nextId);
  if (!next) return { kind: 'complete', passCounts: nextCounts };
  if (next.pauseBefore) {
    return { kind: 'pause', stepId: next.id, reason: 'gate', passCounts: nextCounts };
  }
  return { kind: 'step', stepId: next.id, passCounts: nextCounts };
}

function outputText(outputs: Record<string, string[]>, id: string): string {
  return (outputs[id] ?? []).map((output, index, all) =>
    all.length > 1 ? `Run ${index + 1}:\n${output}` : output,
  ).join('\n\n');
}

function expandOutputs(text: string, outputs: Record<string, string[]>): string {
  return text.replace(/\{\{output:([a-z][a-z0-9_-]*)\}\}/g, (_match, id: string) => outputText(outputs, id));
}

export function renderPlaybookDirective(
  step: PlaybookStep,
  outputs: Record<string, string[]>,
  options: {
    nativeSkills: boolean;
    taskContext: string;
    promptContent?: (key: string) => string;
    skillBody?: string | null;
    resumeNote?: string | null;
    /** Harness-owned lifecycle context, distinct from user-authored directives. */
    harnessNote?: string | null;
    findings?: string;
  },
): string {
  let directive: string;
  if (step.directive.kind === 'skill') {
    const args = expandOutputs(step.directive.args ?? '', outputs).trim();
    if (options.nativeSkills) {
      directive = `/${step.directive.name}${args ? ` ${args}` : ''}`;
      // Claude's deterministic command invocation requires /skill at byte zero.
      directive = [directive, options.taskContext].filter(Boolean).join('\n\n');
    } else {
      directive = [
        options.skillBody ? `Follow this skill:\n\n${options.skillBody}` : `Follow the ${step.directive.name} skill.`,
        args,
      ].filter(Boolean).join('\n\n');
    }
  } else {
    const raw = step.directive.promptKey
      ? options.promptContent?.(step.directive.promptKey) ?? ''
      : step.directive.text ?? '';
    directive = expandOutputs(raw, outputs).replaceAll('{{findings}}', options.findings ?? '');
  }
  if (step.directive.kind !== 'skill' || !options.nativeSkills) {
    directive = [options.taskContext, directive].filter(Boolean).join('\n\n');
  }
  if (options.resumeNote?.trim()) {
    directive = `${directive}\n\nUser note at resume:\n${options.resumeNote.trim()}`;
  }
  if (options.harnessNote?.trim()) {
    directive = `${directive}\n\n${options.harnessNote.trim()}`;
  }
  return directive;
}

export function parsePassCounts(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, count]) => Number.isInteger(count) && Number(count) >= 0));
  } catch {
    return {};
  }
}
