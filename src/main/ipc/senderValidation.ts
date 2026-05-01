import { ipcMain } from 'electron';
import { isTrustedAppUrl } from '../security/appUrl';

type IpcSenderEvent = Electron.IpcMainEvent | Electron.IpcMainInvokeEvent;

let trustedSenderGuardInstalled = false;

export function assertTrustedIpcSender(event: IpcSenderEvent): void {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  if (isTrustedAppUrl(senderUrl)) {
    return;
  }

  console.warn(`[IPC] Blocked IPC from untrusted sender: ${senderUrl || '<unknown>'}`);
  throw new Error('Blocked IPC from untrusted renderer');
}

/**
 * Applies sender validation to every subsequently registered ipcMain.handle()
 * listener. Most handlers already use validation wrappers, but several legacy
 * handlers are direct; installing this before registration keeps coverage
 * consistent without changing every callsite.
 */
export function installTrustedIpcSenderGuard(): void {
  if (trustedSenderGuardInstalled) {
    return;
  }

  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = ((channel, listener) => originalHandle(channel, async (event, ...args: unknown[]): Promise<unknown> => {
    assertTrustedIpcSender(event);
    return Reflect.apply(listener, undefined, [event, ...args]) as unknown;
  })) as typeof ipcMain.handle;

  trustedSenderGuardInstalled = true;
}
