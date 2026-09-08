/**
 * The gh CLI's auth state, owned in one place: the main process derives it from
 * `gh auth status` and the renderer turns it into the sentence the user reads.
 */

/** Kept distinct so callers don't send someone to `gh auth login` when gh is actually missing or the check itself never got an answer. */
export type GhAuthFailure =
  | 'not_installed'
  | 'not_authenticated'
  | 'check_failed';

export type GhAuthState =
  | {
      authenticated: true;
      account: string;
      /** Env-sourced token; a stale value here outranks the keyring, the usual cause of "Bad credentials" for an app-spawned gh. */
      tokenEnvVar?: string;
    }
  | { authenticated: false; reason: GhAuthFailure };

/**
 * Why GitHub access isn't working, per state. Each failure has a different
 * remedy, so sending everyone to `gh auth login` strands the cases where that
 * command is not the answer. Only failure paths call this, so an authenticated
 * state means gh's own check passed while GitHub rejected what gh sent.
 */
export function describeGhAuth(state: GhAuthState): string {
  if (state.authenticated) {
    return state.tokenEnvVar
      ? `gh is authenticated as ${state.account}, but it is using ${state.tokenEnvVar} from the environment. That token, not your keyring login, is being rejected.`
      : `gh is authenticated as ${state.account}, but GitHub rejected its credentials. Run \`gh auth refresh\` in your terminal.`;
  }

  switch (state.reason) {
    case 'not_installed':
      return 'GitHub CLI not found. Install gh, then reopen this panel.';
    case 'not_authenticated':
      return 'GitHub CLI not authenticated. Run `gh auth login` in your terminal.';
    case 'check_failed':
      return 'Could not verify GitHub access. Check your connection and credentials, then try again.';
    default: {
      const _exhaustive: never = state.reason;
      return _exhaustive;
    }
  }
}
