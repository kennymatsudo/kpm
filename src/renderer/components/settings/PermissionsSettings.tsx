import { SettingsSection, StatusBadge } from './SettingsSection';
import { useProjectWriteGrant } from './useProjectWriteGrant';

interface Props {
  currentProjectId: string;
}

/** Everything the grant covers, so turning it on here is as informed as
 * answering the prompt in chat. */
const WRITE_ACCESS_COVERAGE = [
  'Creating, editing, and deleting files',
  'Running shell commands',
  'Git operations, including commits and pushing a branch',
  'Scheduled and Cmd+K action runs, which have no chat to ask in',
];

export function PermissionsSettings({ currentProjectId }: Props) {
  const { writesEnabled, grant, revoke } = useProjectWriteGrant(currentProjectId);

  return (
    <div className="space-y-4">
      <SettingsSection
        icon={
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        }
        title="Writes"
        description="Whether agents can change this project's repos directly"
        collapsible={false}
        statusBadge={
          <StatusBadge variant={writesEnabled ? 'success' : 'muted'}>
            {writesEnabled ? 'On' : 'Off'}
          </StatusBadge>
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs text-text-muted">
              Applies to every chat in this project and stays on after a restart. Credential
              and secret files stay out of reach either way, and plan and document edits keep
              going through the approval queue.
            </p>
            <ul className="text-xs text-text-secondary space-y-1">
              {WRITE_ACCESS_COVERAGE.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span
                    className="w-1 h-1 rounded-full bg-text-muted flex-shrink-0 mt-1.5"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={writesEnabled}
            aria-label="Allow writes in this project"
            onClick={() => (writesEnabled ? revoke() : grant())}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${writesEnabled ? 'bg-accent' : 'bg-surface-4'}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${writesEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}
