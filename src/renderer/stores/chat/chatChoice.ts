/**
 * Reads of a Chat's model choice.
 *
 * The choice is the only per-session record of provider, model, and effort —
 * main owns it and `chat:send` no longer carries any of it. Until the choice
 * for a freshly opened session arrives, these fall back to the KPM-wide
 * default so the header has something honest to show.
 */

import type { ChatChoiceView, ChatModelDescriptor, ChatProvider } from '../../../shared/types';

interface ChoiceHolder {
  choice?: ChatChoiceView | null;
}

export function sessionProvider(session: ChoiceHolder | null | undefined, fallback: ChatProvider): ChatProvider {
  return session?.choice?.selected.provider ?? fallback;
}

export function sessionModelId(session: ChoiceHolder | null | undefined, fallback: string): string {
  return session?.choice?.selected.model ?? fallback;
}

function selectedDescriptor(choice: ChatChoiceView | null | undefined): ChatModelDescriptor | undefined {
  if (!choice) return undefined;
  return choice.providers
    .find((provider) => provider.provider === choice.selected.provider)
    ?.models.find((model) => model.id === choice.selected.model);
}

export function sessionContextWindow(session: ChoiceHolder | null | undefined): number | undefined {
  return selectedDescriptor(session?.choice)?.contextWindow;
}
