import type { TreeRoot } from './changesTree';

/** Changed files grouped by root and directory; a click jumps to the file's section. */
export function ChangesFileTree({
  roots,
  width,
  onSelect,
}: {
  roots: TreeRoot[];
  width: number;
  onSelect: (key: string) => void;
}) {
  return (
    <nav aria-label="Changed files" className="flex-shrink-0 overflow-y-auto py-2" style={{ width }}>
      {roots.map((root) => (
        <div key={root.rootPath} className="mb-2">
          <div className="truncate px-3 py-1 text-tiny font-medium uppercase text-text-muted" title={root.rootPath}>
            {root.label}
          </div>
          {root.dirs.map((group) => (
            <div key={group.dir}>
              {group.dir && (
                <div className="truncate px-3 py-0.5 text-tiny text-text-muted" title={group.dir}>
                  {group.dir}
                </div>
              )}
              {group.files.map((file) => (
                <button
                  key={file.key}
                  type="button"
                  className={`flex w-full items-center gap-2 py-1 pr-3 text-left text-sm text-text-primary hover:bg-depth-2 ${
                    group.dir ? 'pl-5' : 'pl-3'
                  }`}
                  onClick={() => onSelect(file.key)}
                >
                  <span className="min-w-0 flex-1 truncate">{file.base}</span>
                  {file.commentCount > 0 && (
                    <span className="flex-shrink-0 rounded-full bg-accent-subtle px-1.5 text-tiny text-accent">
                      {file.commentCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
}
