import type { ReactNode, RefObject } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Z_INDEX } from '../../constants/zIndex';

interface PaletteShellProps {
  onClose: () => void;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Extra content rendered to the right of the search input (e.g. loading spinner, ESC badge) */
  searchExtra?: ReactNode;
  /** Footer content rendered below the results */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Shared shell for palette-style overlays (command palette, global search).
 * Provides the overlay backdrop, animated panel, search input, and footer.
 */
export function PaletteShell({
  onClose,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  inputRef,
  searchExtra,
  footer,
  children,
}: PaletteShellProps) {
  return (
    <AnimatePresence>
      <m.div
        className="fixed inset-0 flex items-start justify-center pt-[15vh]"
        style={{ background: 'var(--overlay-color)', backdropFilter: 'blur(8px)', zIndex: Z_INDEX.palette }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0" onClick={onClose} />

        {/* Panel */}
        <m.div
          className="relative w-full max-w-2xl mx-4"
          initial={{ opacity: 0, scale: 0.96, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        >
          <div
            className="bg-surface-elevated rounded-2xl overflow-hidden"
            style={{
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Search Input */}
            <div className="relative border-b border-border-default">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                autoFocus
                className="w-full pl-14 pr-20 py-4.5 bg-transparent text-text-primary text-base
                         placeholder:text-text-muted focus:outline-none
                         font-medium tracking-tight"
              />
              {searchExtra && (
                <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {searchExtra}
                </div>
              )}
            </div>

            {/* Content */}
            {children}

            {/* Footer */}
            {footer}
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}
