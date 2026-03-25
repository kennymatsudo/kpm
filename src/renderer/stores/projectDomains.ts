import type { StoreApi, UseBoundStore } from 'zustand';
import { useProjectStore } from './projectStore';
import type {
  ProjectDomainState,
  PlanDomainState,
  ResourceDomainState,
  UiDomainState,
} from './project/types';

type ProjectDomainStore = UseBoundStore<StoreApi<ProjectDomainState>>;
type PlanDomainStore = UseBoundStore<StoreApi<PlanDomainState>>;
type ResourceDomainStore = UseBoundStore<StoreApi<ResourceDomainState>>;
type UiDomainStore = UseBoundStore<StoreApi<UiDomainState>>;

function asDomainStore<TDomainState>(): UseBoundStore<StoreApi<TDomainState>> {
  return useProjectStore as unknown as UseBoundStore<StoreApi<TDomainState>>;
}

/**
 * Domain-scoped views over the single project store.
 *
 * These preserve the narrower selector/action surface for consumers without
 * duplicating state into synchronized child stores.
 */
export const useProjectDomainStore = asDomainStore<ProjectDomainState>() as ProjectDomainStore;
export const usePlanDomainStore = asDomainStore<PlanDomainState>() as PlanDomainStore;
export const useResourceDomainStore = asDomainStore<ResourceDomainState>() as ResourceDomainStore;
export const useProjectUiDomainStore = asDomainStore<UiDomainState>() as UiDomainStore;

