import { randomUUID } from 'crypto';
import type { IAppSettingsRepository } from '../../db/interfaces/settings';
import type { IPlaybookRepository } from '../../db/interfaces/playbook';
import {
  BUILT_IN_PLAYBOOKS,
  DEFAULT_PLAYBOOK,
  isBuiltInPlaybookId,
  parsePlaybook,
  type Playbook,
  type PlaybookStep,
} from '../../../shared/playbooks';
import type { SlashCommandInfo } from '../../../shared/types';
import { failure, success, type ServiceResult } from '../result';

const DEFAULT_SETTING = 'default_playbook_id';
const builtIns = Object.values(BUILT_IN_PLAYBOOKS);

export interface PlaybookServiceDeps {
  playbooks: IPlaybookRepository;
  appSettings: Pick<IAppSettingsRepository, 'get' | 'set'>;
  listSkills: () => ServiceResult<SlashCommandInfo[]>;
}

export function createPlaybookService(deps: PlaybookServiceDeps) {
  const find = (id: string): Playbook | undefined => deps.playbooks.get(id) ?? builtIns.find((playbook) => playbook.id === id);

  return {
    list(): ServiceResult<Playbook[]> {
      try {
        const customPlaybooks = deps.playbooks.list();
        const customById = new Map(customPlaybooks.map((playbook) => [playbook.id, playbook] as const));
        return success([
          ...builtIns.map((playbook) => customById.get(playbook.id) ?? playbook),
          ...customPlaybooks.filter((playbook) => !isBuiltInPlaybookId(playbook.id)),
        ]);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    get(id: string): ServiceResult<Playbook> {
      const playbook = find(id);
      return playbook ? success(playbook) : failure(`Playbook not found: ${id}`);
    },

    create(input: { name: string; steps: PlaybookStep[] }): ServiceResult<Playbook> {
      try {
        const playbook = parsePlaybook({ id: randomUUID(), name: input.name.trim(), builtIn: false, steps: input.steps });
        return success(deps.playbooks.create(playbook));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    update(id: string, input: { name: string; steps: PlaybookStep[] }): ServiceResult<Playbook> {
      try {
        const playbook = parsePlaybook({ id, name: input.name.trim(), builtIn: false, steps: input.steps });
        const existing = deps.playbooks.get(id);
        if (existing) {
          const updated = deps.playbooks.update(id, playbook);
          return updated ? success(updated) : failure(`Playbook not found: ${id}`);
        }
        if (isBuiltInPlaybookId(id)) return success(deps.playbooks.create(playbook));
        return failure(`Playbook not found: ${id}`);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    delete(id: string): ServiceResult<void> {
      const customizedBuiltIn = isBuiltInPlaybookId(id) && deps.playbooks.get(id);
      if (isBuiltInPlaybookId(id) && !customizedBuiltIn) return failure('Built-in playbooks cannot be deleted');
      if (!deps.playbooks.delete(id)) return failure(`Playbook not found: ${id}`);
      if (!isBuiltInPlaybookId(id) && deps.appSettings.get(DEFAULT_SETTING) === id) {
        deps.appSettings.set(DEFAULT_SETTING, DEFAULT_PLAYBOOK.id);
      }
      return success(undefined);
    },

    duplicate(id: string): ServiceResult<Playbook> {
      const source = find(id);
      if (!source) return failure(`Playbook not found: ${id}`);
      return this.create({ name: `${source.name} copy`, steps: source.steps });
    },

    getDefault(): ServiceResult<string> {
      const configured = deps.appSettings.get(DEFAULT_SETTING);
      return success(configured && find(configured) ? configured : DEFAULT_PLAYBOOK.id);
    },

    setDefault(id: string): ServiceResult<void> {
      if (!find(id)) return failure(`Playbook not found: ${id}`);
      deps.appSettings.set(DEFAULT_SETTING, id);
      return success(undefined);
    },

    listSkills(): ServiceResult<SlashCommandInfo[]> {
      const result = deps.listSkills();
      if (!result.ok) return result;
      return success(result.data.filter((entry) => !entry.name.includes(':')));
    },
  };
}

export type PlaybookService = ReturnType<typeof createPlaybookService>;
