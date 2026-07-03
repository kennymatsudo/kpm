import { BrowserWindow } from 'electron';

export interface SessionStatusPayload {
  id: string;
  project_id: string;
  status: string;
}

export function createStatusBroadcaster<T extends SessionStatusPayload>(
  channel: string
): (session: T) => void {
  return (session: T) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, {
          sessionId: session.id,
          projectId: session.project_id,
          status: session.status,
        });
      }
    }
  };
}
