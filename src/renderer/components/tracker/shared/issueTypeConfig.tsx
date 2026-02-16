import type { ReactNode } from 'react';

interface IssueTypeStyle {
  icon: ReactNode;
  bg: string;
  text: string;
}

const iconClass = 'w-3 h-3';

export const ISSUE_TYPE_CONFIG: Record<string, IssueTypeStyle> = {
  Epic: {
    icon: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    bg: 'bg-accent-muted',
    text: 'text-accent',
  },
  Story: {
    icon: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    bg: 'bg-success-muted',
    text: 'text-success',
  },
  Task: {
    icon: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    bg: 'bg-info-muted',
    text: 'text-info',
  },
  Bug: {
    icon: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    bg: 'bg-danger-muted',
    text: 'text-danger',
  },
  'Sub-task': {
    icon: (
      <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-5a1 1 0 01-1-1v-4z" />
      </svg>
    ),
    bg: 'bg-surface-3',
    text: 'text-text-secondary',
  },
};

const DEFAULT_STYLE: IssueTypeStyle = {
  icon: (
    <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  bg: 'bg-slate-500/20',
  text: 'text-slate-300',
};

export function getIssueTypeStyle(issueType: string): IssueTypeStyle {
  return ISSUE_TYPE_CONFIG[issueType] || DEFAULT_STYLE;
}
