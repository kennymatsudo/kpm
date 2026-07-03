import type { SearchResult } from '../../shared/types';

export function searchProject(projectId: string, query: string): Promise<SearchResult[]> {
  return window.api.search.global({ projectId, query });
}
