import type { PlaybookStep } from '../../shared/playbooks';

export const listPlaybooks = () => window.api.playbooks.list();
export const createPlaybook = (input: { name: string; steps: PlaybookStep[] }) => window.api.playbooks.create(input);
export const updatePlaybook = (input: { id: string; name: string; steps: PlaybookStep[] }) => window.api.playbooks.update(input);
export const deletePlaybook = (id: string) => window.api.playbooks.delete({ id });
export const duplicatePlaybook = (id: string) => window.api.playbooks.duplicate({ id });
export const setDefaultPlaybook = (id: string) => window.api.playbooks.setDefault({ id });
export const listBoardProviders = () => window.api.playbooks.providers();
export const listPlaybookSkills = () => window.api.playbooks.skills();
