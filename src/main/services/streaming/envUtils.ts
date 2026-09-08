/**
 * Environment variables that should not be inherited when spawning PTY processes
 * in a different working directory. These are typically set by virtual environment
 * tools and point to specific paths that won't be valid in the new directory.
 */
export const FILTERED_ENV_VARS = [
  // Python virtual environments
  'VIRTUAL_ENV',
  '_OLD_VIRTUAL_PATH',
  '_OLD_VIRTUAL_PYTHONHOME',
  // Conda
  'CONDA_DEFAULT_ENV',
  'CONDA_PREFIX',
  'CONDA_SHLVL',
  'CONDA_PROMPT_MODIFIER',
  // pyenv
  'PYENV_VIRTUAL_ENV',
  'PYENV_VERSION',
  // Pipenv / Poetry
  'PIPENV_ACTIVE',
  'POETRY_ACTIVE',
  // Node version managers
  'NVM_BIN',
  'NVM_INC',
  // Ruby version managers
  'RBENV_VERSION',
  'GEM_HOME',
  'GEM_PATH',
];

/**
 * GitHub tokens that must not reach an agent. `gh`'s keyring login is the only GitHub
 * credential KPM maintains, and each of these silently outranks it somewhere: `gh` itself
 * prefers `GH_TOKEN`/`GITHUB_TOKEN` over the keyring, and GitHub MCP servers read
 * `GITHUB_PERSONAL_ACCESS_TOKEN`. A stale one in the user's shell therefore looks like
 * "KPM can't see my credentials" while `gh auth status` reports perfect health.
 */
export const FILTERED_CREDENTIAL_ENV_VARS = [
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
];

function inheritEnv(excluded: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !excluded.includes(key)) {
      env[key] = value;
    }
  }
  return env;
}

/**
 * Get a clean copy of process.env without path-specific environment variables
 * that would be invalid when running in a different working directory.
 */
export function getCleanEnv(): Record<string, string> {
  return inheritEnv(FILTERED_ENV_VARS);
}

/**
 * The environment for a spawned agent: `getCleanEnv()` minus inherited GitHub tokens.
 *
 * Use this rather than spreading `process.env` at an agent or generation call site. The
 * embedded terminal deliberately keeps `getCleanEnv()` — that shell belongs to the user,
 * and it re-sources their shell profile on launch anyway, so filtering it would be both
 * presumptuous and ineffective.
 */
export function getAgentEnv(): Record<string, string> {
  return inheritEnv([...FILTERED_ENV_VARS, ...FILTERED_CREDENTIAL_ENV_VARS]);
}
