import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionRequest } from '../../shared/types';
import { usePermissionStore } from './permissionStore';
import { respondToPermissionRequest } from '../services/permissionService';

vi.mock('../services/permissionService', () => ({
  respondToPermissionRequest: vi.fn().mockResolvedValue(undefined),
}));

function request(requestId: string, chatSessionId: string | null): PermissionRequest {
  return {
    requestId,
    projectId: 'project-1',
    chatSessionId,
    toolName: 'Write',
    targetPath: '/tmp/file.ts',
    preview: 'Write /tmp/file.ts',
    kind: 'write-access',
  };
}

describe('permissionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePermissionStore.setState({
      pendingRequests: new Map(),
      unscopedPendingRequests: [],
      writeGrants: new Map(),
    });
  });

  it('keeps concurrent requests attached to their conversations', () => {
    usePermissionStore.getState().enqueueRequest(request('request-1', 'chat-1'));
    usePermissionStore.getState().enqueueRequest(request('request-2', 'chat-2'));

    expect(usePermissionStore.getState().pendingRequests.get('chat-1')?.[0]?.requestId).toBe('request-1');
    expect(usePermissionStore.getState().pendingRequests.get('chat-2')?.[0]?.requestId).toBe('request-2');
  });

  it('removes only the answered request and advances that conversation queue', async () => {
    const first = request('request-1', 'chat-1');
    const second = request('request-2', 'chat-1');
    const other = request('request-3', 'chat-2');
    usePermissionStore.getState().enqueueRequest(first);
    usePermissionStore.getState().enqueueRequest(second);
    usePermissionStore.getState().enqueueRequest(other);

    usePermissionStore.getState().respond(first, 'allow');

    await vi.waitFor(() => {
      expect(usePermissionStore.getState().pendingRequests.get('chat-1')?.[0]?.requestId).toBe('request-2');
    });
    expect(usePermissionStore.getState().pendingRequests.get('chat-2')?.[0]?.requestId).toBe('request-3');
    expect(respondToPermissionRequest).toHaveBeenCalledWith('request-1', 'project-1', 'allow');
  });
});
