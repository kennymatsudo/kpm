/**
 * MCP tool documentation for system prompts.
 *
 * Design principle: Decision tree over exhaustive docs.
 * Tools are self-documenting via MCP; the system prompt guides when to use them.
 * Detailed action schemas live in tool descriptions, not here.
 */

import type { ChatApprovalMode } from '../../../shared/appSettings';

/**
 * Tool decision tree - compact routing guide.
 */
export function buildToolDecisionTree(projectId: string, approvalMode: ChatApprovalMode): string {

  return `## Tools

}
