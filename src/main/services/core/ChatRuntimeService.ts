import type { BrowserWindow } from 'electron';
import type { AppServices } from '../appServices';
import type { IRepositoryContainer } from '../../db/interfaces';
import { createStreamingSessionService } from '../streaming/StreamingSessionService';
import { createContextBuilder } from '../../claude/contextBuilders';
import type { OnElicitation } from '@anthropic-ai/claude-agent-sdk';
import { buildSdkOptions, type ModelType } from '../../claude/sdkOptionsBuilder';
import { subscribeToKpmToolProposals } from '../../kpmTools/runtimeRegistry';
import { createToolCallLogger } from '../toollog';
import type { PlanContext } from '../../chat/prompts';
import { unwrapOrThrow } from '../result';
import { createChatService } from './ChatService';
import { SETTINGS } from '../../../shared/settingsRegistry';
import { getSetting } from '../../db/appSettingsAccess';
import { emitAppEvent } from '../../../shared/ipc/appEvents';
import { chatEvents } from '../../../shared/ipc/chatEvents';

export interface ChatRuntimeServiceDeps {
  getMainWindow: () => BrowserWindow | null;
  services: AppServices;
  container: IRepositoryContainer;
}

export function createChatRuntimeService(deps: ChatRuntimeServiceDeps) {
  const { getMainWindow, services, container } = deps;

  const buildContext = createContextBuilder({
    projects: container.projects,
    repos: container.repos,
    attachments: container.attachments,
    planItems: container.planItems,
    taskPromptTemplates: container.taskPromptTemplates,
  });

  const buildContextWithPrompts = (projectId: string): PlanContext | null => {
    const context = buildContext(projectId);
    if (context) {
      context.getPromptContent = (key: string) => unwrapOrThrow(services.promptOverrideService.getContent(key));
    }
    return context;
  };

  const toolCallLogger = createToolCallLogger({ getMainWindow });

  const streamingSessionService = createStreamingSessionService({
    projectRepository: {
      get: container.projects.get.bind(container.projects),
      updateTokens: container.projects.updateTokens.bind(container.projects),
    },
    recordUsage: ({ projectId, model, usage, totalCostUsd, sdkSessionId, sdkResultUuid, sdkCostScope, isCumulativeCostSnapshot, ttftMs, durationMs }) => {
      services.claudeUsageService.recordUsage({
        projectId,
        source: 'chat',
        model,
        usage,
        totalCostUsd,
        sdkSessionId,
        sdkResultUuid,
        sdkCostScope,
        isCumulativeCostSnapshot,
        ttftMs,
        durationMs,
      });
    },
    chatMessageRepository: {
      addMessage: container.chatMessages.addMessage.bind(container.chatMessages),
      getMessagesByChatSession: container.chatMessages.getMessagesByChatSession.bind(container.chatMessages),
    },
    chatSessionRepository: {
      get: container.chatSessions.get.bind(container.chatSessions),
      create: container.chatSessions.create.bind(container.chatSessions),
      updateClaudeSessionId: container.chatSessions.updateClaudeSessionId.bind(container.chatSessions),
      updateProviderSessionId: container.chatSessions.updateProviderSessionId.bind(container.chatSessions),
      updateTitle: container.chatSessions.updateTitle.bind(container.chatSessions),
      clearClaudeSessionIdsByProject: container.chatSessions.clearClaudeSessionIdsByProject.bind(container.chatSessions),
      clearProviderSessionIdsByProject: container.chatSessions.clearProviderSessionIdsByProject.bind(container.chatSessions),
    },
    getMainWindow,
    buildContext: buildContextWithPrompts,
    getPlanItems: container.planItems.getByProject.bind(container.planItems),
    buildSdkOptions: (context: PlanContext, options: {
      model: ModelType;
      effort?: 'low' | 'medium' | 'high' | 'max';
      resumeSessionId?: string;
      mainWindow: BrowserWindow | null;
      onContextFileEdit?: (projectId: string, newContent: string) => void;
      onProjectFileWrite?: (projectId: string, filePath: string, content: string) => void;
      peekPendingFile?: (relativeFilePath: string) => string | undefined;
      onElicitation?: OnElicitation;
      autoApprove?: boolean;
    }) => {
      const pluginPathsResult = services.mcpDiscoveryService.getEnabledPluginPaths();
      const enabledPluginPaths = pluginPathsResult.ok ? pluginPathsResult.data : [];

      const userConfigsResult = services.mcpDiscoveryService.getEnabledUserMcpConfigs();
      const enabledUserMcpConfigs = userConfigsResult.ok ? userConfigsResult.data : {};

      const managedServersResult = services.mcpDiscoveryService.getCachedManagedServers();
      const disabledToolsResult = managedServersResult.ok
        ? services.mcpDiscoveryService.getDisabledMcpTools(managedServersResult.data)
        : { ok: false as const, error: '' };
      const disabledMcpTools = disabledToolsResult.ok ? disabledToolsResult.data : [];
      const disabledServerNamesResult = managedServersResult.ok
        ? services.mcpDiscoveryService.getDisabledMcpServerNames(managedServersResult.data)
        : { ok: false as const, error: '' };
      const disabledMcpServerNames = disabledServerNamesResult.ok ? disabledServerNamesResult.data : [];

      return buildSdkOptions({
        context,
        model: options.model,
        effort: options.effort,
        resumeSessionId: options.resumeSessionId,
        mainWindow: options.mainWindow,
        onContextFileEdit: options.onContextFileEdit,
        onProjectFileWrite: options.onProjectFileWrite,
        peekPendingFile: options.peekPendingFile,
        onElicitation: options.onElicitation,
        autoApprove: options.autoApprove,
        enabledPluginPaths,
        enabledUserMcpConfigs,
        disabledMcpTools,
        disabledMcpServerNames,
      });
    },
    subscribeToKpmToolProposals,
    readProjectContextFile: async (projectId: string) => {
      const result = await services.contextFileService.readProjectContextFile(projectId);
      return result.ok
        ? { success: true, ...result.data }
        : { success: false, content: null, error: result.error };
    },
    readDocumentFile: async (projectId: string, filePath: string) => {
      const result = await services.contextFileService.readDocumentFile(projectId, filePath);
      return result.ok
        ? { success: true, content: result.data.content }
        : { success: false, content: null, error: result.error };
    },
    toolCallLogger,
    scheduler: services.pollScheduler,
    isSlashCommand: (text: string) => services.slashCommandService.isCommandInvocation(text),
    listSlashCommands: () => {
      const result = services.slashCommandService.listCommands();
      return result.ok ? result.data : [];
    },
    onMcpStatusReady: (mcpStatus) => {
      const managed = mcpStatus
        .filter(s => s.name.startsWith('claude.ai'))
        .map(s => ({
          name: s.name,
          source: 'claude-ai' as const,
          status: s.status,
          tools: (s.tools ?? []).map((t: { name: string }) => t.name),
        }));
      services.mcpDiscoveryService.saveManagedServers(managed);
    },
  });

  const chatService = createChatService({
    projects: container.projects,
    chatMessages: container.chatMessages,
    chatSessions: container.chatSessions,
    getDefaultChatProvider: () => getSetting(container.appSettings, SETTINGS.chatProvider),
    streamingSessionService,
    slashCommandService: services.slashCommandService,
    emitChatError: ({ projectId, chatSessionId, error }) => {
      emitAppEvent(getMainWindow()?.webContents, chatEvents.error, { projectId, chatSessionId, error });
    },
  });

  return {
    toolCallLogger,
    streamingSessionService,
    chatService,
  };
}

export type ChatRuntimeService = ReturnType<typeof createChatRuntimeService>;
