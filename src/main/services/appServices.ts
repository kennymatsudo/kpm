import * as path from 'path';
import * as fs from 'fs/promises';
import type { IRepositoryContainer } from '../db/interfaces';

export function createAppServices(container: IRepositoryContainer) {
  const planService = createPlanService({
    planItems: container.planItems,
    planRelations: container.planRelations,
  });

  const attachmentService = createAttachmentService({
    attachments: container.attachments,
    projects: container.projects,
    fs,
    path,
  });

    planService,
    attachmentService,
    repoService,
  };
}
