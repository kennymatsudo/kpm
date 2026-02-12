import { Z_INDEX } from '../../constants/zIndex';


interface DropdownMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: DropdownPosition | null;
  children: ReactNode;
  className?: string;
  zIndex?: number;
  minWidth?: number;
}


    >
  );
}

interface DropdownMenuItemProps {
  children: ReactNode;
  icon?: ReactNode;
  variant?: 'default' | 'danger' | 'accent';
  disabled?: boolean;
  title?: string;
  closeOnClick?: boolean;
  className?: string;
  shortcut?: string;
}

function DropdownMenuItem({
  onClick,
  children,
  icon,
  variant = 'default',
  disabled = false,
  title,
  closeOnClick = true,
  className = '',
  shortcut,
}: DropdownMenuItemProps) {
  const variantClasses = {
    default: '',
    danger: 'dropdown-item-danger',
    accent: 'dropdown-item-accent',
  };

  return (
      disabled={disabled}
      title={title}
    >
      {icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>}
      <span className="flex-1 text-left">{children}</span>
      {shortcut && (
          {shortcut}
        </kbd>
      )}
  );
}

function DropdownMenuSeparator() {
}

interface DropdownMenuSubmenuProps {
  trigger: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  minWidth?: number;
  highlighted?: boolean;
}

function DropdownMenuSubmenu({
  trigger,
  icon,
  children,
  minWidth = 180,
  highlighted = false,
}: DropdownMenuSubmenuProps) {
  return (
          highlighted ? 'dropdown-item-accent' : ''
        }`}
      >
        <span className="flex items-center gap-2">
          <span>{trigger}</span>
        </span>
        <svg
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5l7 7-7 7"
          />
        </svg>
  );
}

interface DropdownMenuSubmenuItemProps {
  onClick?: () => void;
  children: ReactNode;
  selected?: boolean;
  className?: string;
}

function DropdownMenuSubmenuItem({
  onClick,
  children,
  selected = false,
  className = '',
}: DropdownMenuSubmenuItemProps) {
  return (
    >
      {children}
  );
}

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Submenu: DropdownMenuSubmenu,
  SubmenuItem: DropdownMenuSubmenuItem,
});

