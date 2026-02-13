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
 * Get a clean copy of process.env without path-specific environment variables
 * that would be invalid when running in a different working directory.
 */
export function getCleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !FILTERED_ENV_VARS.includes(key)) {
      env[key] = value;
    }
  }
  return env;
}
