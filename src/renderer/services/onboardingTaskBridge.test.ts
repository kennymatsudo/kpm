import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initOnboardingTaskBridge, type OnboardingTaskMeta } from './onboardingTaskBridge';
import { useBackgroundTaskStore, type BackgroundTask } from '../stores/backgroundTaskStore';
import { useApprovalQueueStore } from '../stores/approvalQueueStore';
import { useContextRegenerationStore } from '../stores/contextRegenerationStore';
import { useProjectDomainStore } from '../stores/projectDomains';

type OnboardingCompleteHandler = (event: { taskId: string; content: string }) => void;

function installOnboardingApi() {
  let onCompleteHandler: OnboardingCompleteHandler | undefined;
  const readContextFile = vi.fn().mockResolvedValue({ success: true, content: 'existing content' });

  (globalThis as unknown as { window: unknown }).window = {
    api: {
      contextFile: { read: readContextFile },
      onboarding: {
        generate: vi.fn(),
        onProgress: vi.fn().mockReturnValue(() => {}),
        onThinking: vi.fn().mockReturnValue(() => {}),
        onComplete: vi.fn((handler: OnboardingCompleteHandler) => {
          onCompleteHandler = handler;
          return () => {};
        }),
        onError: vi.fn().mockReturnValue(() => {}),
      },
    },
  };

  return { readContextFile, getOnCompleteHandler: () => onCompleteHandler! };
}

function seedTask(taskId: string, meta: OnboardingTaskMeta) {
  const task: BackgroundTask = {
    id: taskId,
    kind: 'onboarding',
    label: 'Generating context',
    status: 'running',
    startedAt: 0,
    lastUpdatedAt: 0,
    messages: [],
    meta,
  };
  useBackgroundTaskStore.setState({ tasks: { [taskId]: task } });
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('onboardingTaskBridge onComplete routing', () => {
  beforeEach(() => {
    useBackgroundTaskStore.setState({ tasks: {} });
    useContextRegenerationStore.setState({ isOpen: false, resumeTaskId: null });
    useProjectDomainStore.setState({ currentProjectId: 'project-1' } as never);
    useApprovalQueueStore.setState({ processContextFileUpdate: vi.fn() });
  });

  it('routes into the approval queue and dismisses the badge when the task matches the open project', async () => {
    const { readContextFile, getOnCompleteHandler } = installOnboardingApi();
    seedTask('task-1', { projectId: 'project-1', projectName: 'Project One' });

    initOnboardingTaskBridge();
    getOnCompleteHandler()({ taskId: 'task-1', content: 'generated content' });
    await flushMicrotasks();

    expect(readContextFile).toHaveBeenCalledWith('project-1');
    expect(useApprovalQueueStore.getState().processContextFileUpdate).toHaveBeenCalledWith(
      'project-1',
      'existing content',
      'generated content',
    );
    expect(useBackgroundTaskStore.getState().tasks['task-1']).toBeUndefined();
  });

  it('keeps the badge-resume behavior when the regeneration modal is open', async () => {
    const { getOnCompleteHandler } = installOnboardingApi();
    useContextRegenerationStore.setState({ isOpen: true });
    seedTask('task-1', { projectId: 'project-1', projectName: 'Project One' });

    initOnboardingTaskBridge();
    getOnCompleteHandler()({ taskId: 'task-1', content: 'generated content' });
    await flushMicrotasks();

    expect(useApprovalQueueStore.getState().processContextFileUpdate).not.toHaveBeenCalled();
    const task = useBackgroundTaskStore.getState().tasks['task-1'];
    expect(task?.status).toBe('completed');
    expect(task?.result).toBe('generated content');
  });

  it('keeps the badge-resume behavior when the task belongs to a different project', async () => {
    const { getOnCompleteHandler } = installOnboardingApi();
    seedTask('task-1', { projectId: 'other-project', projectName: 'Other Project' });

    initOnboardingTaskBridge();
    getOnCompleteHandler()({ taskId: 'task-1', content: 'generated content' });
    await flushMicrotasks();

    expect(useApprovalQueueStore.getState().processContextFileUpdate).not.toHaveBeenCalled();
    const task = useBackgroundTaskStore.getState().tasks['task-1'];
    expect(task?.status).toBe('completed');
    expect(task?.result).toBe('generated content');
  });
});
