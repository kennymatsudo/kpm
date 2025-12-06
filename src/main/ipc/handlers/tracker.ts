import { ipcMain, type BrowserWindow } from 'electron';
import type {
  SyncPreview,

  // ============================================
  // Credentials (stored in OS keychain via keytar)
  // ============================================

  });

    const { siteUrl, email, apiToken } = TrackerSchemas.saveJiraCredentials.parse(params);
  });

  });

    const { siteUrl, email, apiToken } = TrackerSchemas.testJiraConnection.parse(params);
  });

  // ============================================
  // Three-Level Tracker Architecture (ADR-002)
  // ============================================

  // Level 1: Connections
  });

  // Level 2: Jira Project Scopes
    const { connectionId } = TrackerSchemas.getScopes.parse(params);
  });

    const { connectionId, projectKey, projectName } = TrackerSchemas.addScope.parse(params);
  });

    const { projectId } = TrackerSchemas.getAssociations.parse(params);
  });

  });

    const { associationId } = TrackerSchemas.removeAssociation.parse(params);
  });

    const { associationId } = TrackerSchemas.hasImported.parse(params);
  });

  });

  // Issue search for JQL builder
    const { projectKey, searchText } = TrackerSchemas.searchIssues.parse(params);
  });

    const { projectKey } = TrackerSchemas.recentIssues.parse(params);
  });

  // Search issues by JQL (for previewing children, etc.)
    const { projectKey, jql } = TrackerSchemas.searchIssuesByJql.parse(params);
  });

    const { projectKey } = TrackerSchemas.projectLabels.parse(params);
  });

    const { projectKey } = TrackerSchemas.projectComponents.parse(params);
  });

  // ============================================
  // Import (First-Time) - Now uses associations with JQL
  // ============================================

    const { projectId, associationId } = TrackerSchemas.importPreview.parse(params);
  });

    const { projectId, associationId, selectedTypes } = TrackerSchemas.importApply.parse(params);
  });

    const { projectId, associationId } = TrackerSchemas.importPreview.parse(params);
  });

  // ============================================
  // Sync Operations (Subsequent syncs after initial import)
  // ============================================

    const { projectId, associationId } = TrackerSchemas.syncPreview.parse(params);
  });

    const { projectId, preview, resolutions, deletedAction, deletedDecisions } = TrackerSchemas.syncApply.parse(params);
    try {
        projectId,
        preview as SyncPreview,
      );
      return { success: result.success, result };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed to apply sync changes. Your local data is unchanged.' };
    }
  });
}
