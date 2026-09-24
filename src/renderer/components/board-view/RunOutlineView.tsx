/**
 * RunOutlineView - one card per step that has run, showing what it concluded.
 *
 * Measured facts (provider, cost, pass status) sit in the card header as plain
 * metadata. Anything the agent says about its own work (its report, its reply
 * to a finding, its criteria status) is set off with a left rule, so a claim
 * never reads like something KPM observed.
 */

import { memo, useState } from 'react';
import { Markdown } from 'markdown-to-jsx';
import { markdownOptions } from '../../utils/markdown';
import { formatCurrency } from '../../utils/usageFormatters';
import { CheckIcon, SpinnerIcon } from '../icons';
import type { CriterionState } from '../../../shared/agentReportBlocks';
import type {
  CriterionOutline,
  OutlineFinding,
  ReviewPassOutline,
  RunOutline,
  StepOutline,
} from './runOutline';

const PROVIDER_NAMES: Record<string, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', pi: 'pi' };
const REPORT_PREVIEW_CHARS = 320;

function providerName(provider: string): string {
  return provider.split(', ').map((id) => PROVIDER_NAMES[id] ?? id).join(', ');
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`h-3 w-3 shrink-0 text-text-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function StepStatusMark({ status }: { status: StepOutline['status'] }) {
  if (status === 'running') return <SpinnerIcon className="h-3 w-3 shrink-0 animate-spin text-accent" />;
  if (status === 'failed') {
    return (
      <svg className="h-3 w-3 shrink-0 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Failed">
        <path strokeLinecap="round" strokeWidth={2.5} d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  return <CheckIcon className="h-3 w-3 shrink-0 text-success" />;
}

const SEVERITY_LABEL: Record<OutlineFinding['severity'], string> = {
  critical: 'Critical',
  warning: 'Warning',
  suggestion: 'Suggestion',
};

function SeverityDot({ severity }: { severity: OutlineFinding['severity'] }) {
  const tone = severity === 'critical'
    ? 'bg-danger border-danger'
    : severity === 'warning'
      ? 'bg-warning border-warning'
      : 'bg-transparent border-text-muted';
  return (
    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full border ${tone}`} title={SEVERITY_LABEL[severity]}>
      <span className="sr-only">{SEVERITY_LABEL[severity]}</span>
    </span>
  );
}

function outcomeTone(step: StepOutline): string {
  if (step.status === 'failed') return 'text-danger';
  const latest = step.passes.at(-1);
  if (latest?.status !== 'complete') return 'text-text-muted';
  const unresolvedBlocking = latest.findings.some((finding) => finding.severity !== 'suggestion' && finding.disposition !== 'fixed');
  const anyReply = latest.findings.some((finding) => finding.disposition);
  if (unresolvedBlocking && !anyReply) return 'text-warning';
  return 'text-text-secondary';
}

const Report = memo(function Report({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > REPORT_PREVIEW_CHARS;
  return (
    <div className="mx-4 mb-3 border-l-2 border-border-subtle pl-3">
      <div className={`prose text-xs leading-relaxed text-text-secondary ${long && !expanded ? 'max-h-[5.5rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]' : ''}`}>
        <Markdown options={markdownOptions}>{text}</Markdown>
      </div>
      {long && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-tiny text-text-muted hover:text-text-secondary">
          {expanded ? 'Show less' : 'Show full report'}
        </button>
      )}
    </div>
  );
});

function Disposition({ finding, passHasReplies }: { finding: OutlineFinding; passHasReplies: boolean }) {
  if (finding.disposition === 'fixed') return <span className="shrink-0 text-tiny font-medium text-success">Fixed</span>;
  if (finding.disposition === 'declined') return <span className="shrink-0 text-tiny font-medium text-text-muted">Declined</span>;
  return passHasReplies ? <span className="shrink-0 text-tiny text-text-tertiary">No reply</span> : null;
}

const FindingRow = memo(function FindingRow({ finding, passHasReplies }: { finding: OutlineFinding; passHasReplies: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : null;
  return (
    <li className="flex gap-2.5 px-4 py-1.5">
      <SeverityDot severity={finding.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {location
            ? <span className="min-w-0 truncate font-mono text-tiny text-text-muted" title={location}>{location}</span>
            : <span className="text-tiny text-text-tertiary">{SEVERITY_LABEL[finding.severity]}</span>}
          <span className="ml-auto" />
          <Disposition finding={finding} passHasReplies={passHasReplies} />
        </div>
        <button type="button" onClick={() => setExpanded((value) => !value)} className="block w-full text-left">
          <p className={`text-xs leading-relaxed text-text-secondary ${expanded ? '' : 'line-clamp-2'}`}>{finding.description}</p>
        </button>
        {finding.reason && (
          <p className="mt-1 border-l border-border-subtle pl-2 text-tiny leading-relaxed text-text-muted">{finding.reason}</p>
        )}
      </div>
    </li>
  );
});

const AXIS_TITLES = [
  { axis: 'standards', title: 'Standards' },
  { axis: 'spec', title: 'Spec' },
  { axis: null, title: 'Other' },
] as const;

function findingSections(findings: OutlineFinding[]): { title: string | null; findings: OutlineFinding[] }[] {
  const tagged = findings.some((finding) => finding.axis === 'standards' || finding.axis === 'spec');
  if (!tagged) return [{ title: null, findings }];
  return AXIS_TITLES
    .map(({ axis, title }) => ({
      title,
      findings: findings.filter((finding) => (
        axis === null ? finding.axis == null || finding.axis === 'general' : finding.axis === axis
      )),
    }))
    .filter((section) => section.findings.length > 0);
}

function PassBody({ pass }: { pass: ReviewPassOutline }) {
  if (pass.status === 'running') return <p className="px-4 pb-3 text-xs text-text-muted">Reviewing the changes</p>;
  if (pass.status === 'failed') return <p className="px-4 pb-3 text-xs text-danger">{pass.error ?? 'The review did not finish.'}</p>;
  if (pass.findings.length === 0) return <p className="px-4 pb-3 text-xs text-text-muted">No findings</p>;
  const passHasReplies = pass.findings.some((finding) => finding.disposition);
  return (
    <div className="pb-2">
      {findingSections(pass.findings).map((section) => (
        <div key={section.title ?? 'all'}>
          {section.title && <div className="px-4 pb-0.5 pt-1.5 text-tiny font-medium text-text-muted">{section.title}</div>}
          <ul>
            {section.findings.map((finding) => <FindingRow key={finding.id} finding={finding} passHasReplies={passHasReplies} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Passes({ passes }: { passes: ReviewPassOutline[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const shown = index ?? passes.length - 1;
  const pass = passes[shown];
  if (!pass) return null;
  return (
    <>
      {passes.length > 1 && (
        <div className="flex items-center gap-2 px-4 pb-1 text-tiny text-text-muted">
          <button type="button" disabled={shown === 0} onClick={() => setIndex(shown - 1)} className="px-1 hover:text-text-secondary disabled:opacity-40" aria-label="Previous pass">‹</button>
          <span className="tabular-nums">Pass {shown + 1} of {passes.length}</span>
          <button type="button" disabled={shown === passes.length - 1} onClick={() => setIndex(shown + 1)} className="px-1 hover:text-text-secondary disabled:opacity-40" aria-label="Next pass">›</button>
        </div>
      )}
      <PassBody pass={pass} />
    </>
  );
}

const StepCard = memo(function StepCard({ step }: { step: StepOutline }) {
  const [open, setOpen] = useState(true);
  const hasBody = Boolean(step.report) || step.passes.length > 0;
  return (
    <section data-step-id={step.stepId} className="border-b border-border-subtle/40">
      <button
        type="button"
        onClick={() => hasBody && setOpen((value) => !value)}
        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left ${hasBody ? 'hover:bg-surface-2' : 'cursor-default'}`}
        aria-expanded={hasBody ? open : undefined}
      >
        <StepStatusMark status={step.status} />
        <span className="text-tiny font-medium uppercase tracking-wide text-text-primary">{step.title}</span>
        {step.provider && <span className="text-tiny text-text-muted">{providerName(step.provider)}</span>}
        {step.outcome && <span className={`truncate text-tiny ${outcomeTone(step)}`}>· {step.outcome}</span>}
        <span className="ml-auto" />
        {step.cost != null && <span className="shrink-0 text-tiny tabular-nums text-text-muted">{formatCurrency(step.cost)}</span>}
        {hasBody && <Chevron open={open} />}
      </button>
      {open && step.report && <Report text={step.report} />}
      {open && step.passes.length > 0 && <Passes passes={step.passes} />}
    </section>
  );
});

function CriterionMark({ state }: { state: CriterionState | null }) {
  if (state === 'met') return <CheckIcon className="mt-0.5 h-3 w-3 shrink-0 text-success" />;
  if (state === 'unmet') {
    return (
      <svg className="mt-0.5 h-3 w-3 shrink-0 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeWidth={2.5} d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  if (state === 'partial') {
    return (
      <svg className="mt-0.5 h-3 w-3 shrink-0 text-warning" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={2} />
        <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className={`mt-0.5 h-3 w-3 shrink-0 ${state === 'unverified' ? 'text-warning' : 'text-text-tertiary'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" strokeWidth={2} strokeDasharray={state === 'unverified' ? '3 3' : undefined} />
    </svg>
  );
}

const CRITERION_STATE_LABEL: Record<CriterionState, string> = {
  met: 'Met',
  partial: 'Partly met',
  unmet: 'Not met',
  unverified: 'Not verified',
};

const CriteriaCard = memo(function CriteriaCard({ criteria }: { criteria: CriterionOutline[] }) {
  const met = criteria.filter((criterion) => criterion.state === 'met').length;
  const [open, setOpen] = useState(met < criteria.length);
  return (
    <section className="border-b border-border-subtle/40">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2" aria-expanded={open}>
        <span className="text-tiny font-medium uppercase tracking-wide text-text-primary">Acceptance criteria</span>
        <span className={`text-tiny ${met === criteria.length ? 'text-success' : 'text-warning'}`}>· {met} of {criteria.length} met</span>
        <span className="ml-auto" />
        <Chevron open={open} />
      </button>
      {open && (
        <ul className="mx-4 mb-3 space-y-1.5 border-l-2 border-border-subtle pl-3">
          {criteria.map((criterion, index) => (
            <li key={index} className="flex items-start gap-2">
              <CriterionMark state={criterion.state} />
              <div className="min-w-0 flex-1 text-xs leading-relaxed">
                <span className="text-text-primary">{criterion.text}</span>
                {criterion.state && criterion.state !== 'met' && (
                  <span className="ml-1.5 text-tiny text-text-muted">{CRITERION_STATE_LABEL[criterion.state]}</span>
                )}
                {!criterion.state && <span className="ml-1.5 text-tiny text-text-tertiary">No status</span>}
                {criterion.note && <p className="text-tiny text-text-muted">{criterion.note}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

export const RunOutlineView = memo(function RunOutlineView({ outline }: { outline: RunOutline }) {
  if (outline.steps.length === 0 && !outline.criteria) return null;
  return (
    <div>
      {outline.criteria && <CriteriaCard criteria={outline.criteria} />}
      {outline.steps.map((step) => <StepCard key={step.stepId} step={step} />)}
    </div>
  );
});
