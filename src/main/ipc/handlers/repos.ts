import type { RepoService } from '../../services/repo/RepoService';
import { IPC_CHANNELS } from '../channels';

export function registerRepoHandlers(
  getMainWindow: () => BrowserWindow | null,
  repoService: RepoService,
): void {
}
