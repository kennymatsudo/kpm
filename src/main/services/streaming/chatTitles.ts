/**
 * Chat titles: when a chat gets named, and by what.
 *
 * A chat is titled after its first finished turn and retitled once when it
 * reaches RETITLE_AT_TURN, then left alone so the label stays recognisable.
 * The provider's own summary is used when it has a real one; otherwise one
 * cheap-model call writes the title. A title the user typed is never replaced.
 */

import type { ChatTitleSource } from '../../../shared/types';
import type { GenerationRequest, GenerationResult } from '../../generation';

export const RETITLE_AT_TURN = 4;

const MAX_TITLE_CHARS = 60;
// A provider "summary" longer than this is a user prompt standing in for one.
const MAX_PROVIDER_SUMMARY_CHARS = 80;
const MAX_TRANSCRIPT_CHARS = 8_000;
const MAX_MESSAGE_CHARS = 1_500;

const SYSTEM_PROMPT = [
  'Write a title for this conversation so it can be told apart from other chats in a list.',
  '3 to 6 words, sentence case, no quotes, no trailing period.',
  'Name the specific subject (the feature, file, ticket, bug, or decision), not generic words like help, question, or discussion.',
  'Reply with the title only.',
].join(' ');

export type TitleStage = 'opening' | 'settled';

export interface TitledChat {
  title: string | null;
  title_source?: ChatTitleSource | null;
  title_turn?: number | null;
  scope?: string | null;
}

export interface ProviderSessionSummary {
  summary?: string;
  firstPrompt?: string;
  customTitle?: string;
}

/** Which title pass, if any, a chat is due after `completedTurns` finished turns. */
export function dueTitleStage(chat: TitledChat, completedTurns: number): TitleStage | null {
  if (chat.title_source === 'user' || completedTurns < 1) return null;
  const stage: TitleStage = completedTurns >= RETITLE_AT_TURN ? 'settled' : 'opening';
  // Titles saved before sources were tracked get one fresh pass.
  if (!chat.title || !chat.title_source) return stage;
  if (stage === 'settled' && (chat.title_turn ?? 0) < RETITLE_AT_TURN) return 'settled';
  return null;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Leading `[Context: …]` view hint that sendChatMessage prepends to the user's
// first turn. The SDK can echo it into its summary.
const CONTEXT_HINT_PREFIX = /^\[Context:[^\]]*\]\s*/;

/**
 * The provider's summary when it is a real one. The Claude SDK fills
 * `summary` with the first prompt when it has no summary, and KPM restarts
 * SDK sessions, so that prompt is often a later message of this chat.
 */
export function providerSummaryTitle(info: ProviderSessionSummary | undefined): string | null {
  if (!info?.summary) return null;
  const summary = collapseWhitespace(info.summary).replace(CONTEXT_HINT_PREFIX, '');
  if (!summary || summary.startsWith('# Focused Selection') || summary.startsWith('Focused Selection')) {
    return null;
  }
  if (info.customTitle && collapseWhitespace(info.customTitle) === summary) return summary;
  if (summary.length > MAX_PROVIDER_SUMMARY_CHARS) return null;
  const firstPrompt = info.firstPrompt && collapseWhitespace(info.firstPrompt).replace(CONTEXT_HINT_PREFIX, '');
  if (firstPrompt?.startsWith(summary.replace(/…$/, ''))) return null;
  return summary;
}

/** One line, unquoted, capped, so a model that ignores the length rule cannot bloat the tab. */
export function normalizeGeneratedTitle(raw: string): string | null {
  const line = raw.split('\n').map((part) => part.trim()).find(Boolean) ?? '';
  const cleaned = line
    .replace(/^title:\s*/i, '')
    .replace(/^["'`*]+|["'`*]+$/g, '')
    .replace(/\.$/, '')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length <= MAX_TITLE_CHARS) return cleaned;
  const cut = cleaned.slice(0, MAX_TITLE_CHARS - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1))}…`;
}

/** The chat's earliest messages, oldest first, within the prompt budget. */
export function buildTitleTranscript(messages: { role: 'user' | 'assistant'; content: string }[]): string {
  const parts: string[] = [];
  let used = 0;
  for (const message of messages) {
    const content = message.content.trim();
    if (!content) continue;
    const clipped = content.length > MAX_MESSAGE_CHARS ? `${content.slice(0, MAX_MESSAGE_CHARS)}…` : content;
    const part = `${message.role === 'user' ? 'User' : 'Assistant'}: ${clipped}`;
    if (used + part.length > MAX_TRANSCRIPT_CHARS) break;
    parts.push(part);
    used += part.length;
  }
  return parts.join('\n\n');
}

export interface ChatTitlerDeps {
  countCompletedTurns(projectId: string, chatSessionId: string): number;
  getChat(chatSessionId: string): TitledChat | undefined;
  getMessages(projectId: string, chatSessionId: string): { role: 'user' | 'assistant'; content: string }[];
  saveTitle(chatSessionId: string, title: string, source: ChatTitleSource, turn: number): void;
  onTitle(projectId: string, chatSessionId: string, title: string): void;
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export interface TurnCompletedInput {
  projectId: string;
  chatSessionId: string;
  /** Present only for providers that keep their own session summary. */
  fetchProviderSummary?: () => Promise<ProviderSessionSummary | undefined>;
}

export function createChatTitler(deps: ChatTitlerDeps) {
  const inFlight = new Set<string>();

  async function resolveTitle(
    input: TurnCompletedInput,
  ): Promise<{ title: string; source: ChatTitleSource } | null> {
    if (input.fetchProviderSummary) {
      try {
        const providerTitle = providerSummaryTitle(await input.fetchProviderSummary());
        if (providerTitle) return { title: providerTitle, source: 'provider' };
      } catch (err) {
        console.warn('[chatTitles] Provider summary lookup failed:', err);
      }
    }

    const transcript = buildTitleTranscript(deps.getMessages(input.projectId, input.chatSessionId));
    if (!transcript) return null;
    const result = await deps.generate({
      purpose: 'chat_title',
      tier: 'cheap',
      systemPrompt: SYSTEM_PROMPT,
      prompt: transcript,
      maxTurns: 1,
      timeoutMs: 30_000,
      timeoutMessage: 'Chat title generation timed out',
      projectId: input.projectId,
    });
    if (result.outcome.status !== 'completed') return null;
    const title = normalizeGeneratedTitle(result.text);
    return title ? { title, source: 'generated' } : null;
  }

  /** Title the chat if this finished turn makes it due. Never throws. */
  async function onTurnCompleted(input: TurnCompletedInput): Promise<void> {
    const { projectId, chatSessionId } = input;
    if (inFlight.has(chatSessionId)) return;
    inFlight.add(chatSessionId);
    try {
      const chat = deps.getChat(chatSessionId);
      if (!chat || (chat.scope && chat.scope !== 'main')) return;
      const completedTurns = deps.countCompletedTurns(projectId, chatSessionId);
      if (!dueTitleStage(chat, completedTurns)) return;

      const resolved = await resolveTitle(input);
      if (!resolved) return;
      // The user may have renamed the chat while the title was being written.
      if (deps.getChat(chatSessionId)?.title_source === 'user') return;

      deps.saveTitle(chatSessionId, resolved.title, resolved.source, completedTurns);
      deps.onTitle(projectId, chatSessionId, resolved.title);
    } catch (err) {
      console.warn('[chatTitles] Titling failed:', err);
    } finally {
      inFlight.delete(chatSessionId);
    }
  }

  return { onTurnCompleted };
}

export type ChatTitler = ReturnType<typeof createChatTitler>;
