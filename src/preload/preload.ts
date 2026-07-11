import { contextBridge } from 'electron';
import { api } from './api';

contextBridge.exposeInMainWorld('api', api);

export type { API, ClaudeModel } from './api';
export type {
  Project,
  Repo,
  Attachment,
  PlanItem,
  PlanRelation,
  PlanAction,
  PlanActionResult,
  Activity,
  TrackerCredentialInfo,
  TrackerConnection,
  TrackerProjectScope,
  TrackerAssociation,
  TrackerAssociationWithScope,
  ImportPreview,
  ImportResult,
  SyncPreview,
  SyncResult,
  ConflictResolution,
  DeletedItemAction,
  TrackerTypeMapping,
  OutboundChangeWithPlanItem,
  ExportPreview,
  ExportResult,
  SyncReviewData,
  ChatMessage,
  Group,
  CustomTheme,
  ImportedCustomThemeResult,
} from './api';
