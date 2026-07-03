import type { TaskPromptTemplate } from '../../../shared/types';
import type { ITaskPromptTemplateRepository } from '../../db/interfaces';
import { failure, success, wrap, type ServiceResult } from '../result';

export interface TaskPromptTemplateServiceDeps {
  taskPromptTemplates: ITaskPromptTemplateRepository;
}

export function createTaskPromptTemplateService(deps: TaskPromptTemplateServiceDeps) {
  return {
    list(projectId?: string | null): ServiceResult<TaskPromptTemplate[]> {
      return wrap(() =>
        projectId
          ? deps.taskPromptTemplates.listForProject(projectId)
          : deps.taskPromptTemplates.list(null),
      );
    },

    get(templateId: string): ServiceResult<TaskPromptTemplate> {
      try {
        const template = deps.taskPromptTemplates.get(templateId);
        return template ? success(template) : failure('Template not found');
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getEffective(projectId: string): ServiceResult<TaskPromptTemplate> {
      return wrap(() => deps.taskPromptTemplates.getEffective(projectId));
    },

    getBuiltinDefault(): ServiceResult<{ promptContent: string }> {
      return wrap(() => ({ promptContent: deps.taskPromptTemplates.getBuiltinDefault() }));
    },

    create(projectId: string | null, name: string, promptContent: string): ServiceResult<TaskPromptTemplate> {
      try {
        if (deps.taskPromptTemplates.existsInScope(projectId, name)) {
          return failure('A template with this name already exists');
        }

        return success(deps.taskPromptTemplates.create({
          project_id: projectId,
          name,
          prompt_content: promptContent,
        }));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    update(templateId: string, updates: { name?: string; promptContent?: string }): ServiceResult<TaskPromptTemplate> {
      try {
        const existing = deps.taskPromptTemplates.get(templateId);
        if (!existing) {
          return failure('Template not found');
        }

        deps.taskPromptTemplates.update(templateId, {
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.promptContent !== undefined && { prompt_content: updates.promptContent }),
        });

        const template = deps.taskPromptTemplates.get(templateId);
        return template ? success(template) : failure('Template not found');
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    delete(templateId: string): ServiceResult<void> {
      try {
        const existing = deps.taskPromptTemplates.get(templateId);
        if (!existing) {
          return failure('Template not found');
        }
        deps.taskPromptTemplates.delete(templateId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    setDefault(templateId: string): ServiceResult<TaskPromptTemplate> {
      try {
        deps.taskPromptTemplates.setDefault(templateId);
        const template = deps.taskPromptTemplates.get(templateId);
        return template ? success(template) : failure('Template not found');
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    ensureDefault(): ServiceResult<void> {
      return wrap(() => {
        deps.taskPromptTemplates.ensureDefaultExists();
      });
    },
  };
}

export type TaskPromptTemplateService = ReturnType<typeof createTaskPromptTemplateService>;
