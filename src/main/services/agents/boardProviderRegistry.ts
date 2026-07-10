import { getConfig } from '../../config';
import type { BoardProvider } from '../../../shared/playbooks';
import { isAgentAvailable } from './agentCatalog';

export interface BoardProviderRegistryDeps {
  isAvailable?: (provider: 'claude' | 'codex' | 'gemini') => Promise<boolean>;
}

export async function listBoardProviders(deps: BoardProviderRegistryDeps = {}): Promise<BoardProvider[]> {
  const available = deps.isAvailable ?? isAgentAvailable;
  const [claude, codex, gemini] = await Promise.all([
    available('claude'),
    available('codex'),
    available('gemini'),
  ]);

  const providers: BoardProvider[] = [
    {
      id: 'claude', name: 'Claude', available: claude,
      models: [
        { id: 'sonnet', name: 'Sonnet', isDefault: true },
        { id: 'opus', name: 'Opus' },
      ],
      capabilities: { nativeSkills: true, reviewSandbox: false },
      ...(!claude ? { unavailableReason: 'Claude Code is not available' } : {}),
    },
    {
      id: 'codex', name: 'Codex', available: codex,
      models: [{ id: getConfig().agentSession.codexModel ?? 'gpt-5.3-codex', name: getConfig().agentSession.codexModel ?? 'gpt-5.3-codex', isDefault: true }],
      capabilities: { nativeSkills: false, reviewSandbox: true },
      ...(!codex ? { unavailableReason: 'Codex is not authenticated' } : {}),
    },
    {
      id: 'gemini', name: 'Gemini', available: gemini,
      models: [{ id: 'default', name: 'Default', isDefault: true }],
      capabilities: { nativeSkills: false, reviewSandbox: false },
      ...(!gemini ? { unavailableReason: 'Gemini CLI is not available' } : {}),
    },
  ];

  // pi capabilities remain internal until board execution can actually dispatch
  // them. The v1 provider endpoint intentionally returns only executable types.
  return providers;
}
