/**
 * SessionNextActionBar - The session's single "what to do next" strip.
 *
 * Renders a `NextAction` produced by `derivePanelStatus` for any phase of the
 * session lifecycle (implementing, reviewing, addressing, the post-run decision
 * point, review queue, failure recovery). Generalizes the Review tab's original
 * per-tab next-action bar to the whole session so there is one consistent place
 * that answers "what's next".
 *
 * Presentational only: it emits semantic `PanelActionId`s via `onAction`; the
 * container maps those to handlers. `pendingAction` marks the in-flight button.
 */

import { memo } from 'react';
import { CloseIcon } from '../icons/CloseIcon';
import type { NextAction, NextActionButton, PanelActionId } from './panelStatus';

interface SessionNextActionBarProps {
  action: NextAction;
  /** Receives the action id and the button element (for popover anchoring). */
  onAction: (id: PanelActionId, triggerEl: HTMLElement) => void;
  /** The action id currently running, so its button shows a spinner + disables. */
  pendingAction?: PanelActionId | null;
}

const TONE_CLASS: Record<NextAction['tone'], string> = {
  accent: 'border-accent/30 bg-accent/8',
  danger: 'border-danger/30 bg-danger/8',
  warning: 'border-warning/30 bg-warning/8',
  info: 'border-info/30 bg-info/8',
  neutral: 'border-border-subtle bg-surface-1',
};

const PRIMARY_BTN =
  'inline-flex h-7 items-center justify-center gap-1.5 rounded border border-accent bg-accent px-2.5 text-xxs font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BTN =
  'inline-flex h-7 items-center justify-center gap-1.5 rounded border border-border-subtle bg-surface-2 px-2.5 text-xxs font-medium text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50';

function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={`shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent ${className ?? 'h-3.5 w-3.5'}`}
      aria-hidden="true"
    />
  );
}

function ActionButton({
  button,
  variant,
  pendingAction,
  onAction,
}: {
  button: NextActionButton;
  variant: 'primary' | 'secondary';
  pendingAction?: PanelActionId | null;
  onAction: (id: PanelActionId, triggerEl: HTMLElement) => void;
}) {
  const isPending = pendingAction === button.action;
  return (
    <button
      type="button"
      disabled={isPending}
      className={variant === 'primary' ? PRIMARY_BTN : SECONDARY_BTN}
      onClick={(e) => onAction(button.action, e.currentTarget)}
    >
      {isPending && <Spinner className="h-3 w-3" />}
      {button.label}
    </button>
  );
}

export const SessionNextActionBar = memo(function SessionNextActionBar({
  action,
  onAction,
  pendingAction,
}: SessionNextActionBarProps) {
  const textClass = action.tone === 'danger' ? 'text-danger' : 'text-text-primary';

  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${TONE_CLASS[action.tone]}`}>
      <div className="flex min-w-0 items-center gap-2">
        {action.busy && <Spinner />}
        <span className="truncate text-xs">
          {!action.busy && <span className="text-text-muted">Next&nbsp;&middot;&nbsp;</span>}
          <span className={`font-medium ${textClass}`}>{action.text}</span>
        </span>
      </div>
      {(action.primary || action.secondary || action.dismissible) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {action.secondary && (
            <ActionButton button={action.secondary} variant="secondary" pendingAction={pendingAction} onAction={onAction} />
          )}
          {action.primary && (
            <ActionButton button={action.primary} variant="primary" pendingAction={pendingAction} onAction={onAction} />
          )}
          {action.dismissible && (
            <button
              type="button"
              disabled={pendingAction === 'dismiss'}
              aria-label="Dismiss"
              title="Dismiss — clears this state without re-running or committing"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              onClick={(e) => onAction('dismiss', e.currentTarget)}
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});
