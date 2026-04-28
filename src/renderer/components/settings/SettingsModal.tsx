import { useMemo, useEffect } from 'react';
import { m } from 'framer-motion';
import { Modal, ModalHeader } from '../ui/Modal';
import { WorkflowSettings } from './WorkflowSettings';
import { PermissionsSettings } from './PermissionsSettings';
import { PromptsSettings } from './PromptsSettings';
import { useSettingsUIStore, type SettingsTab } from '../../stores';

interface Props {
  onClose: () => void;
  currentProjectId?: string | null;
}

const allTabs: { id: SettingsTab; label: string; icon: React.ReactNode; requiresProject?: boolean }[] = [
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      </svg>
    ),
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      </svg>
    ),
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      </svg>
    ),
  },
  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      </svg>
    ),
  },
  {
    id: 'prompts',
    label: 'Prompts',
    requiresProject: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      </svg>
    ),
  },
  {
    id: 'permissions',
    label: 'Permissions',
    requiresProject: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
];

  const { activeTab, setActiveTab, setVisibleTabCount } = useSettingsUIStore();

  const tabs = useMemo(() => {
    return allTabs.filter((tab) => !tab.requiresProject || currentProjectId);
  }, [currentProjectId]);

  useEffect(() => {
    setVisibleTabCount(tabs.length);
  }, [tabs.length, setVisibleTabCount]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="2xl"
      aria-labelledby="settings-title"
      className="!overflow-hidden flex flex-col !h-[80vh]"
    >


          {activeTab === 'permissions' && currentProjectId && (
            <PermissionsSettings currentProjectId={currentProjectId} />
          )}
        </div>
    </Modal>
  );
}

  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}

  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`
        ${active
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-3/50'
        }
      `}
    >
      {active && (
        <m.div
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
    </button>
  );
}
