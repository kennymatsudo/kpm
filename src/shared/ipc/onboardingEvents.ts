/**
 * Onboarding domain event registry (main -> renderer push events).
 *
 * Covers `onboarding:progress`/`onboarding:thinking`/`onboarding:complete`/
 * `onboarding:error`, streamed from `handlers/onboarding.ts`'s `generate`
 * endpoint during AGENTS.md/CLAUDE.md generation. Not invoke endpoints —
 * see `onboardingEndpoints.ts` for the invoke surface.
 */

import { payloadOf, type EventDefinition } from './appEvents';

export interface OnboardingProgressEventData {
  taskId: string;
  message: string;
}

export interface OnboardingThinkingEventData {
  taskId: string;
  text: string;
}

export interface OnboardingCompleteEventData {
  taskId: string;
  content: string;
}

export interface OnboardingErrorEventData {
  taskId: string;
  error: string;
}

export const onboardingEvents = {
  progress: { channel: 'onboarding:progress', payload: payloadOf<OnboardingProgressEventData>() },
  thinking: { channel: 'onboarding:thinking', payload: payloadOf<OnboardingThinkingEventData>() },
  complete: { channel: 'onboarding:complete', payload: payloadOf<OnboardingCompleteEventData>() },
  error: { channel: 'onboarding:error', payload: payloadOf<OnboardingErrorEventData>() },
} satisfies Record<string, EventDefinition>;

export type OnboardingEvents = typeof onboardingEvents;
export type OnboardingEventName = keyof OnboardingEvents;
