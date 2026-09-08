import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectWriteGrants, type ProjectWriteGrants, type WriteGrantStore } from './writeGrants';

let writeGrants: ProjectWriteGrants;
let store: WriteGrantStore & { granted: Set<string> };

function createStore(initial: string[] = []): WriteGrantStore & { granted: Set<string> } {
  const granted = new Set(initial);
  return {
    granted,
    listGrantedProjectIds: () => [...granted],
    grant: vi.fn((projectId: string) => granted.add(projectId)),
    revoke: vi.fn((projectId: string) => granted.delete(projectId)),
  };
}

beforeEach(() => {
  writeGrants = createProjectWriteGrants();
  store = createStore();
  writeGrants.hydrate(store);
});

describe('projectWriteGrants', () => {
  it('asks once, then allows later writes from the project grant', async () => {
    const requestConsent = vi.fn().mockResolvedValue(true);

    const first = await writeGrants.request('project-1', requestConsent);
    const second = await writeGrants.request('project-1', requestConsent);

    expect(first).toEqual({ allowed: true });
    expect(second).toEqual({ allowed: true });
    expect(requestConsent).toHaveBeenCalledTimes(1);
  });

  it('refuses and records nothing when the user declines', async () => {
    const decision = await writeGrants.request('project-1', async () => false);

    expect(decision.allowed).toBe(false);
    expect(writeGrants.has('project-1')).toBe(false);
    expect(store.granted.has('project-1')).toBe(false);
  });

  it('tells the model not to retry after a refusal', async () => {
    const decision = await writeGrants.request('project-1', async () => false);

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('Do not retry');
  });

  it('refuses without asking when there is no project', async () => {
    const requestConsent = vi.fn().mockResolvedValue(true);

    const decision = await writeGrants.request(undefined, requestConsent);

    expect(decision.allowed).toBe(false);
    expect(requestConsent).not.toHaveBeenCalled();
  });

  it('keeps grants separate per project', async () => {
    await writeGrants.request('project-1', async () => true);

    expect(writeGrants.has('project-1')).toBe(true);
    expect(writeGrants.has('project-2')).toBe(false);
  });

  it('coalesces concurrent requests for one project', async () => {
    let approve!: (allowed: boolean) => void;
    const requestConsent = vi.fn(() => new Promise<boolean>((resolve) => {
      approve = resolve;
    }));

    const first = writeGrants.request('project-1', requestConsent);
    const second = writeGrants.request('project-1', requestConsent);
    approve(true);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { allowed: true },
      { allowed: true },
    ]);
    expect(requestConsent).toHaveBeenCalledTimes(1);
  });

  it('keeps concurrent requests independent across projects', async () => {
    const first = writeGrants.request('project-1', async () => true);
    const second = writeGrants.request('project-2', async () => false);

    await expect(first).resolves.toEqual({ allowed: true });
    await expect(second).resolves.toMatchObject({ allowed: false });
    expect(writeGrants.has('project-1')).toBe(true);
    expect(writeGrants.has('project-2')).toBe(false);
  });

  it('revokes one project without touching another', async () => {
    await writeGrants.request('project-1', async () => true);
    await writeGrants.request('project-2', async () => true);

    writeGrants.revoke('project-1');

    expect(writeGrants.has('project-1')).toBe(false);
    expect(writeGrants.has('project-2')).toBe(true);
  });

  it('reports every state change', () => {
    const listener = vi.fn();
    writeGrants.subscribe(listener);

    return writeGrants.request('project-1', async () => true).then(() => {
      writeGrants.revoke('project-1');

      expect(listener.mock.calls).toEqual([
        ['project-1', true],
        ['project-1', false],
      ]);
    });
  });

  it('stops publishing after unsubscribe', async () => {
    const listener = vi.fn();
    const unsubscribe = writeGrants.subscribe(listener);

    await writeGrants.request('project-1', async () => true);
    unsubscribe();
    writeGrants.revoke('project-1');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  describe('persistence', () => {
    it('allows writes without asking for a grant restored from storage', async () => {
      const requestConsent = vi.fn().mockResolvedValue(true);
      writeGrants.hydrate(createStore(['project-1']));

      const decision = await writeGrants.request('project-1', requestConsent);

      expect(decision).toEqual({ allowed: true });
      expect(requestConsent).not.toHaveBeenCalled();
    });

    it('writes the grant to storage so it outlives a restart', async () => {
      await writeGrants.request('project-1', async () => true);

      expect(store.grant).toHaveBeenCalledWith('project-1');
    });

    it('clears the grant from storage on revoke', async () => {
      await writeGrants.request('project-1', async () => true);

      writeGrants.revoke('project-1');

      expect(store.revoke).toHaveBeenCalledWith('project-1');
    });

    it('grants without asking when the user turns writes on directly', () => {
      writeGrants.grant('project-1');

      expect(writeGrants.has('project-1')).toBe(true);
      expect(store.grant).toHaveBeenCalledWith('project-1');
    });

    it('drops a grant that storage no longer reports after rehydrating', () => {
      writeGrants.grant('project-1');

      writeGrants.hydrate(createStore());

      expect(writeGrants.has('project-1')).toBe(false);
    });
  });
});
