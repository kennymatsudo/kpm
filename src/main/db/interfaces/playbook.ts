import type { Playbook, PlaybookStep } from '../../../shared/playbooks';

export interface IPlaybookRepository {
  list(): Playbook[];
  get(id: string): Playbook | undefined;
  create(input: { id: string; name: string; steps: PlaybookStep[] }): Playbook;
  update(id: string, input: { name: string; steps: PlaybookStep[] }): Playbook | undefined;
  delete(id: string): boolean;
}
