import { beforeEach, afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  decideMcpElicitation,
  isAutoApprovedCodexMcpServer,
  type McpElicitationRequest,
} from './mcpElicitation';

describe('decideMcpElicitation', () => {
  let openExternal: Mock<(url: string) => void>;
  let promptUser: Mock<(toolName: string, input: Record<string, unknown>) => Promise<boolean>>;

  beforeEach(() => {
    openExternal = vi.fn();
    promptUser = vi.fn(async () => true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cases: {
    name: string;
    request: McpElicitationRequest;
    answer?: boolean;
    autoApprove?: boolean;
    action: 'accept' | 'decline';
    opens: boolean;
    prompts: boolean;
  }[] = [
    {
      name: 'url mode with an allowed scheme opens the browser and accepts',
      request: { mode: 'url', url: 'https://linear.app/oauth', serverName: 'linear' },
      action: 'accept',
      opens: true,
      prompts: false,
    },
    {
      name: 'url mode with an unsafe scheme declines without opening anything',
      request: { mode: 'url', url: 'file:///Users/me/.aws/credentials', serverName: 'linear' },
      action: 'decline',
      opens: false,
      prompts: false,
    },
    {
      name: 'url mode with no url declines',
      request: { mode: 'url', serverName: 'linear' },
      action: 'decline',
      opens: false,
      prompts: false,
    },
    {
      name: 'form mode asks the user and accepts their yes',
      request: { mode: 'form', message: 'Pick a team', serverName: 'linear' },
      answer: true,
      action: 'accept',
      opens: false,
      prompts: true,
    },
    {
      name: 'form mode declines the user no',
      request: { mode: 'form', message: 'Pick a team', serverName: 'linear' },
      answer: false,
      action: 'decline',
      opens: false,
      prompts: true,
    },
    {
      name: 'an auto-approved server accepts without asking',
      request: { mode: 'form', message: 'Click the button', serverName: 'playwright' },
      autoApprove: true,
      action: 'accept',
      opens: false,
      prompts: false,
    },
    {
      name: 'auto-approve cannot wave through an unsafe url',
      request: { mode: 'url', url: 'file:///etc/passwd', serverName: 'playwright' },
      autoApprove: true,
      action: 'decline',
      opens: false,
      prompts: false,
    },
  ];

  it.each(cases)('$name', async ({ request, answer, autoApprove, action, opens, prompts }) => {
    promptUser.mockResolvedValue(answer ?? true);

    const decision = await decideMcpElicitation(request, {
      promptUser,
      openExternal,
      autoApprove: autoApprove === undefined ? undefined : () => autoApprove,
    });

    expect(decision.action).toBe(action);
    expect(openExternal).toHaveBeenCalledTimes(opens ? 1 : 0);
    expect(promptUser).toHaveBeenCalledTimes(prompts ? 1 : 0);
  });

  it('names the server in the prompt so the user knows who is asking', async () => {
    await decideMcpElicitation(
      { mode: 'form', message: 'Pick a team', serverName: 'linear' },
      { promptUser, openExternal },
    );

    expect(promptUser).toHaveBeenCalledWith('mcp_elicitation:linear', {
      message: 'Pick a team',
      mode: 'form',
    });
  });

  it('declines everything, including a valid url, when there is no window to ask in', async () => {
    const decision = await decideMcpElicitation(
      { mode: 'url', url: 'https://linear.app/oauth', serverName: 'linear' },
      { openExternal },
    );

    expect(decision).toEqual({ action: 'decline' });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('declines rather than throwing when a handler fails', async () => {
    promptUser.mockRejectedValue(new Error('prompt channel closed'));

    await expect(
      decideMcpElicitation({ mode: 'form', serverName: 'linear' }, { promptUser, openExternal }),
    ).resolves.toEqual({ action: 'decline' });
  });
});

describe('isAutoApprovedCodexMcpServer', () => {
  it.each([
    ['playwright', true],
    ['Playwright', true],
    ['linear', false],
    [undefined, false],
  ])('%s -> %s', (serverName, expected) => {
    expect(isAutoApprovedCodexMcpServer(serverName)).toBe(expected);
  });
});
