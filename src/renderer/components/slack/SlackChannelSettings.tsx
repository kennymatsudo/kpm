/**
 * Slack Channel Settings
 *
 * Manages Slack channel links for a project.
 * Used in project settings or as a standalone dialog.
 */

import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSlackTriageStore } from '../../stores';
import type { SlackChannelLink } from '../../../shared/types';

interface SlackChannelSettingsProps {
  projectId: string;
}

export function SlackChannelSettings({ projectId }: SlackChannelSettingsProps) {
  const { channelLinks, isLoadingLinks, error } = useSlackTriageStore(
    useShallow((s) => ({
      channelLinks: s.channelLinks,
      isLoadingLinks: s.isLoadingLinks,
      error: s.error,
    }))
  );
  const loadLinks = useSlackTriageStore((s) => s.loadLinks);
  const deleteLink = useSlackTriageStore((s) => s.deleteLink);
  const createLink = useSlackTriageStore((s) => s.createLink);

  const [isAdding, setIsAdding] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
  }, [projectId, loadLinks]);

  const normalizedName = channelInput.replace(/^#/, '').trim();

  const handleAdd = async () => {
    if (!normalizedName) return;
    setIsSaving(true);
    const link = await createLink(projectId, normalizedName, normalizedName);
    setIsSaving(false);
    if (link) {
      setChannelInput('');
      setIsAdding(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Slack Channels</h3>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="btn text-xs px-2 py-1 bg-accent/10 text-accent hover:bg-accent/20"
          >
            Add Channel
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-danger mb-2">{error}</div>
      )}

      {isAdding && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-text-muted">#</span>
          <input
            type="text"
            value={channelInput}
            onChange={(e) => setChannelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setIsAdding(false); setChannelInput(''); }
            }}
            placeholder="channel-name"
            className="flex-1 text-sm bg-surface-1 border border-border-default rounded px-2 py-1 text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
            autoFocus
          />
          <button
            onClick={handleAdd}
            disabled={!normalizedName || isSaving}
            className="btn text-xs px-2 py-1 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {isSaving ? 'Adding...' : 'Add'}
          </button>
          <button
            onClick={() => { setIsAdding(false); setChannelInput(''); }}
            className="text-xs text-text-muted hover:text-text-secondary px-1 py-1"
          >
            Cancel
          </button>
        </div>
      )}

      {isLoadingLinks ? (
        <div className="text-xs text-text-muted">Loading...</div>
      ) : channelLinks.length === 0 && !isAdding ? (
        <div className="text-xs text-text-muted py-4 text-center">
          No Slack channels linked. Add a channel to enable triage.
        </div>
      ) : (
        <div className="space-y-1.5">
          {channelLinks.map((link) => (
            <ChannelLinkRow
              key={link.id}
              link={link}
              onDelete={() => deleteLink(link.id, projectId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ChannelLinkRow({ link, onDelete }: { link: SlackChannelLink; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-center justify-between p-2 rounded-lg border border-border-default bg-surface-1 group">
      <div className="min-w-0">
        <span className="text-sm text-text-primary font-medium">#{link.channel_name}</span>
        {link.last_checked_ts && (
          <span className="text-xxs text-text-muted ml-2">Last checked</span>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {confirmDelete ? (
          <>
            <button
              onClick={onDelete}
              className="text-xxs px-1.5 py-0.5 text-danger hover:bg-danger/10 rounded"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xxs px-1.5 py-0.5 text-text-muted hover:bg-surface-3 rounded"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1 text-text-muted hover:text-danger rounded"
            title="Remove channel"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
