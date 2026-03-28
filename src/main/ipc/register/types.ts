import type { BrowserWindow } from 'electron';
import type { AppServices } from '../../services/appServices';
import type { ChatRuntimeService } from '../../services/core/ChatRuntimeService';

export interface IpcRegistrationContext {
  getMainWindow: () => BrowserWindow | null;
  services: AppServices;
  chatRuntime: ChatRuntimeService;
}
