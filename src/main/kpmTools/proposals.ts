import { EventEmitter } from 'events';
import type { PlanAction } from '../../shared/types';

export interface PlanActionsEvent {
  projectId: string;
  chatSessionId: string;
  actions: PlanAction[];
}

export interface PlanActionsProposal extends PlanActionsEvent {
  type: 'plan-actions';
}

export interface ProjectContextUpdateProposal {
  type: 'project-context-update';
  projectId: string;
  chatSessionId?: string;
  filename: string;
  oldContent: string | null;
  newContent: string;
}

export interface DocumentUpdateProposal {
  type: 'document-update';
  projectId: string;
  chatSessionId?: string;
  filePath: string;
  content: string;
  oldContent: string | null;
}

export interface FileMoveProposal {
  type: 'file-move';
  projectId: string;
  chatSessionId?: string;
  sourcePath: string;
  targetPath: string;
}

export interface FileDeleteProposal {
  type: 'file-delete';
  projectId: string;
  chatSessionId?: string;
  path: string;
  isDirectory: boolean;
}

export type KpmToolProposal =
  | PlanActionsProposal
  | ProjectContextUpdateProposal
  | DocumentUpdateProposal
  | FileMoveProposal
  | FileDeleteProposal;

export interface KpmToolProposalSink {
  propose: (proposal: KpmToolProposal) => void;
}

export type KpmToolProposalCallback = (proposal: KpmToolProposal) => void;

const proposalEmitter = new EventEmitter();
const PROPOSAL_EVENT = 'proposal';

/**
 * Default process-local sink for first-party KPM tool proposals.
 *
 * Runtime instances receive a sink explicitly; this implementation preserves
 * the existing app-wide fan-out path for chat sessions and scheduled loops.
 */
export const processKpmToolProposalSink: KpmToolProposalSink = {
  propose: (proposal) => {
    proposalEmitter.emit(PROPOSAL_EVENT, proposal);
  },
};

export function subscribeToKpmToolProposals(callback: KpmToolProposalCallback): () => void {
  proposalEmitter.on(PROPOSAL_EVENT, callback);
  return () => proposalEmitter.off(PROPOSAL_EVENT, callback);
}

