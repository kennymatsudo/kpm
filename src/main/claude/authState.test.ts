import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { detectClaudeSignIn } from './authState';

const scratch = join(tmpdir(), `kpm-authstate-${randomUUID()}`);
mkdirSync(scratch, { recursive: true });

function writeConfig(contents: string): string {
  const path = join(scratch, `${randomUUID()}.json`);
  writeFileSync(path, contents, 'utf-8');
  return path;
}

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
});

describe('detectClaudeSignIn', () => {
  it('reports signed in with email when oauthAccount.accountUuid is present', async () => {
    const path = writeConfig(
      JSON.stringify({ oauthAccount: { accountUuid: 'abc-123', emailAddress: 'user@example.com' } }),
    );
    expect(await detectClaudeSignIn(path)).toEqual({ signedIn: true, email: 'user@example.com' });
  });

  it('reports signed in without email when emailAddress is absent', async () => {
    const path = writeConfig(JSON.stringify({ oauthAccount: { accountUuid: 'abc-123' } }));
    expect(await detectClaudeSignIn(path)).toEqual({ signedIn: true });
  });

  it('reports not signed in when accountUuid is empty', async () => {
    const path = writeConfig(JSON.stringify({ oauthAccount: { accountUuid: '' } }));
    expect(await detectClaudeSignIn(path)).toEqual({ signedIn: false });
  });

  it('reports not signed in when oauthAccount is missing', async () => {
    const path = writeConfig(JSON.stringify({ hasAvailableSubscription: true }));
    expect(await detectClaudeSignIn(path)).toEqual({ signedIn: false });
  });

  it('reports not signed in when the file is missing', async () => {
    expect(await detectClaudeSignIn(join(scratch, 'does-not-exist.json'))).toEqual({ signedIn: false });
  });

  it('reports not signed in when the file is malformed JSON', async () => {
    const path = writeConfig('{ not valid json');
    expect(await detectClaudeSignIn(path)).toEqual({ signedIn: false });
  });
});
