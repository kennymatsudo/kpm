
interface Props {
  onClose: () => void;
  currentProjectId?: string | null;
}


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
  children: React.ReactNode;
}

  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`
        ${active
        }
      `}
    >
    </button>
  );
}
