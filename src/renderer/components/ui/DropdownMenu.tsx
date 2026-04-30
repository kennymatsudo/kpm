import * as RadixDropdown from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Z_INDEX } from '../../constants/zIndex';

export type DropdownPosition =
  | { type: 'point'; x: number; y: number }
  | { type: 'anchor'; anchor: DOMRect; placement?: 'bottom' | 'top' | 'right' | 'left' };

interface DropdownMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: DropdownPosition | null;
  children: ReactNode;
  className?: string;
  zIndex?: number;
  minWidth?: number;
}

function DropdownMenuRoot({ isOpen, onClose, position, children, className = '', zIndex = Z_INDEX.dropdown, minWidth = 160 }: DropdownMenuProps) {
  // Derive a virtual x/y point for both position types.
  // Radix handles viewport collision via avoidCollisions + collisionPadding.
  let virtualX = 0;
  let virtualY = 0;
  if (position?.type === 'point') {
    virtualX = position.x;
    virtualY = position.y;
  } else if (position?.type === 'anchor') {
    const gap = 4;
    virtualX = position.anchor.left;
    virtualY = position.anchor.bottom + gap;
  }

  // Render the fixed-position anchor into document.body so any CSS transforms
  // on ancestors (e.g. canvas pan/zoom) don't disturb Radix's positioning math.
  const anchor =
    typeof document !== 'undefined'
      ? createPortal(
          <RadixDropdown.Trigger asChild>
            <div
              style={{
                position: 'fixed',
                left: virtualX,
                top: virtualY,
                width: 0,
                height: 0,
                pointerEvents: 'none',
              }}
            />
          </RadixDropdown.Trigger>,
          document.body
        )
      : null;

  return (
    <RadixDropdown.Root
      open={isOpen && !!position}
      onOpenChange={(open) => !open && onClose()}
      modal={false}
    >
      {anchor}
      <RadixDropdown.Portal>
        <RadixDropdown.Content
          className={`dropdown-menu ${className}`}
          style={{ minWidth: `${minWidth}px`, zIndex }}
          align="start"
          sideOffset={0}
          collisionPadding={8}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {children}
        </RadixDropdown.Content>
      </RadixDropdown.Portal>
    </RadixDropdown.Root>
  );
}

interface DropdownMenuItemProps {
  onClick?: () => void;
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
    <RadixDropdown.Item
      className={`dropdown-item ${variantClasses[variant]} ${
        disabled ? 'opacity-40 cursor-not-allowed' : ''
      } ${className}`}
      disabled={disabled}
      title={title}
      onSelect={(e) => {
        if (!closeOnClick) e.preventDefault();
        onClick?.();
      }}
    >
      {icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>}
      <span className="flex-1 text-left">{children}</span>
      {shortcut && (
          {shortcut}
        </kbd>
      )}
    </RadixDropdown.Item>
  );
}

function DropdownMenuSeparator() {
  return <RadixDropdown.Separator className="dropdown-separator" />;
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
    <RadixDropdown.Sub>
      <RadixDropdown.SubTrigger
        className={`dropdown-item w-full justify-between ${
          highlighted ? 'dropdown-item-accent' : ''
        }`}
      >
        <span className="flex items-center gap-2">
          {icon && (
            <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>
          )}
          <span>{trigger}</span>
        </span>
        <svg
          className="w-4 h-4 text-text-tertiary shrink-0"
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
      </RadixDropdown.SubTrigger>
      <RadixDropdown.Portal>
        <RadixDropdown.SubContent
          className="dropdown-menu py-1"
          style={{ minWidth: `${minWidth}px`, zIndex: Z_INDEX.dropdown + 10 }}
          collisionPadding={8}
        >
          {children}
        </RadixDropdown.SubContent>
      </RadixDropdown.Portal>
    </RadixDropdown.Sub>
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
    <RadixDropdown.Item
      className={`dropdown-item w-full ${selected ? 'dropdown-item-accent' : ''} ${className}`}
      onSelect={() => onClick?.()}
    >
      {children}
    </RadixDropdown.Item>
  );
}

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Submenu: DropdownMenuSubmenu,
  SubmenuItem: DropdownMenuSubmenuItem,
});

