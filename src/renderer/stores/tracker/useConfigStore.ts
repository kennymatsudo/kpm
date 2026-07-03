import { create } from 'zustand';
import type { CustomFieldValues, JiraCustomField, StatusMapping } from '../../../shared/types';
import {
  getRecentTrackerIssues,
  listTrackerCustomFields,
  searchTrackerIssues,
  searchTrackerIssuesByJql,
  updateTrackerAssociationCustomFieldValues,
  updateTrackerAssociationStatusMapping,
} from '../../services/trackerService';

export interface TrackerBrowsableIssue {
  key: string;
  title: string;
  issueType: string;
  status: string;
}

interface TrackerConfigState {
  customFieldsByContext: Record<string, JiraCustomField[]>;
  customFieldsLastFetchedAt: Record<string, number>;
  error: string | null;
  loadRecentIssues: (
    projectKey: string,
    issueType?: string
  ) => Promise<{ success: boolean; issues?: TrackerBrowsableIssue[]; error?: string }>;
  searchIssues: (
    projectKey: string,
    query: string,
    issueType?: string
  ) => Promise<{ success: boolean; issues?: TrackerBrowsableIssue[]; error?: string }>;
  loadChildIssues: (
    projectKey: string,
    parentIssueKey: string
  ) => Promise<{ success: boolean; issues?: TrackerBrowsableIssue[]; error?: string }>;
  loadCustomFields: (
    projectKey: string,
    issueTypeId: string,
    existingValues?: CustomFieldValues | null,
    force?: boolean
  ) => Promise<{
    success: boolean;
    fields?: JiraCustomField[];
    suggestedValues?: CustomFieldValues;
    error?: string;
  }>;
  saveStatusMapping: (
    associationId: string,
    statusMapping: StatusMapping
  ) => Promise<{ success: boolean; savedMapping: StatusMapping | null; error?: string }>;
  saveCustomFieldValues: (
    associationId: string,
    customFieldValues: CustomFieldValues
  ) => Promise<{ success: boolean; savedValues: CustomFieldValues | null; error?: string }>;
  clearError: () => void;
  reset: () => void;
  resetProjectState: () => void;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

const initialState = {
  customFieldsByContext: {} as Record<string, JiraCustomField[]>,
  customFieldsLastFetchedAt: {} as Record<string, number>,
  error: null as string | null,
};

function buildCustomFieldContextKey(projectKey: string, issueTypeId: string): string {
  return `${projectKey}:${issueTypeId}`;
}

function getSupportedCustomFields(fields: JiraCustomField[]): JiraCustomField[] {
  return fields
    .filter((field) => field.type === 'string' || field.type === 'option')
    .sort((a, b) => {
      if (a.required !== b.required) {
        return a.required ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

function getSuggestedCustomFieldValues(
  fields: JiraCustomField[],
  existingValues?: CustomFieldValues | null
): CustomFieldValues {
  const suggestedValues: CustomFieldValues = {};

  for (const field of fields) {
    if (field.defaultValue && !existingValues?.[field.id]) {
      suggestedValues[field.id] = field.defaultValue;
    }
  }

  return suggestedValues;
}

function cleanStatusMapping(statusMapping: StatusMapping): StatusMapping | null {
  const cleanedMapping: StatusMapping = {};

  if (statusMapping.not_started) cleanedMapping.not_started = statusMapping.not_started;
  if (statusMapping.in_progress) cleanedMapping.in_progress = statusMapping.in_progress;
  if (statusMapping.in_review) cleanedMapping.in_review = statusMapping.in_review;
  if (statusMapping.done) cleanedMapping.done = statusMapping.done;
  if (statusMapping.blocked) cleanedMapping.blocked = statusMapping.blocked;
  if (statusMapping.canceled) cleanedMapping.canceled = statusMapping.canceled;

  return Object.keys(cleanedMapping).length > 0 ? cleanedMapping : null;
}

function cleanCustomFieldValues(customFieldValues: CustomFieldValues): CustomFieldValues | null {
  const cleanedValues = Object.entries(customFieldValues).reduce<CustomFieldValues>(
    (acc, [fieldId, value]) => {
      if (value) {
        acc[fieldId] = value;
      }
      return acc;
    },
    {}
  );

  return Object.keys(cleanedValues).length > 0 ? cleanedValues : null;
}

export const useTrackerConfigStore = create<TrackerConfigState>((set, get) => ({
  ...initialState,

  loadRecentIssues: async (projectKey, issueType) => {
    set({ error: null });

    try {
      const result = issueType
        ? await searchTrackerIssuesByJql({
            projectKey,
            jql: `project = ${projectKey} AND type = ${issueType} ORDER BY updated DESC`,
          })
        : await getRecentTrackerIssues({ projectKey });

      if (result.success && result.issues) {
        return { success: true, issues: result.issues };
      }

      const error = result.error || 'Failed to load issues';
      set({ error });
      return { success: false, error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load issues';
      set({ error });
      return { success: false, error };
    }
  },

  searchIssues: async (projectKey, query, issueType) => {
    set({ error: null });

    try {
      const result = issueType
        ? await searchTrackerIssuesByJql({
            projectKey,
            jql: `project = ${projectKey} AND type = ${issueType} AND (key ~ "${query}" OR summary ~ "${query}*") ORDER BY updated DESC`,
          })
        : await searchTrackerIssues({ projectKey, searchText: query });

      if (result.success && result.issues) {
        return { success: true, issues: result.issues };
      }

      const error = result.error || 'Failed to search issues';
      set({ error });
      return { success: false, error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to search issues';
      set({ error });
      return { success: false, error };
    }
  },

  loadChildIssues: async (projectKey, parentIssueKey) => {
    set({ error: null });

    try {
      const result = await searchTrackerIssuesByJql({
        projectKey,
        jql: `parent = ${parentIssueKey}`,
      });
      if (result.success && result.issues) {
        return { success: true, issues: result.issues };
      }

      const error = result.error || 'Failed to load child issues';
      set({ error });
      return { success: false, error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load child issues';
      set({ error });
      return { success: false, error };
    }
  },

  loadCustomFields: async (projectKey, issueTypeId, existingValues, force = false) => {
    if (!issueTypeId) {
      return { success: true, fields: [], suggestedValues: {} };
    }

    const contextKey = buildCustomFieldContextKey(projectKey, issueTypeId);
    const cachedFields = get().customFieldsByContext[contextKey];
    const lastFetchedAt = get().customFieldsLastFetchedAt[contextKey];

    if (
      !force &&
      cachedFields &&
      lastFetchedAt &&
      Date.now() - lastFetchedAt < CACHE_TTL_MS
    ) {
      return {
        success: true,
        fields: cachedFields,
        suggestedValues: getSuggestedCustomFieldValues(cachedFields, existingValues),
      };
    }

    set({ error: null });

    try {
      const result = await listTrackerCustomFields({ projectKey, issueTypeId });
      if (result.success && result.fields) {
        const supportedFields = getSupportedCustomFields(result.fields);
        set((state) => ({
          customFieldsByContext: {
            ...state.customFieldsByContext,
            [contextKey]: supportedFields,
          },
          customFieldsLastFetchedAt: {
            ...state.customFieldsLastFetchedAt,
            [contextKey]: Date.now(),
          },
        }));
        return {
          success: true,
          fields: supportedFields,
          suggestedValues: getSuggestedCustomFieldValues(supportedFields, existingValues),
        };
      }

      const error = result.error || 'Failed to load custom fields';
      set({ error });
      return { success: false, error };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load custom fields';
      set({ error });
      return { success: false, error };
    }
  },

  saveStatusMapping: async (associationId, statusMapping) => {
    set({ error: null });

    try {
      const savedMapping = cleanStatusMapping(statusMapping);
      const result = await updateTrackerAssociationStatusMapping({
        associationId,
        statusMapping: savedMapping,
      });
      if (!result.success) {
        const error = result.error || 'Failed to save mapping';
        set({ error });
        return { success: false, error, savedMapping };
      }

      return { success: true, savedMapping };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to save mapping';
      set({ error });
      return { success: false, error, savedMapping: cleanStatusMapping(statusMapping) };
    }
  },

  saveCustomFieldValues: async (associationId, customFieldValues) => {
    set({ error: null });

    try {
      const savedValues = cleanCustomFieldValues(customFieldValues);
      const result = await updateTrackerAssociationCustomFieldValues({
        associationId,
        customFieldValues: savedValues,
      });
      if (!result.success) {
        const error = result.error || 'Failed to save custom fields';
        set({ error });
        return { success: false, error, savedValues };
      }

      return { success: true, savedValues };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to save custom fields';
      set({ error });
      return { success: false, error, savedValues: cleanCustomFieldValues(customFieldValues) };
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
  resetProjectState: () => set(initialState),
}));
