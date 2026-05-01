import { createContext, useContext, type ReactNode } from 'react';
import { Z_INDEX } from '../../constants/zIndex';

/**
 * Tracks the current "modal layer" z-index so descendants (popovers, tooltips)
 * can stack above the nearest modal ancestor without each call site hard-coding
 * a number. Default is `Z_INDEX.dropdown` — i.e. there is no modal above us.
 *
 * `Modal` provides its own zIndex; floating descendants read this and add a
 * small offset.
 */
const ModalLayerContext = createContext<number>(Z_INDEX.dropdown);

export function useModalLayer(): number {
  return useContext(ModalLayerContext);
}

interface ModalLayerProviderProps {
  zIndex: number;
  children: ReactNode;
}

export function ModalLayerProvider({ zIndex, children }: ModalLayerProviderProps) {
  return <ModalLayerContext.Provider value={zIndex}>{children}</ModalLayerContext.Provider>;
}
