export interface FileMetadataRow {
  project_id: string;
  path: string;
  content_hash: string;
  summary: string | null;
  summarized_at: string | null;
}

export interface IProjectFileMetadataRepository {
  getByPath(projectId: string, path: string): FileMetadataRow | null;
  getAllForProject(projectId: string): FileMetadataRow[];
  upsertHash(projectId: string, path: string, hash: string): void;
  setSummaryForHash(projectId: string, path: string, hash: string, summary: string): boolean;
  deleteByPath(projectId: string, path: string): void;
  deleteByPathPrefix(projectId: string, prefix: string): void;
}
