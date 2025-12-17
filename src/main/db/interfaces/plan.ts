  /**
   * Batch reparent multiple items efficiently using a single prepared statement.
   * Each update sets parent_id and resets status to 'planned'.
   * @returns Array of item IDs that were successfully updated
   */
  batchReparent(updates: { id: string; parentId: string | null }[]): string[];
