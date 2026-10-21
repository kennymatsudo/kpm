/**
 * Commit message generation from a session's uncommitted diff. Shared by the
 * manual commit composer and the playbook's per-step auto-commit, so every
 * commit on a task branch describes its own changes rather than repeating the
 * task title.
 */

import { runGeneration } from '../../generation';
import { getConfig } from '../../config';
import { failure, success, type AsyncResult } from '../result';

const MAX_DIFF_CHARS = 16000;

export interface CommitMessageInput {
  /** `git diff HEAD` of the worktree: the uncommitted changes. */
  diff: string;
  taskTitle: string;
  externalKey?: string;
  /** The user's `generation.commit_message_instructions` prompt. */
  instructions: string;
  projectId: string;
}

export async function generateCommitMessage(input: CommitMessageInput): AsyncResult<string> {
  const rawDiff = input.diff.trim();
  // With no diff the model has nothing to describe and answers with prose like
  // "I don't see any changes", which must never become a commit message.
  // `git diff HEAD` omits untracked files, so a change that only adds files
  // lands here too and takes the caller's fallback.
  if (!rawDiff) {
    return failure('No tracked changes to describe');
  }
  const diff = rawDiff.length > MAX_DIFF_CHARS
    ? `${rawDiff.slice(0, MAX_DIFF_CHARS)}\n\n…(diff truncated)`
    : rawDiff;

  const contextLines: string[] = [`Task: ${input.taskTitle}`];
  if (input.externalKey) {
    contextLines.push(`Ticket key: ${input.externalKey}`);
  }

  const prompt = `Generate a git commit message for these changes:\n\n${contextLines.join('\n')}\n\nDiff (staged + unstaged vs HEAD):\n\`\`\`diff\n${diff}\n\`\`\`\n\n${input.instructions}`;

  try {
    const result = await runGeneration({
      purpose: 'commit_message',
      tier: 'cheap',
      systemPrompt:
        'You generate descriptive git commit messages. Return only the commit message — no explanation, no code fences.',
      prompt,
      timeoutMs: getConfig().generation.prGenerationTimeoutMs,
      timeoutMessage: 'Commit message generation timed out',
      projectId: input.projectId,
    });
    const message = result.text.trim();
    if (result.outcome.status !== 'completed' || !message) {
      return failure(result.outcome.detail ?? 'Commit message generation returned no message');
    }
    return success(message);
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}
