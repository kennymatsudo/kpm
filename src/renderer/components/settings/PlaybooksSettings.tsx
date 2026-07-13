import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatPlaybookStepTitle,
  getPlaybookLoops,
  getPlaybookValidationIssues,
  type AgentCandidate,
  type BoardProvider,
  type Playbook,
  type PlaybookLoop,
  type PlaybookStep,
  type PlaybookValidationIssue,
} from '../../../shared/playbooks';
import type { SlashCommandInfo } from '../../../shared/types';
import {
  createPlaybook,
  deletePlaybook,
  duplicatePlaybook,
  listBoardProviders,
  listPlaybooks,
  listPlaybookSkills,
  setDefaultPlaybook,
  updatePlaybook,
} from '../../services/playbookService';
import { toast } from '../../stores';
import { usePromptOverrideStore } from '../../stores/promptOverrideStore';
import { ChevronRightIcon } from '../icons/ChevronRightIcon';
import { PromptEditorSettings } from './PromptEditorSettings';
import {
  addAgentCandidate,
  earlierOutputStepIds,
  insertOutputToken,
  moveAgentCandidate,
  removeAgentCandidate,
  updateAgentCandidate,
} from './playbookEditor';

function PlaybookFlowSummary({ playbook }: { playbook: Playbook }) {
  return (
    <div className="mt-1 flex items-center gap-1 text-tiny text-text-secondary" aria-label={`${playbook.steps.length} step playbook`}>
      {playbook.steps.map((step, index) => (
        <span key={step.id} className="flex items-center gap-1">
          {index > 0 && <ChevronRightIcon className="h-3 w-3 text-text-muted" />}
          <span className="inline-flex items-center gap-0.5" title={describePlaybookStep(step, index)}>
            <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
              {step.runs
                ? <><circle cx="4" cy="4" r="2.25" fill="none" stroke="currentColor" /><circle cx="8" cy="8" r="2.25" fill="none" stroke="currentColor" /></>
                : <circle cx="6" cy="6" r="3.5" fill={step.session === 'main' ? 'currentColor' : 'none'} stroke="currentColor" />}
            </svg>
            {step.runs && <span>{step.runs.length}</span>}
            {step.onFindings && (
              <span className="inline-flex items-center gap-0.5" title={`Up to ${step.onFindings.maxPasses} passes`}>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M9.5 5A3.75 3.75 0 1 1 8 2" strokeLinecap="round" />
                  <path d="M8 1.5v2h2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {step.onFindings.maxPasses}
              </span>
            )}
          </span>
        </span>
      ))}
    </div>
  );
}

function describePlaybookStep(step: PlaybookStep, index: number, includeRoute = true): string {
  const who = step.runs
    ? `${step.runs.length} subagents in parallel`
    : step.session === 'main' ? 'main session' : 'subagent';
  const route = includeRoute && step.onFindings
    ? ` · if findings, continue to ${formatPlaybookStepTitle(step.onFindings.goto)}`
    : '';
  return `${index + 1}  ${formatPlaybookStepTitle(step.id)} — ${who}${route}`;
}

function LoopGroup({ loop, children }: { loop: PlaybookLoop; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/[0.04] p-2">
      <div className="mb-2 flex items-center gap-1.5 px-1 text-tiny font-medium text-accent">
        <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M9.5 5A3.75 3.75 0 1 1 8 2" strokeLinecap="round" />
          <path d="M8 1.5v2h2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Repeat until clean · up to {loop.maxPasses}×</span>
      </div>
      <div className="space-y-2">{children}</div>
      <div className="mt-2 px-1 text-tiny text-text-muted">otherwise {loop.onMaxPasses === 'pause' ? 'pause' : 'continue'}</div>
    </div>
  );
}

function candidateObject(candidate: AgentCandidate | undefined): AgentCandidate {
  return candidate ?? { provider: 'claude' };
}

function uniqueId(steps: PlaybookStep[], base: string): string {
  let id = base;
  let index = 2;
  while (steps.some((step) => step.id === id)) id = `${base}-${index++}`;
  return id;
}

function stepTemplate(kind: string, steps: PlaybookStep[]): PlaybookStep {
  const firstMain = steps.some((step) => step.session === 'main');
  const commonMain = {
    id: uniqueId(steps, 'implement'), session: 'main' as const,
    ...(!firstMain ? { agents: [{ provider: 'claude' }], systemPromptKey: 'agents.implementation_system' } : {}),
    directive: { kind: 'prompt' as const, text: '' },
  };
  switch (kind) {
    case 'review': return { id: uniqueId(steps, 'review'), session: 'subagent', agents: [{ provider: 'codex' }], systemPromptKey: 'agents.review_system', directive: { kind: 'prompt' }, verdict: 'findings' };
    case 'address': return { ...commonMain, id: uniqueId(steps, 'address'), directive: { kind: 'prompt', promptKey: 'agents.review_assessment' } };
    case 'skill': return { ...commonMain, id: uniqueId(steps, 'skill'), directive: { kind: 'skill', name: 'tdd' } };
    case 'fanout': return { id: uniqueId(steps, 'review'), session: 'subagent', runs: [[{ provider: 'codex' }], [{ provider: 'claude' }]], systemPromptKey: 'agents.review_system', directive: { kind: 'prompt' }, verdict: 'findings' };
    case 'synthesize': return { id: uniqueId(steps, 'synthesize'), session: 'subagent', agents: [{ provider: 'claude' }], systemPromptKey: 'agents.review_system', directive: { kind: 'prompt', text: `Synthesize {{output:${steps.at(-1)?.id ?? 'review'}}}` }, verdict: 'findings' };
    case 'pause': return { ...commonMain, id: uniqueId(steps, 'approval'), pauseBefore: true };
    default: return firstMain ? { ...commonMain, id: uniqueId(steps, 'step') } : commonMain;
  }
}

export function PlaybooksSettings() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [defaultId, setDefaultId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Playbook | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [providers, setProviders] = useState<BoardProvider[]>([]);
  const [skills, setSkills] = useState<SlashCommandInfo[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [subTab, setSubTab] = useState<'playbooks' | 'instructions'>('playbooks');
  const setPromptCategory = usePromptOverrideStore((s) => s.setCategory);

  useEffect(() => {
    if (subTab === 'instructions') setPromptCategory('agents');
  }, [subTab, setPromptCategory]);

  const reload = useCallback(async () => {
    const response = await listPlaybooks();
    if (!response.success) return toast.error(response.error);
    setPlaybooks(response.playbooks);
    setDefaultId(response.defaultId);
    setSelectedId((current) => current || response.defaultId || response.playbooks[0]?.id || '');
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    void listBoardProviders().then((response) => response.success && setProviders(response.providers));
    void listPlaybookSkills().then((response) => response.success && setSkills(response.skills));
  }, []);
  useEffect(() => {
    const selected = playbooks.find((playbook) => playbook.id === selectedId);
    setDraft(selected ? structuredClone(selected) : null);
    setExpanded(null);
  }, [playbooks, selectedId]);

  const issues = useMemo(() => draft ? getPlaybookValidationIssues(draft) : [], [draft]);
  const loops = useMemo(() => draft ? getPlaybookLoops(draft) : [], [draft]);

  const patchStep = (id: string, patch: Partial<PlaybookStep>) => setDraft((current) => current && ({
    ...current,
    steps: current.steps.map((step) => step.id === id ? { ...step, ...patch } : step),
  }));

  const save = async () => {
    if (!draft || issues.length || draft.builtIn) return;
    const response = await updatePlaybook({ id: draft.id, name: draft.name, steps: draft.steps });
    if (!response.success) return toast.error(response.error);
    toast.success('Playbook saved');
    await reload();
  };

  const duplicate = async (id: string) => {
    const response = await duplicatePlaybook(id);
    if (!response.success) return toast.error(response.error);
    await reload();
    setSelectedId(response.playbook.id);
  };

  const create = async () => {
    const response = await createPlaybook({ name: 'New playbook', steps: [stepTemplate('blank', [])] });
    if (!response.success) return toast.error(response.error);
    await reload();
    setSelectedId(response.playbook.id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 border-b border-border-subtle bg-surface-2/30 px-3 pt-2">
        <PlaybookSubTab active={subTab === 'playbooks'} onClick={() => setSubTab('playbooks')}>Playbooks</PlaybookSubTab>
        <PlaybookSubTab active={subTab === 'instructions'} onClick={() => setSubTab('instructions')}>Role instructions</PlaybookSubTab>
      </div>
      {subTab === 'instructions' ? (
        <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
          <PromptEditorSettings />
        </div>
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
      <aside className="overflow-y-auto border-r border-border-subtle bg-surface-2/30 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div><h3 className="text-sm font-medium text-text-primary">Playbooks</h3><p className="text-tiny text-text-muted">Changes apply to new runs.</p></div>
          <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-accent transition-colors hover:bg-accent-subtle" onClick={() => void create()}>
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New
          </button>
        </div>
        <div className="space-y-1.5">
          {playbooks.map((playbook) => {
            const disconnected = playbook.steps.some((step) => [...(step.agents ?? []), ...(step.runs?.flat() ?? [])].some((candidate) => providers.some((provider) => provider.id === candidate.provider && !provider.available)));
            return (
              <button key={playbook.id} onClick={() => setSelectedId(playbook.id)} className={`w-full rounded-lg border p-2.5 text-left ${selectedId === playbook.id ? 'border-accent bg-accent/10' : 'border-border-subtle bg-surface-1 hover:bg-surface-2'}`}>
                <div className="flex items-center gap-2"><input aria-label={`Default ${playbook.name}`} type="radio" checked={defaultId === playbook.id} onChange={(event) => { event.stopPropagation(); void setDefaultPlaybook(playbook.id).then(() => { setDefaultId(playbook.id); }); }} /><span className="min-w-0 flex-1 truncate text-sm text-text-primary">{playbook.name}</span></div>
                <div className="mt-1 flex items-center gap-1 text-tiny text-text-muted"><span>{playbook.builtIn ? 'Built-in' : 'Custom'}</span>{disconnected && <span className="text-warning">Provider unavailable</span>}</div>
                <PlaybookFlowSummary playbook={playbook} />
              </button>
            );
          })}
        </div>
      </aside>

      <main className="min-h-0 overflow-y-auto p-5">
        {!draft ? <p className="text-sm text-text-muted">Select a playbook.</p> : (
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex items-center gap-3">
              <input value={draft.name} disabled={draft.builtIn} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="input min-w-0 flex-1 font-medium" />
              {draft.builtIn ? <button className="btn btn-secondary" onClick={() => void duplicate(draft.id)}>Duplicate to edit</button> : <button className="btn btn-primary" disabled={issues.length > 0} onClick={() => void save()}>{issues.length ? `Fix ${issues.length} issues` : 'Save'}</button>}
              {!draft.builtIn && <button className="btn text-danger hover:bg-danger-muted/50" onClick={async () => { const response = await deletePlaybook(draft.id); if (!response.success) return toast.error(response.error); await reload(); setSelectedId(defaultId); }}>Delete</button>}
            </div>
            {issues.length > 0 && <div className="mb-3 rounded-lg border border-danger/40 bg-danger-muted p-3 text-xs text-danger"><div className="font-medium">Fix the highlighted playbook structure before saving.</div>{issues.slice(0, 3).map((issue, index) => <div key={`${issue.message}-${index}`}>{issue.message}</div>)}{issues.length > 3 && <div>{issues.length - 3} more</div>}</div>}

            <div className="space-y-2">
              {(() => {
                const renderStep = (step: PlaybookStep, index: number, insideLoop: boolean) => {
                const firstMain = draft.steps.find((entry) => entry.session === 'main')?.id === step.id;
                const canOwnMainIdentity = !draft.steps.some((entry) => entry.session === 'main' && entry.id !== step.id);
                const stepIssues = issues.filter((issue) => issue.stepId === step.id);
                const unreachableIssues = stepIssues.filter((issue) => issue.kind === 'step');
                const routeIssues = stepIssues.filter((issue) => issue.kind === 'route');
                const hasStructuralError = unreachableIssues.length > 0 || routeIssues.length > 0;
                return (
                  <section key={step.id} className={`overflow-hidden rounded-xl border bg-surface-1 ${hasStructuralError ? 'border-l-4 border-danger' : 'border-border-subtle'}`}>
                    <button className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-text-primary transition-colors hover:bg-surface-2" onClick={() => setExpanded(expanded === step.id ? null : step.id)} aria-expanded={expanded === step.id}><ChevronRightIcon className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${expanded === step.id ? 'rotate-90' : ''}`} /><span className="min-w-0 flex-1">{describePlaybookStep(step, index, !insideLoop)}</span></button>
                    {unreachableIssues.map((issue) => <AnchoredIssue key={issue.message} issue={issue} />)}
                    {routeIssues.map((issue) => <AnchoredIssue key={`${issue.field}-${issue.message}`} issue={issue} />)}
                    {expanded === step.id && <div className="space-y-3 border-t border-border-subtle px-4 py-4 text-sm">
                      <Row label="Runs as"><select disabled={draft.builtIn} value={step.session} onChange={(event) => patchStep(step.id, { session: event.target.value as PlaybookStep['session'], ...(event.target.value === 'main' ? { runs: undefined, writes: undefined, agents: canOwnMainIdentity ? step.agents ?? [{ provider: 'claude' }] : undefined, systemPromptKey: canOwnMainIdentity ? step.systemPromptKey ?? 'agents.implementation_system' : undefined } : { systemPromptKey: step.systemPromptKey ?? 'agents.review_system', agents: step.agents ?? [{ provider: 'claude' }] }) })} className="input"><option value="main">Main</option><option value="subagent">Subagent</option></select></Row>
                      {(step.session === 'subagent' || firstMain) && <Row label="Agents"><AgentEditor step={step} providers={providers} disabled={draft.builtIn} onChange={(patch) => patchStep(step.id, patch)} /></Row>}
                      {(step.session === 'subagent' || firstMain) && <Row label="Role instructions"><select disabled={draft.builtIn} value={step.systemPromptKey ?? ''} onChange={(event) => patchStep(step.id, { systemPromptKey: event.target.value || undefined })} className="input w-full"><option value="agents.implementation_system">Implement changes</option><option value="agents.review_system">Review changes</option>{step.systemPromptKey && !['agents.implementation_system', 'agents.review_system'].includes(step.systemPromptKey) && <option value={step.systemPromptKey}>Saved instruction set</option>}</select></Row>}
                      <Row label="Task">
                        <div className="space-y-2">
                          <select disabled={draft.builtIn} value={step.directive.kind} onChange={(event) => patchStep(step.id, { directive: event.target.value === 'skill' ? { kind: 'skill', name: skills[0]?.name ?? 'tdd' } : { kind: 'prompt', text: '' } })} className="input"><option value="prompt">Instructions</option><option value="skill">Skill</option></select>
                          {step.directive.kind === 'skill' ? <>
                            <select disabled={draft.builtIn} value={step.directive.name} onChange={(event) => patchStep(step.id, { directive: { kind: 'skill', name: event.target.value, args: step.directive.kind === 'skill' ? step.directive.args : undefined } })} className="input"><option value={step.directive.name}>{step.directive.name}</option>{skills.filter((skill) => skill.name !== (step.directive.kind === 'skill' ? step.directive.name : '')).map((skill) => <option key={skill.name} value={skill.name}>{skill.name}</option>)}</select>
                            <input disabled={draft.builtIn} value={step.directive.args ?? ''} onChange={(event) => patchStep(step.id, { directive: { kind: 'skill', name: step.directive.kind === 'skill' ? step.directive.name : 'tdd', args: event.target.value || undefined } })} className="input w-full" placeholder="Arguments; use an earlier step's output if needed" />
                          </> : <>
                            <select disabled={draft.builtIn} value={step.directive.promptKey ?? 'custom'} onChange={(event) => patchStep(step.id, { directive: event.target.value === 'agents.review_assessment' ? { kind: 'prompt', promptKey: 'agents.review_assessment' } : { kind: 'prompt', text: step.directive.kind === 'prompt' ? step.directive.text ?? '' : '' } })} className="input w-full"><option value="custom">Custom instructions</option><option value="agents.review_assessment">Assess and address review findings</option>{step.directive.promptKey && step.directive.promptKey !== 'agents.review_assessment' && <option value={step.directive.promptKey}>Saved step instructions</option>}</select>
                            {!step.directive.promptKey && <PromptTextEditor step={step} steps={draft.steps} issues={stepIssues} disabled={draft.builtIn} onChange={(text) => patchStep(step.id, { directive: { kind: 'prompt', text } })} />}
                          </>}
                        </div>
                      </Row>
                      {step.session === 'subagent' && <Row label="Findings check"><div className="space-y-2"><label className="flex gap-2"><input disabled={draft.builtIn} type="checkbox" checked={step.verdict === 'findings'} onChange={(event) => patchStep(step.id, event.target.checked ? { verdict: 'findings' } : { verdict: undefined, onFindings: undefined })} />Machine-readable findings</label>{step.verdict === 'findings' && <div className="flex flex-wrap items-center gap-2"><span>If findings, continue to</span><select disabled={draft.builtIn} value={step.onFindings?.goto ?? ''} onChange={(event) => patchStep(step.id, { onFindings: event.target.value ? { goto: event.target.value, maxPasses: step.onFindings?.maxPasses ?? 1, onMaxPasses: step.onFindings?.onMaxPasses ?? 'pause' } : undefined })} className="input"><option value="">No route</option>{draft.steps.filter((entry) => entry.id !== step.id).map((entry) => <option key={entry.id} value={entry.id}>{formatPlaybookStepTitle(entry.id)}</option>)}</select>{step.onFindings && <><span>max</span><input disabled={draft.builtIn} type="number" min={1} value={step.onFindings.maxPasses} onChange={(event) => patchStep(step.id, { onFindings: { ...step.onFindings!, maxPasses: Math.max(1, Number(event.target.value)) } })} className="input w-16" /><select disabled={draft.builtIn} value={step.onFindings.onMaxPasses} onChange={(event) => patchStep(step.id, { onFindings: { ...step.onFindings!, onMaxPasses: event.target.value as 'pause' | 'proceed' } })} className="input"><option value="pause">Pause</option><option value="proceed">Proceed</option></select></>}</div>}</div></Row>}
                      <Row label="More"><div className="grid gap-2 sm:grid-cols-3"><select disabled={draft.builtIn} value={step.next ?? ''} onChange={(event) => patchStep(step.id, { next: event.target.value || undefined })} className="input"><option value="">Next in list</option>{draft.steps.map((entry) => <option key={entry.id} value={entry.id}>{formatPlaybookStepTitle(entry.id)}</option>)}</select><label><input disabled={draft.builtIn} type="checkbox" checked={Boolean(step.pauseBefore)} onChange={(event) => patchStep(step.id, { pauseBefore: event.target.checked ? true : undefined })} /> Wait for me first</label>{step.session === 'subagent' && !step.runs && <label><input disabled={draft.builtIn} type="checkbox" checked={Boolean(step.writes)} onChange={(event) => patchStep(step.id, { writes: event.target.checked ? true : undefined })} /> Can edit files</label>}</div></Row>
                      {!draft.builtIn && <button className="text-xs text-danger hover:underline" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((entry) => entry.id !== step.id) })}>Remove step</button>}
                    </div>}
                  </section>
                );
                };
                const loopByStart = new Map(loops.map((loop) => [loop.startIndex, loop] as const));
                const blocks: React.ReactNode[] = [];
                for (let index = 0; index < draft.steps.length;) {
                  const loop = loopByStart.get(index);
                  if (loop) {
                    blocks.push(
                      <LoopGroup key={`loop-${draft.steps[index].id}`} loop={loop}>
                        {draft.steps.slice(index, loop.endIndex + 1).map((step, offset) => renderStep(step, index + offset, true))}
                      </LoopGroup>,
                    );
                    index = loop.endIndex + 1;
                  } else {
                    blocks.push(renderStep(draft.steps[index], index, false));
                    index += 1;
                  }
                }
                return blocks;
              })()}
            </div>
            {!draft.builtIn && <div className="relative mt-3"><button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-accent transition-colors hover:bg-accent-subtle" onClick={() => setShowAdd(!showAdd)}><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>Add step</button>{showAdd && <div className="absolute z-10 mt-1 w-56 rounded-lg border border-border-subtle bg-surface-elevated p-1 shadow-lg">{[['review','Review the work'],['address','Address findings'],['skill','Run my skill'],['fanout','Ask several agents'],['synthesize','Synthesize reports'],['pause','Pause for approval'],['blank','Blank step']].map(([kind, label]) => <button key={kind} className="dropdown-item w-full text-left" onClick={() => { setDraft({ ...draft, steps: [...draft.steps, stepTemplate(kind, draft.steps)] }); setShowAdd(false); }}>{label}</button>)}</div>}</div>}
          </div>
        )}
      </main>
      </div>
      )}
    </div>
  );
}

function PlaybookSubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${active ? '-mb-px border-b-2 border-accent text-accent' : 'text-text-muted hover:text-text-secondary'}`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)]"><label className="text-xs font-medium text-text-muted">{label}</label><div>{children}</div></div>;
}

function AgentEditor({ step, providers, disabled, onChange }: { step: PlaybookStep; providers: BoardProvider[]; disabled: boolean; onChange: (patch: Partial<PlaybookStep>) => void }) {
  const chains = step.runs ?? [step.agents ?? [{ provider: 'claude' }]];
  const apply = (next: PlaybookStep) => onChange({ agents: next.agents, runs: next.runs });
  return (
    <div className="space-y-3">
      <label className="flex gap-2"><input disabled={disabled || step.session !== 'subagent'} type="checkbox" checked={Boolean(step.runs)} onChange={(event) => onChange(event.target.checked ? { runs: chains.length > 1 ? chains : [chains[0], [{ provider: 'claude' }]], agents: undefined, writes: undefined } : { agents: chains[0], runs: undefined })} /> Run in parallel ({chains.length})</label>
      {chains.map((chain, runIndex) => (
        <div key={runIndex} className="rounded-lg border border-border-subtle bg-surface-2/40 p-2">
          <div className="mb-2 text-tiny font-medium text-text-muted">{step.runs ? `Run ${runIndex + 1} fallback order` : 'Fallback order'}</div>
          <div className="space-y-2">
            {chain.map((rawCandidate, candidateIndex) => {
              const candidate = candidateObject(rawCandidate);
              const provider = providers.find((entry) => entry.id === candidate.provider);
              return (
                <div key={candidateIndex} className="rounded-md border border-border-subtle bg-surface-1 p-2">
                  <div className="mb-2 flex items-center gap-1 text-tiny text-text-muted">
                    <span className="rounded-full bg-surface-3 px-2 py-0.5">{candidateIndex + 1}</span>
                    <span className="mr-auto">{provider?.name ?? candidate.provider}</span>
                    <button type="button" disabled={disabled || candidateIndex === 0} onClick={() => apply(moveAgentCandidate(step, runIndex, candidateIndex, -1))} className="rounded px-1.5 py-0.5 transition-colors hover:bg-surface-3 disabled:opacity-30" aria-label="Move candidate up">Up</button>
                    <button type="button" disabled={disabled || candidateIndex === chain.length - 1} onClick={() => apply(moveAgentCandidate(step, runIndex, candidateIndex, 1))} className="rounded px-1.5 py-0.5 transition-colors hover:bg-surface-3 disabled:opacity-30" aria-label="Move candidate down">Down</button>
                    <button type="button" disabled={disabled || chain.length === 1} onClick={() => apply(removeAgentCandidate(step, runIndex, candidateIndex))} className="rounded px-1.5 py-0.5 text-danger transition-colors hover:bg-danger-muted/50 disabled:opacity-30">Remove</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select disabled={disabled} value={candidate.provider} onChange={(event) => apply(updateAgentCandidate(step, runIndex, candidateIndex, { provider: event.target.value }))} className="input">{providers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}{entry.available ? '' : ' (unavailable)'}</option>)}</select>
                    <select disabled={disabled} value={candidate.model ?? provider?.models.find((model) => model.isDefault)?.id ?? ''} onChange={(event) => apply(updateAgentCandidate(step, runIndex, candidateIndex, { ...candidate, model: event.target.value }))} className="input">{provider?.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select>
                    <select disabled={disabled} value={candidate.effort ?? ''} onChange={(event) => apply(updateAgentCandidate(step, runIndex, candidateIndex, { ...candidate, effort: (event.target.value || undefined) as typeof candidate.effort }))} className="input"><option value="">Default effort</option>{['low','medium','high','xhigh','max'].map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select>
                  </div>
                </div>
              );
            })}
          </div>
          {!disabled && <button type="button" className="mt-2 text-xs text-accent hover:underline" onClick={() => apply(addAgentCandidate(step, runIndex))}>Add fallback candidate</button>}
        </div>
      ))}
      {step.runs && !disabled && <button type="button" className="text-xs text-accent hover:underline" onClick={() => onChange({ runs: [...chains, [{ provider: 'claude' }]], agents: undefined })}>Add parallel run</button>}
    </div>
  );
}

function AnchoredIssue({ issue }: { issue: PlaybookValidationIssue }) {
  return <div className="border-t border-danger/30 bg-danger-muted px-4 py-1.5 text-xs text-danger">{issue.message}</div>;
}

function PromptTextEditor({ step, steps, issues, disabled, onChange }: { step: PlaybookStep; steps: PlaybookStep[]; issues: PlaybookValidationIssue[]; disabled: boolean; onChange: (text: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputIssues = issues.filter((issue) => issue.kind === 'output');
  const suggestions = earlierOutputStepIds(steps, step.id);
  const text = step.directive.kind === 'prompt' ? step.directive.text ?? '' : '';
  const insert = (sourceStepId: string) => {
    const textarea = textareaRef.current;
    const result = insertOutputToken(text, sourceStepId, textarea?.selectionStart, textarea?.selectionEnd);
    onChange(result.text);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(result.caret, result.caret);
    });
  };
  return <div className="space-y-1.5">
    <textarea ref={textareaRef} disabled={disabled} value={text} onChange={(event) => onChange(event.target.value)} className={`input min-h-20 w-full ${outputIssues.length ? 'border-danger ring-1 ring-danger' : ''}`} placeholder="Describe what this step should accomplish" />
    {suggestions.length > 0 && <div className="flex flex-wrap items-center gap-1"><span className="text-tiny text-text-muted">Insert output</span>{suggestions.map((id) => <button key={id} type="button" disabled={disabled} onClick={() => insert(id)} className="rounded-full border border-border-subtle bg-surface-2 px-2 py-0.5 text-tiny text-text-secondary hover:border-accent">{formatPlaybookStepTitle(id)}</button>)}</div>}
    {outputIssues.map((issue) => <div key={`${issue.token}-${issue.message}`} className="text-xs text-danger">{issue.token}: {issue.message}</div>)}
  </div>;
}
