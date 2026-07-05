import { BrowserWindow } from 'electron';
import { broadcastAppEvent, type EventDefinition, type EventPayload } from '../../../shared/ipc/appEvents';

export interface SessionStatusPayload {
  id: string;
  project_id: string;
  status: string;
}

export function createStatusBroadcaster<T extends SessionStatusPayload, E extends EventDefinition>(
  event: E
): (session: T) => void {
  return (session: T) => {
    const windows = BrowserWindow.getAllWindows();
    broadcastAppEvent(
      windows.map((win) => win.webContents),
      event,
      {
        sessionId: session.id,
        projectId: session.project_id,
        status: session.status,
      } as EventPayload<E>
    );
  };
}
