import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../testing/createTestDb';
import { PlaybookRepository } from './PlaybookRepository';

const steps = [{
  id: 'implement',
  session: 'main' as const,
  systemPromptKey: 'agents.implementation_system',
  directive: { kind: 'prompt' as const },
}];

describe('PlaybookRepository', () => {
  it('creates, updates, lists, and deletes custom playbooks', () => {
    const db = createTestDb();
    try {
      const repo = new PlaybookRepository(db);
      const created = repo.create({ id: 'custom-1', name: 'My flow', steps });
      expect(created).toMatchObject({ id: 'custom-1', name: 'My flow', builtIn: false, steps });
      expect(repo.list()).toHaveLength(1);
      expect(repo.update('custom-1', { name: 'Renamed', steps })).toMatchObject({ name: 'Renamed' });
      expect(repo.delete('custom-1')).toBe(true);
      expect(repo.get('custom-1')).toBeUndefined();
    } finally {
      db.close();
    }
  });
});
