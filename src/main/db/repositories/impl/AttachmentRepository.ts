/**
 * Attachment Repository Implementation - Dependency Injection Version
 */

import type { Attachment } from '../../../../shared/types';
import type { IAttachmentRepository } from '../../interfaces';

export class AttachmentRepository implements IAttachmentRepository {

  getByProject(projectId: string): Attachment[] {
  }

  add(projectId: string, sourcePath: string, filename: string): Attachment {
  }

  get(id: string): Attachment | undefined {
  }

  delete(id: string): void {
  }

  remove(id: string): void {
    this.delete(id);
  }
}
