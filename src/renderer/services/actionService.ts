import type { ActionEditable } from '../../shared/actions';

export function listActions(projectId: string) {
  return window.api.actions.list({ projectId });
}

export function getAction(id: string) {
  return window.api.actions.get({ id });
}

export function createAction(input: ActionEditable) {
  return window.api.actions.create(input);
}

export function updateAction(id: string, updates: Partial<ActionEditable>) {
  return window.api.actions.update({ id, updates });
}

export function setActionEnabled(id: string, enabled: boolean) {
  return window.api.actions.setEnabled({ id, enabled });
}

export function deleteAction(id: string) {
  return window.api.actions.delete({ id });
}

export function runActionNow(id: string) {
  return window.api.actions.runNow({ id });
}

export function getActionHistory(actionId: string, limit?: number) {
  return window.api.actions.history({ actionId, limit });
}
