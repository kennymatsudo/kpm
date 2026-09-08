/**
 * Publish To Linear Modal
 *
 * Creates a Linear document from a local markdown file and links the two.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { MotionButton } from '../ui/MotionButton';
import { LoadingSpinner } from '../ui/LoadingButton';
import { SearchableSelect } from '../tracker/linking/SearchableSelect';
import {
  listLinearTrackerProjects,
  listLinearTrackerTeams,
} from '../../services/trackerService';
import { useLinearDocumentsStore } from '../../stores/linearDocumentsStore';
import { useTrackerStore } from '../../stores/trackerStore';
import type { SyncDirection } from '../../../shared/types';

interface LinearTeam {
  key: string;
  name: string;
}

interface LinearProject {
  id: string;
  name: string;
}

function getConfiguredLinearProjectId(issueFilter: string): string | null {
  try {
    const parsed: unknown = JSON.parse(issueFilter);
    if (!parsed || typeof parsed !== 'object') return null;
    const projectId = (parsed as Record<string, unknown>).projectId;
    return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
  } catch {
    return null;
  }
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  documentPath: string;
  defaultTitle: string;
}

export function PublishToLinearModal({
  isOpen,
  onClose,
  projectId,
  documentPath,
  defaultTitle,
}: Props) {
  const publishDocument = useLinearDocumentsStore((s) => s.publishDocument);
  const { associations, loadAssociations } = useTrackerStore(
    useShallow((state) => ({
      associations: state.associations,
      loadAssociations: state.loadAssociations,
    }))
  );

  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [team, setTeam] = useState<LinearTeam | null>(null);
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [linearProject, setLinearProject] = useState<LinearProject | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [direction, setDirection] = useState<SyncDirection>('two-way');
  const [documentId] = useState(() => crypto.randomUUID());

  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [isLoadingConfiguredTeams, setIsLoadingConfiguredTeams] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configuredLinearAssociations = useMemo(
    () =>
      associations.filter(
        (association) => association.kpm_project_id === projectId && association.tracker_type === 'linear'
      ),
    [associations, projectId]
  );

  const configuredTeams = useMemo<LinearTeam[]>(() => {
    const teamsByKey = new Map<string, LinearTeam>();
    for (const association of configuredLinearAssociations) {
      teamsByKey.set(association.project_key, {
        key: association.project_key,
        name: association.project_name ?? association.project_key,
      });
    }
    return [...teamsByKey.values()];
  }, [configuredLinearAssociations]);

  const availableTeams = configuredTeams.length > 0 ? configuredTeams : teams;
  const hasOneConfiguredTeam = configuredTeams.length === 1;
  const configuredLinearProjectId = useMemo(() => {
    if (!team) return null;
    return (
      configuredLinearAssociations
        .filter((association) => association.project_key === team.key)
        .map((association) => getConfiguredLinearProjectId(association.issue_filter))
        .find((projectId): projectId is string => projectId !== null) ?? null
    );
  }, [configuredLinearAssociations, team]);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(defaultTitle);
  }, [isOpen, defaultTitle]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingConfiguredTeams(true);
    void loadAssociations(projectId).finally(() => {
      if (!cancelled) setIsLoadingConfiguredTeams(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, loadAssociations, projectId]);

  useEffect(() => {
    if (!isOpen || isLoadingConfiguredTeams || configuredTeams.length > 0) return;
    let cancelled = false;
    setIsLoadingTeams(true);
    listLinearTrackerTeams()
      .then((result: { success: boolean; teams?: LinearTeam[]; error?: string }) => {
        if (cancelled) return;
        if (!result.success || !result.teams) {
          setError(result.error || 'Failed to load Linear teams');
          return;
        }
        setTeams(result.teams);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load Linear teams');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTeams(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isLoadingConfiguredTeams, configuredTeams.length]);

  useEffect(() => {
    if (hasOneConfiguredTeam) {
      setTeam(configuredTeams[0]);
      return;
    }
    setTeam((currentTeam) =>
      currentTeam && availableTeams.some((availableTeam) => availableTeam.key === currentTeam.key)
        ? currentTeam
        : null
    );
  }, [availableTeams, configuredTeams, hasOneConfiguredTeam]);

  useEffect(() => {
    if (!team) {
      setProjects([]);
      setLinearProject(null);
      return;
    }
    let cancelled = false;
    setIsLoadingProjects(true);
    listLinearTrackerProjects({ teamKey: team.key })
      .then((result: { success: boolean; projects?: LinearProject[]; error?: string }) => {
        if (cancelled) return;
        const loadedProjects = result.projects;
        if (!result.success || !loadedProjects) {
          setError(result.error || 'Failed to load Linear projects');
          setProjects([]);
          return;
        }
        setProjects(loadedProjects);
        setLinearProject((currentProject) =>
          currentProject ?? loadedProjects.find((project) => project.id === configuredLinearProjectId) ?? null
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load Linear projects');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [team, configuredLinearProjectId]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setError(null);
    setTeam(null);
    setLinearProject(null);
    onClose();
  }, [isSubmitting, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!linearProject) {
      setError('Choose a Linear project to publish into');
      return;
    }
    if (!title.trim()) {
      setError('Give the document a title');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const result = await publishDocument(
      projectId,
      documentPath,
      { kind: 'project', id: linearProject.id },
      title.trim(),
      direction,
      documentId,
    );
    setIsSubmitting(false);

    if (result.success) {
      handleClose();
      return;
    }
    setError(result.error ?? 'Failed to publish to Linear');
  }, [
    linearProject,
    title,
    direction,
    documentId,
    publishDocument,
    projectId,
    documentPath,
    handleClose,
  ]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <ModalHeader id="publish-linear-title" onClose={handleClose}>
        Publish to Linear
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Team</label>
            {isLoadingConfiguredTeams || isLoadingTeams ? (
              <LoadingSpinner />
            ) : hasOneConfiguredTeam ? (
              <div className="input flex items-center text-text-primary" aria-label="Configured Linear team">
                {configuredTeams[0].name}
              </div>
            ) : (
              <SearchableSelect
                options={availableTeams}
                value={team}
                onChange={setTeam}
                getKey={(option) => option.key}
                getLabel={(option) => option.name}
                getMeta={(option) => option.key}
                placeholder="Select a team"
                emptyMessage="No Linear teams found"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Project</label>
            <SearchableSelect
              options={projects}
              value={linearProject}
              onChange={setLinearProject}
              getKey={(option) => option.id}
              getLabel={(option) => option.name}
              placeholder={team ? 'Select a project' : 'Select a team first'}
              emptyMessage={isLoadingProjects ? 'Loading…' : 'No projects in this team'}
              disabled={!team || isLoadingProjects}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-border-subtle rounded-sm
                         text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-text-secondary mb-1.5">
              Which copy wins
            </span>
            <div className="space-y-2">
              <DirectionOption
                checked={direction === 'two-way'}
                onSelect={() => setDirection('two-way')}
                label="Sync both ways"
                description="Edits on either side can be brought across."
              />
              <DirectionOption
                checked={direction === 'push-only'}
                onSelect={() => setDirection('push-only')}
                label="This file is the original"
                description="Linear holds a published copy. Pulling is refused, so an edit made in Linear can never overwrite this file."
              />
            </div>
          </div>

          {error && <div className="text-sm text-danger">{error}</div>}
        </div>
      </ModalBody>
      <ModalFooter>
        <MotionButton variant="secondary" onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </MotionButton>
        <MotionButton variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Publishing…' : 'Publish'}
        </MotionButton>
      </ModalFooter>
    </Modal>
  );
}

function DirectionOption({
  checked,
  onSelect,
  label,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 rounded-sm border transition-colors ${
        checked
          ? 'border-accent bg-accent-muted'
          : 'border-border-subtle hover:border-border-strong'
      }`}
    >
      <span className="block text-sm text-text-primary">{label}</span>
      <span className="block text-xs text-text-muted mt-0.5">{description}</span>
    </button>
  );
}
