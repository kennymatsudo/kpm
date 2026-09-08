import { describe, it, expect, afterEach } from 'vitest';
import { getCleanEnv, getAgentEnv } from './envUtils';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getCleanEnv', () => {
  it('drops path-specific vars but keeps inherited GitHub tokens', () => {
    process.env.VIRTUAL_ENV = '/tmp/venv';
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'ghp_stale';

    const env = getCleanEnv();

    expect(env.VIRTUAL_ENV).toBeUndefined();
    expect(env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('ghp_stale');
  });
});

describe('getAgentEnv', () => {
  it('drops every GitHub token so gh’s keyring login is the only credential', () => {
    process.env.GH_TOKEN = 'gho_shadow';
    process.env.GITHUB_TOKEN = 'ghp_shadow';
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'ghp_stale';

    const env = getAgentEnv();

    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.GITHUB_PERSONAL_ACCESS_TOKEN).toBeUndefined();
  });

  it('still drops the path-specific vars getCleanEnv removes', () => {
    process.env.CONDA_PREFIX = '/tmp/conda';
    process.env.PATH = '/usr/bin';

    const env = getAgentEnv();

    expect(env.CONDA_PREFIX).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
  });
});
