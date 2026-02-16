import { useState, useRef } from 'react';

export function useAddMenu() {
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  function toggleAddMenu(): void {
    setIsAddMenuOpen((prev) => !prev);
  }

  function closeAddMenu(): void {
    setIsAddMenuOpen(false);
  }

  return {
    addButtonRef,
    isAddMenuOpen,
    toggleAddMenu,
    closeAddMenu,
  };
}
