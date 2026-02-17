/**
 * Briefing Store
 *
 * State management for the "What should I do next?" briefing system.
 */

import { create } from 'zustand';
import type { BriefingResult } from '../../shared/types';

interface BriefingState {
  briefings: Record<string, BriefingResult>;
  isLoading: boolean;
  error: string | null;
  isModalOpen: boolean;

  generateBriefing: (projectId: string) => Promise<void>;
  loadBriefing: (projectId: string) => Promise<boolean>;
  openModal: () => void;
  closeModal: () => void;
  reset: () => void;
}


      }

      }


