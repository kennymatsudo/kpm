import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockApi, type MockApi } from '../../../tests/mocks/electron-api';
import { useTaskPromptTemplateStore } from './taskPromptTemplateStore';
import { useGeneralSettingsStore } from './generalSettingsStore';
import { useMcpServersStore } from './mcpServersStore';
import { useCredentialStore } from './tracker/useCredentialStore';

describe('settings domain stores', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useTaskPromptTemplateStore.getState().reset();
    useGeneralSettingsStore.getState().reset();
    useMcpServersStore.getState().reset();
    useCredentialStore.setState({
      credentials: [],
      isLoading: false,
      error: null,
      showDialog: false,
      selectedTrackerType: 'jira',
    });
    vi.clearAllMocks();
  });

  it('creates a task prompt template through the store and refreshes the active scope', async () => {
    const createdTemplate = {
      id: 'template-1',
      project_id: 'project-1',
      name: 'Project Default',
      prompt_content: 'Prompt body',
      is_default: false,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    };

    useTaskPromptTemplateStore.setState({
      scope: 'project',
      currentProjectId: 'project-1',
      templates: [],
      selectedTemplateId: null,
    });
    api.taskPromptTemplates.create.mockResolvedValue({ success: true, template: createdTemplate });
    api.taskPromptTemplates.list.mockResolvedValue({ success: true, templates: [createdTemplate] });

    const result = await useTaskPromptTemplateStore.getState().saveTemplate('Project Default', 'Prompt body');

    expect(api.taskPromptTemplates.create).toHaveBeenCalledWith('project-1', 'Project Default', 'Prompt body');
    expect(api.taskPromptTemplates.list).toHaveBeenCalledWith('project-1');
    expect(result).toEqual({ success: true, template: createdTemplate });
    expect(useTaskPromptTemplateStore.getState().selectedTemplateId).toBe('template-1');
  });

  it('tests Jira credentials through the credential store', async () => {
    api.tracker.credentials.testJira.mockResolvedValue({ success: true });

      siteUrl: 'acme.atlassian.net',
      email: 'dev@acme.com',
      apiToken: 'token',
    });

    expect(api.tracker.credentials.testJira).toHaveBeenCalledWith('acme.atlassian.net', 'dev@acme.com', 'token');
    expect(result).toEqual({ success: true });
    expect(useCredentialStore.getState().error).toBeNull();
  });

  it('loads general settings through the settings domain store', async () => {
    api.settings.anthropic.hasKey.mockResolvedValue({ success: true, hasKey: true });
    api.settings.app.get.mockImplementation(async (key: string) => {
      if (key === 'branch_name_template') {
        return { success: true, value: '{ticket}-{name}' };
      }
      return { success: true, value: undefined };
    });

    await useGeneralSettingsStore.getState().loadGeneralSettings();

    expect(api.settings.anthropic.hasKey).toHaveBeenCalled();
    expect(api.settings.app.get).toHaveBeenCalledWith('branch_name_template');
    expect(useGeneralSettingsStore.getState()).toMatchObject({
      hasAnthropicKey: true,
      branchTemplate: '{ticket}-{name}',
      isLoadingAnthropicKey: false,
      isLoadingBranchTemplate: false,
    });
  });

  it('saves an Anthropic API key through the settings domain store after validation', async () => {
    api.settings.anthropic.testKey.mockResolvedValue({ success: true, valid: true });
    api.settings.anthropic.saveKey.mockResolvedValue({ success: true });

    const result = await useGeneralSettingsStore.getState().saveAnthropicKey('sk-ant-test');

    expect(api.settings.anthropic.testKey).toHaveBeenCalledWith('sk-ant-test');
    expect(api.settings.anthropic.saveKey).toHaveBeenCalledWith('sk-ant-test');
    expect(result).toEqual({ success: true });
    expect(useGeneralSettingsStore.getState().hasAnthropicKey).toBe(true);
  });

  it('loads MCP servers and preferences through the settings domain store', async () => {
    api.mcpServers.listAvailable.mockResolvedValue({
      success: true,
      plugins: [
        {
          name: 'slack',
          path: '/tmp/.claude/plugins/slack',
          description: 'Slack plugin',
          serverNames: ['slack'],
          enabledInClaudeCode: true,
        },
      ],
    });
    api.mcpServers.getPreferences.mockResolvedValue({
      success: true,
      preferences: { slack: true },
    });

    const result = await useMcpServersStore.getState().loadServers();

    expect(api.mcpServers.listAvailable).toHaveBeenCalled();
    expect(api.mcpServers.getPreferences).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
    expect(useMcpServersStore.getState()).toMatchObject({
      plugins: [
        {
          name: 'slack',
          path: '/tmp/.claude/plugins/slack',
          description: 'Slack plugin',
          serverNames: ['slack'],
          enabledInClaudeCode: true,
        },
      ],
      preferences: { slack: true },
      isLoading: false,
    });
  });

  it('updates an MCP server preference through the settings domain store', async () => {
    useMcpServersStore.setState({
      plugins: [],
      preferences: { slack: false },
      isLoading: false,
      togglingServerName: null,
      error: null,
    });
    api.mcpServers.setEnabled.mockResolvedValue({ success: true });

    const result = await useMcpServersStore.getState().setServerEnabled('slack', true);

    expect(api.mcpServers.setEnabled).toHaveBeenCalledWith('slack', true);
    expect(result).toEqual({ success: true });
    expect(useMcpServersStore.getState().preferences).toEqual({ slack: true });
  });
});
