/**
 * KPM's answer to the SDK's `request_user_dialog` control request.
 *
 * The CLI can ask its host to render a blocking dialog. KPM has no renderer for
 * these — they are Claude Code / claude.ai UI surfaces, not KPM's — so every
 * dialog is declined and the CLI falls back to that dialog's default behavior.
 *
 * This has to be wired explicitly: up to SDK 0.3.220 the SDK answered dialogs as
 * cancelled on its own when the host provided no `onUserDialog`. Since 0.3.228 an
 * unanswered dialog is instead left parked for a renderer-bearing client to
 * settle, which for KPM means the turn hangs until the worker's park deadline.
 */
import type { OnUserDialog } from '@anthropic-ai/claude-agent-sdk';

export const declineHostDialogs: OnUserDialog = () => Promise.resolve({ behavior: 'cancelled' });
