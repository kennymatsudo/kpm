/**
 * Database Domain Services
 *
 * These services handle complex multi-repository transactions and business logic
 * that is tightly coupled to database operations.
 *
 * Export patterns:
 * - Factory functions for stateful services and executors
 * - Dependency-injected helpers for reusable domain logic
 */

// Multi-repository transaction services
export { createExportService } from './ExportService';
export type { ExportService, ExportServiceDeps } from './ExportService';
export { createImportService } from './ImportService';
export type { ImportService, ImportServiceDeps } from './ImportService';
export { createSyncService } from './SyncService';
export type { SyncService, SyncServiceDeps } from './SyncService';
export { createTypeMappingService } from './TypeMappingService';
export type { TypeMappingService, TypeMappingServiceDeps } from './TypeMappingService';

// Action executors
export { createPlanActionExecutor } from './PlanActionService';
export type { PlanActionExecutorDeps } from './PlanActionService';

// Helper functions (DI-enabled)
export { queueTrackerUpdateIfNeeded, moveSubtasksToPlan } from './PlanItemService';
export type { MoveSubtasksToPlan, PlanItemServiceDeps, QueueTrackerUpdateIfNeeded } from './PlanItemService';

// Outbound-change decision policy (create vs update, association selection, dedup)
export { resolveOperation, applyAutoQueue, queueForTracker } from './OutboundChangePolicy';
export type { OutboundChangePolicyDeps } from './OutboundChangePolicy';
