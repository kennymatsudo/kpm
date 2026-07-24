import type { PerSessionState } from './types';

export function resolveSessionDisplayModel(
  session: Pick<PerSessionState, 'provider' | 'model' | 'codexModel' | 'piProviderModel' | 'choice'>,
): string {
  if (session.choice) return session.choice.selected.model;
  if (session.provider === 'pi' && session.piProviderModel) return session.piProviderModel;
  if (session.provider === 'codex' && session.codexModel) return session.codexModel;
  return session.model;
}
