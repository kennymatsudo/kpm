/**
 * Briefing Store
 *
 * State management for the "What should I do next?" briefing system.
 */

import { create } from 'zustand';
import type { BriefingResult } from '../../shared/types';

interface BriefingState {
  isLoading: boolean;
  error: string | null;
  isModalOpen: boolean;

  generateBriefing: (projectId: string) => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  reset: () => void;
}


      }


