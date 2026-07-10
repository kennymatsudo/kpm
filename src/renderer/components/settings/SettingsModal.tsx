import { useMemo, useEffect } from 'react';
import { m } from 'framer-motion';
import { Modal, ModalHeader } from '../ui/Modal';
import { SETTINGS_TABS } from './settingsTabs';
import { useSettingsUIStore } from '../../stores';

interface Props {
  onClose: () => void;
  currentProjectId?: string | null;
}

export function SettingsModal({ onClose, currentProjectId }: Props) {
  const { activeTab, setActiveTab, setVisibleTabIds } = useSettingsUIStore();

  const tabs = useMemo(
    () => SETTINGS_TABS.filter((tab) => !tab.requiresProject || currentProjectId),
    [currentProjectId]
  );

  useEffect(() => {
    setVisibleTabIds(tabs.map((tab) => tab.id));
  }, [tabs, setVisibleTabIds]);

  const activeDef = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="2xl"
      aria-labelledby="settings-title"
      className="!overflow-hidden flex flex-col !h-[80vh]"
    >
      <div className="shrink-0">
        <ModalHeader id="settings-title" onClose={onClose}>
          Settings
        </ModalHeader>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar nav */}
        <nav
          className="w-48 shrink-0 border-r border-border-subtle py-2 bg-surface-2/30"
          role="tablist"
          aria-label="Settings sections"
        >
          {tabs.map((tab) => (
            <NavItem
              key={tab.id}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              icon={tab.icon}
            >
              {tab.label}
            </NavItem>
          ))}
        </nav>

        {/* Content */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto ${activeDef?.noPadding ? 'p-0' : 'px-5 pb-5 pt-4'}`}
          style={{ scrollbarGutter: 'stable' }}
        >
          {activeDef?.render({ currentProjectId })}
        </div>
      </div>
    </Modal>
  );
}

interface NavItemProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function NavItem({ active, onClick, icon, children }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`
        relative flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors duration-150
        ${active
          ? 'text-text-primary bg-surface-elevated font-medium'
          : 'text-text-muted hover:text-text-secondary hover:bg-surface-3/50'
        }
      `}
    >
      {active && (
        <m.div
          layoutId="settings-nav-indicator"
          className="absolute left-0 inset-y-1.5 w-0.5 bg-accent rounded-full"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <span className={`shrink-0 transition-colors ${active ? 'text-accent' : ''}`}>
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </button>
  );
}
