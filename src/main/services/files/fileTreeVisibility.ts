/** Entries hidden from project/repo file trees because they are tool-owned or high-volume caches. */
export const HIDDEN_FILE_TREE_ENTRIES = [
  '.git',
  'node_modules',
  '.DS_Store',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.cache',
] as const;

const HIDDEN_FILE_TREE_ENTRY_SET = new Set<string>(HIDDEN_FILE_TREE_ENTRIES);

/** Directory entries that the native watcher can skip entirely. */
export const HIDDEN_FILE_TREE_DIRECTORY_ENTRIES = HIDDEN_FILE_TREE_ENTRIES.filter(
  (entry) => entry !== '.DS_Store',
);

export function shouldHideFileTreeEntry(name: string): boolean {
  return HIDDEN_FILE_TREE_ENTRY_SET.has(name);
}

export function containsHiddenFileTreeSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some(shouldHideFileTreeEntry);
}

export function getNativeWatcherIgnoreGlobs(): string[] {
  return HIDDEN_FILE_TREE_DIRECTORY_ENTRIES.map((entry) => `**/${entry}/**`);
}
