import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeAvailability } from '../../shared/types';

const mocks = vi.hoisted(() => ({
  getClaudeAvailability: vi.fn(),
  refreshClaudeAvailability: vi.fn(),
  detectClaudeSignIn: vi.fn(),
  getCodexStatus: vi.fn(),
  isPiAvailable: vi.fn(),
}));

vi.mock('../claude/availabilityState', () => ({
  getClaudeAvailability: mocks.getClaudeAvailability,
  refreshClaudeAvailability: mocks.refreshClaudeAvailability,
}));
vi.mock('../claude/authState', () => ({
  detectClaudeSignIn: mocks.detectClaudeSignIn,
}));
vi.mock('../codex/auth', () => ({
  getCodexStatus: mocks.getCodexStatus,
}));
vi.mock('../pi/detect', () => ({
  isPiAvailable: mocks.isPiAvailable,
}));

import { getProviderReadiness, refreshProviderReadiness } from './readiness';

const BUNDLED: ClaudeAvailability = { status: 'bundled', binaryPath: '/x/claude' };
const UNREACHABLE: ClaudeAvailability = {
  status: 'unreachable',
  reason: 'not found',
  searchedPaths: [],
};

function setAllUnready() {
  mocks.getClaudeAvailability.mockReturnValue(UNREACHABLE);
  mocks.refreshClaudeAvailability.mockReturnValue(UNREACHABLE);
  mocks.detectClaudeSignIn.mockResolvedValue({ signedIn: false });
  mocks.getCodexStatus.mockResolvedValue({ installed: true, authenticated: false });
  mocks.isPiAvailable.mockResolvedValue(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  setAllUnready();
});

describe('getProviderReadiness', () => {
  it('normalizes claude sign-in into ready with email detail', async () => {
    mocks.refreshClaudeAvailability.mockReturnValue(BUNDLED);
    mocks.detectClaudeSignIn.mockResolvedValue({ signedIn: true, email: 'u@x.com' });

    const { byProvider, anyReady } = await refreshProviderReadiness();

    expect(byProvider.claude).toEqual({
      provider: 'claude',
      state: 'ready',
      detail: 'Signed in as u@x.com',
    });
    expect(anyReady).toBe(true);
  });

  it('marks claude installed-not-configured when binary present but not signed in', async () => {
    mocks.refreshClaudeAvailability.mockReturnValue(BUNDLED);
    mocks.detectClaudeSignIn.mockResolvedValue({ signedIn: false });

    const { byProvider } = await refreshProviderReadiness();
    expect(byProvider.claude.state).toBe('installed-not-configured');
  });

  it('marks claude not-installed when the binary is unreachable', async () => {
    mocks.getClaudeAvailability.mockReturnValue(UNREACHABLE);

    const { byProvider } = await refreshProviderReadiness();
    expect(byProvider.claude.state).toBe('not-installed');
    // Sign-in is not probed when the binary is absent.
    expect(mocks.detectClaudeSignIn).not.toHaveBeenCalled();
  });

  it('normalizes codex authenticated into ready', async () => {
    mocks.getCodexStatus.mockResolvedValue({ installed: true, authenticated: true });

    const { byProvider, anyReady } = await refreshProviderReadiness();
    expect(byProvider.codex.state).toBe('ready');
    expect(anyReady).toBe(true);
  });

  it('normalizes pi availability into ready', async () => {
    mocks.isPiAvailable.mockResolvedValue(true);

    const { byProvider, anyReady } = await refreshProviderReadiness();
    expect(byProvider.pi.state).toBe('ready');
    expect(anyReady).toBe(true);
  });

  it('anyReady is false when no provider is ready', async () => {
    const { anyReady, byProvider } = await refreshProviderReadiness();
    expect(anyReady).toBe(false);
    expect(byProvider.claude.state).toBe('not-installed');
    expect(byProvider.codex.state).toBe('installed-not-configured');
    expect(byProvider.pi.state).toBe('installed-not-configured');
  });

  it('refresh uses the refreshed claude availability and forces a pi re-read', async () => {
    mocks.refreshClaudeAvailability.mockReturnValue(BUNDLED);
    mocks.detectClaudeSignIn.mockResolvedValue({ signedIn: true });

    await refreshProviderReadiness();

    expect(mocks.refreshClaudeAvailability).toHaveBeenCalled();
    expect(mocks.getClaudeAvailability).not.toHaveBeenCalled();
    expect(mocks.isPiAvailable).toHaveBeenCalledWith(true);
  });

  it('caches: a second get does not re-probe the sources', async () => {
    await refreshProviderReadiness();
    vi.clearAllMocks();

    await getProviderReadiness();
    expect(mocks.getClaudeAvailability).not.toHaveBeenCalled();
    expect(mocks.getCodexStatus).not.toHaveBeenCalled();
    expect(mocks.isPiAvailable).not.toHaveBeenCalled();
  });
});
