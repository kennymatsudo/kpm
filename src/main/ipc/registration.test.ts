/**
 * Guards against silent IPC channel drift.
 *
 * Adding a channel touches three places (shared/ipcChannels.ts, the preload
 * bridge, and a handler registration); forgetting the handler fails only at
 * runtime with a renderer timeout. This test boots the real registrars against
 * the mocked ipcMain and asserts every declared channel is either handled in
 * the main process or listened to as a main→renderer event in the preload.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { ipcMain } from 'electron';
import type { Mock } from 'vitest';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';
import { registerAllIpcHandlers } from './index';
import type { AppServices } from '../services/appServices';

/** Flatten the nested channel registry into "dot.path" -> channel string pairs. */
function flattenChannels(node: unknown, prefix = ''): { path: string; channel: string }[] {
  if (typeof node === 'string') {
    return [{ path: prefix, channel: node }];
  }
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) =>
      flattenChannels(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [];
}

/** Resolve "terminal.data" against IPC_CHANNELS to its channel string. */
function resolveChannelPath(dotPath: string): string | undefined {
  let node: unknown = IPC_CHANNELS;
  for (const segment of dotPath.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Channels the preload bridge subscribes to (main→renderer events). These are
 * pushed via webContents.send and legitimately have no ipcMain handler.
 * Parsed from source so the list maintains itself.
 */
function collectPreloadEventChannels(): Set<string> {
  const channels = new Set<string>();
  for (const file of ['api.ts', 'preload.ts']) {
    const source = readFileSync(path.resolve(__dirname, '../../preload', file), 'utf8');
    for (const match of source.matchAll(/ipcRenderer\.on\(\s*['"`]([^'"`]+)['"`]/g)) {
      channels.add(match[1]);
    }
    for (const match of source.matchAll(/ipcRenderer\.on\(\s*IPC_CHANNELS\.([A-Za-z0-9_$.]+)/g)) {
      const channel = resolveChannelPath(match[1]);
      if (channel) channels.add(channel);
    }
  }
  return channels;
}

/**
 * A stand-in for the service container: every property access and call
 * returns another stub. Registrars only wire handler closures at boot, so no
 * real service behavior is needed.
 */
function createServiceStub(): unknown {
  const callable = () => createServiceStub();
  return new Proxy(callable, {
    get: (_target, prop) => {
      if (prop === Symbol.toPrimitive || prop === 'toString') return () => 'service-stub';
      return createServiceStub();
    },
    apply: () => createServiceStub(),
  });
}

describe('IPC channel registration', () => {
  it('every declared channel has a handler or is a preload-subscribed event', () => {
    // Capture the spies before registerAllIpcHandlers: the trusted-sender
    // guard reassigns ipcMain.handle (wrapping the original, so calls still
    // land on these mocks).
    const handleSpy = ipcMain.handle as unknown as Mock;
    const onSpy = ipcMain.on as unknown as Mock;

    registerAllIpcHandlers(
      (): BrowserWindow | null => null,
      createServiceStub() as AppServices
    );

    const registered = new Set<string>([
      ...handleSpy.mock.calls.map((call) => call[0] as string),
      ...onSpy.mock.calls.map((call) => call[0] as string),
    ]);
    const preloadEvents = collectPreloadEventChannels();
    expect(registered.size).toBeGreaterThan(0);
    expect(preloadEvents.size).toBeGreaterThan(0);

    const unwired = flattenChannels(IPC_CHANNELS).filter(
      ({ channel }) => !registered.has(channel) && !preloadEvents.has(channel)
    );

    expect(
      unwired,
      'Declared in IPC_CHANNELS but neither handled in main nor subscribed in preload. ' +
        'Register a handler (src/main/ipc/register/) or remove the dead channel.'
    ).toEqual([]);
  });
});
