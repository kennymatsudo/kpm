
interface Props {
  onClose: () => void;
  currentProjectId?: string | null;
}

  {
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      </svg>
    ),
  },
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      </svg>
    ),
  },
  {
];


  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="2xl"
      aria-labelledby="settings-title"
    >


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
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
    </button>
  );
}
