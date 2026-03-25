import { useShallow } from 'zustand/react/shallow';
import {
  useBriefingStore,
  useChatStore,
  useProjectUiDomainStore,
} from '../../stores';
import type { FocusedResource } from '../../../shared/types';
import { getBaseName } from '../../utils/path';

interface WorkspaceHomeProps {
  onShowChat: () => void;
}

}

function getResourceLabel(resource: FocusedResource): string {
  switch (resource.type) {
    case 'plan_item':
    case 'document':
      return resource.title;
    case 'project_file':
      return getBaseName(resource.path, resource.path);
    case 'repo':
      return resource.path ? getBaseName(resource.path, resource.path) : 'Repository';
  }
}

function getResourceTypeLabel(resource: FocusedResource): string {
  switch (resource.type) {
    case 'plan_item':
      return 'Plan item';
    case 'project_file':
      return 'Project file';
    case 'repo':
      return resource.path ? 'Repo file' : 'Repo';
    case 'document':
      return 'Document';
  }
}

export function WorkspaceHome({ onShowChat }: WorkspaceHomeProps) {
  const openBriefing = useBriefingStore((state) => state.openModal);
    useShallow((state) => {
      const viewedSession = state.viewedSessionId
        ? state.sessions.get(state.viewedSessionId) ?? null
        : null;

      return {
        viewedSessionId: state.viewedSessionId,
        viewedSessionMessageCount: viewedSession?.messages.length ?? 0,
      };
    })
  );

  const hasConversation = viewedSessionId !== null && viewedSessionMessageCount > 0;
  const contextPreview = useMemo(() => focusedResources.slice(0, 4), [focusedResources]);

  return (
          </div>
          </div>

            </div>
          )}
        </div>
    </div>
  );
}
