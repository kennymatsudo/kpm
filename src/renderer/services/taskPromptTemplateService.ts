export function listTaskPromptTemplates(projectId: string | null) {
  return window.api.taskPromptTemplates.list(projectId);
}

export function getBuiltinTaskPromptTemplate() {
  return window.api.taskPromptTemplates.getBuiltinDefault();
}

export function createTaskPromptTemplate(
  projectId: string | null,
  name: string,
  promptContent: string
) {
  return window.api.taskPromptTemplates.create(projectId, name, promptContent);
}

export function updateTaskPromptTemplate(
  templateId: string,
  updates: { name: string; promptContent: string }
) {
  return window.api.taskPromptTemplates.update(templateId, updates);
}

export function deleteTaskPromptTemplate(templateId: string) {
  return window.api.taskPromptTemplates.delete(templateId);
}

export function setDefaultTaskPromptTemplate(templateId: string) {
  return window.api.taskPromptTemplates.setDefault(templateId);
}
