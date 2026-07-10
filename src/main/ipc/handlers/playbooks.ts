import { playbookEndpoints, type PlaybookEndpointName } from '../../../shared/ipc/playbookEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { PlaybookService } from '../../services/core/PlaybookService';
import { createRegistryIpcHandlers } from '../validation/utils';
import { unwrapOrThrow } from '../../services/result';
import { listBoardProviders } from '../../services/agents/boardProviderRegistry';
import type { BoardProvider } from '../../../shared/playbooks';

type Handlers = { [K in PlaybookEndpointName]: UnwrappedHandlerFor<typeof playbookEndpoints, K> };

export function buildPlaybookHandlers(
  service: PlaybookService,
  providerRegistry: () => Promise<BoardProvider[]> = listBoardProviders,
): Handlers {
  return {
    list: () => ({
      playbooks: unwrapOrThrow(service.list()),
      defaultId: unwrapOrThrow(service.getDefault()),
    }),
    create: (input) => ({ playbook: unwrapOrThrow(service.create(input)) }),
    update: ({ id, ...input }) => ({ playbook: unwrapOrThrow(service.update(id, input)) }),
    delete: ({ id }) => { unwrapOrThrow(service.delete(id)); },
    duplicate: ({ id }) => ({ playbook: unwrapOrThrow(service.duplicate(id)) }),
    setDefault: ({ id }) => { unwrapOrThrow(service.setDefault(id)); },
    providers: async () => ({ providers: await providerRegistry() }),
    skills: () => ({ skills: unwrapOrThrow(service.listSkills()) }),
  };
}

export function registerPlaybookHandlers(service: PlaybookService): void {
  createRegistryIpcHandlers(playbookEndpoints, buildPlaybookHandlers(service), 'Playbook operation failed');
}
