import type { AgentCandidate, PlaybookStep } from '../../../shared/playbooks';

function chainsFor(step: PlaybookStep): AgentCandidate[][] {
  return step.runs
    ? step.runs.map((chain) => [...chain])
    : [[...(step.agents ?? [{ provider: 'claude' }])]];
}

function withChains(step: PlaybookStep, chains: AgentCandidate[][]): PlaybookStep {
  if (step.runs) {
    return { ...step, agents: undefined, runs: chains };
  }
  return { ...step, agents: chains[0], runs: undefined };
}

export function updateAgentCandidate(
  step: PlaybookStep,
  runIndex: number,
  candidateIndex: number,
  candidate: AgentCandidate,
): PlaybookStep {
  const chains = chainsFor(step);
  const chain = chains[runIndex];
  if (!chain?.[candidateIndex]) return step;
  chain[candidateIndex] = candidate;
  return withChains(step, chains);
}

export function addAgentCandidate(
  step: PlaybookStep,
  runIndex: number,
  candidate: AgentCandidate = { provider: 'claude' },
): PlaybookStep {
  const chains = chainsFor(step);
  if (!chains[runIndex]) return step;
  chains[runIndex].push(candidate);
  return withChains(step, chains);
}

export function removeAgentCandidate(
  step: PlaybookStep,
  runIndex: number,
  candidateIndex: number,
): PlaybookStep {
  const chains = chainsFor(step);
  const chain = chains[runIndex];
  if (!chain || chain.length <= 1) return step;
  chain.splice(candidateIndex, 1);
  return withChains(step, chains);
}

export function moveAgentCandidate(
  step: PlaybookStep,
  runIndex: number,
  candidateIndex: number,
  direction: -1 | 1,
): PlaybookStep {
  const chains = chainsFor(step);
  const chain = chains[runIndex];
  const target = candidateIndex + direction;
  if (!chain || target < 0 || target >= chain.length) return step;
  [chain[candidateIndex], chain[target]] = [chain[target], chain[candidateIndex]];
  return withChains(step, chains);
}

export function earlierOutputStepIds(steps: PlaybookStep[], currentStepId: string): string[] {
  const index = steps.findIndex((step) => step.id === currentStepId);
  return index <= 0 ? [] : steps.slice(0, index).map((step) => step.id);
}

export function insertOutputToken(
  text: string,
  stepId: string,
  selectionStart = text.length,
  selectionEnd = selectionStart,
): { text: string; caret: number } {
  const token = `{{output:${stepId}}}`;
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  return {
    text: `${text.slice(0, start)}${token}${text.slice(end)}`,
    caret: start + token.length,
  };
}
