import type { CustomPrompt } from '../../../shared/types';
import type {
  CustomPromptUpdate,
  ICustomPromptRepository,
  IProjectRepository,
} from '../../db/interfaces';
import type {
  CustomPromptExecutionCallbacks,
  CustomPromptExecutionOptions,
} from '../generation/CustomPromptGenerationService';
import { failure, success, type ServiceResult } from '../result';

export interface CustomPromptServiceDeps {
  customPrompts: ICustomPromptRepository;
  projects: Pick<IProjectRepository, 'get'>;
  executeCustomPrompt: (
    options: CustomPromptExecutionOptions,
    callbacks: CustomPromptExecutionCallbacks,
  ) => Promise<void>;
}

export function createCustomPromptService(deps: CustomPromptServiceDeps) {
  return {
    list(): ServiceResult<CustomPrompt[]> {
      try {
        return success(deps.customPrompts.list());
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    get(promptId: string): ServiceResult<CustomPrompt> {
      try {
        const prompt = deps.customPrompts.get(promptId);
        if (!prompt) {
          return failure('Custom prompt not found');
        }
        return success(prompt);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    create(input: {
      name: string;
      description?: string | null;
      promptContent: string;
      icon?: CustomPrompt['icon'];
      keywords?: string | null;
    }): ServiceResult<CustomPrompt> {
      try {
        const existing = deps.customPrompts.getByName(input.name);
        if (existing) {
          return failure(`A prompt named "${input.name}" already exists`);
        }

        const prompt = deps.customPrompts.create({
          name: input.name,
          description: input.description ?? null,
          prompt_content: input.promptContent,
          icon: input.icon ?? 'document',
          keywords: input.keywords ?? null,
        });
        return success(prompt);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    update(promptId: string, updates: {
      name?: string;
      description?: string | null;
      promptContent?: string;
      icon?: CustomPrompt['icon'];
      keywords?: string | null;
    }): ServiceResult<void> {
      try {
        const existing = deps.customPrompts.get(promptId);
        if (!existing) {
          return failure('Custom prompt not found');
        }

        if (updates.name && updates.name !== existing.name) {
          const duplicate = deps.customPrompts.getByName(updates.name);
          if (duplicate) {
            return failure(`A prompt named "${updates.name}" already exists`);
          }
        }

        const repoUpdates: CustomPromptUpdate = {};
        if (updates.name !== undefined) repoUpdates.name = updates.name;
        if (updates.description !== undefined) repoUpdates.description = updates.description;
        if (updates.promptContent !== undefined) repoUpdates.prompt_content = updates.promptContent;
        if (updates.icon !== undefined) repoUpdates.icon = updates.icon;
        if (updates.keywords !== undefined) repoUpdates.keywords = updates.keywords;

        deps.customPrompts.update(promptId, repoUpdates);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    delete(promptId: string): ServiceResult<void> {
      try {
        const prompt = deps.customPrompts.get(promptId);
        if (!prompt) {
          return failure('Custom prompt not found');
        }
        if (prompt.is_builtin) {
          return failure('Cannot delete built-in prompts');
        }

        const deleted = deps.customPrompts.delete(promptId);
        return deleted ? success(undefined) : failure('Failed to delete prompt');
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    startExecution(
      promptId: string,
      projectId: string,
      callbacks: CustomPromptExecutionCallbacks,
    ): ServiceResult<void> {
      try {
        const prompt = deps.customPrompts.get(promptId);
        if (!prompt) {
          return failure('Custom prompt not found');
        }

        const project = deps.projects.get(projectId);
        if (!project) {
          return failure('Project not found');
        }

        void deps.executeCustomPrompt(
          {
            promptId: prompt.id,
            promptName: prompt.name,
            promptContent: prompt.prompt_content,
            projectId: project.id,
            projectName: project.name,
            projectPath: project.folder_path,
          },
          callbacks,
        );

        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    ensureBuiltins(): ServiceResult<void> {
      try {
        deps.customPrompts.ensureBuiltinsExist();
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type CustomPromptService = ReturnType<typeof createCustomPromptService>;
