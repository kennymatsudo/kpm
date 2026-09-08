import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionRequest } from '../../shared/types';
import { selectUnseenRequests, usePermissionStore } from './permissionStore';
import { respondToPermissionRequest } from '../services/permissionService';

vi.mock('../services/permissionService', () => ({
  respondToPermissionRequest: vi.fn().mockResolvedValue(undefined),
}));

function request(
  requestId: string,
  chatSessionId: string | null,
  projectId = 'project-1'
): PermissionRequest {
  return {
    requestId,
    projectId,
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

  it('drops a request main gave up on without an answer', () => {
    usePermissionStore.getState().enqueueRequest(request('request-1', 'chat-1'));
    usePermissionStore.getState().enqueueRequest(request('request-2', 'chat-1'));
    usePermissionStore.getState().enqueueRequest(request('request-3', null));

    usePermissionStore.getState().settleRequest('request-1');
    usePermissionStore.getState().settleRequest('request-3');

    expect(usePermissionStore.getState().pendingRequests.get('chat-1')?.map((r) => r.requestId)).toEqual([
      'request-2',
    ]);
    expect(usePermissionStore.getState().unscopedPendingRequests).toEqual([]);
  });

  it('forgets a conversation once its last request settles', () => {
    usePermissionStore.getState().enqueueRequest(request('request-1', 'chat-1'));

    usePermissionStore.getState().settleRequest('request-1');

    expect(usePermissionStore.getState().pendingRequests.has('chat-1')).toBe(false);
  });
});

describe('selectUnseenRequests', () => {
  beforeEach(() => {
    usePermissionStore.setState({
      pendingRequests: new Map(),
      unscopedPendingRequests: [],
      writeGrants: new Map(),
    });
  });

  it('skips the viewed conversation, whose prompt already renders inline', () => {
    usePermissionStore.getState().enqueueRequest(request('viewed', 'chat-1'));
    usePermissionStore.getState().enqueueRequest(request('background', 'chat-2'));

    const unseen = selectUnseenRequests(usePermissionStore.getState(), 'chat-1');

    expect(unseen.map((r) => r.requestId)).toEqual(['background']);
  });

  it('surfaces a request from a project that is not open', () => {
    usePermissionStore.getState().enqueueRequest(request('elsewhere', 'chat-9', 'project-2'));

    const unseen = selectUnseenRequests(usePermissionStore.getState(), 'chat-1');

    expect(unseen.map((r) => r.projectId)).toEqual(['project-2']);
  });

  it('holds back unscoped requests only while no conversation is viewed', () => {
    usePermissionStore.getState().enqueueRequest(request('unscoped', null));

    expect(selectUnseenRequests(usePermissionStore.getState(), null)).toEqual([]);
    expect(selectUnseenRequests(usePermissionStore.getState(), 'chat-1').map((r) => r.requestId)).toEqual([
      'unscoped',
    ]);
  });
});
