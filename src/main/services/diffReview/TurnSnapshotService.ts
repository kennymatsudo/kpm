import { randomUUID } from 'crypto';
import type { DiffScope, FileDiff, TurnChanges, TurnFileChange } from '../../../shared/diffReview';
import { parseUnifiedDiff } from '../../../shared/unifiedDiff';
import type { ITurnSnapshotRepository, TurnSnapshotRow } from '../../db/interfaces';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';
import * as realGit from './gitSnapshot';
import type {
  SnapshotStore,
  changedPaths,
  diffStats,
  diffTrees,
  filesInCommitsSince,
  headCommit,
  headTree,
  snapshotRoot,
} from './gitSnapshot';
import { attributeHeadMove } from './headMove';

const DEFAULT_TIMEOUT_MS = 20_000;
/** Git's well-known empty tree, the stand-in for an unborn HEAD. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
/** Clock slack between the turn start and a commit's committer date. */
const COMMIT_CLOCK_SLACK_SECONDS = 2;
const EXPIRED_MARKERS = ['bad object', 'not a tree object', 'Invalid revision'];

export interface TurnSnapshotServiceDeps {
  snapshots: ITurnSnapshotRepository;
  resolveRoots: (projectId: string) => string[];
  shadowDir: string;
  timeoutMs?: number;
  emitTurnChanges: (projectId: string, changes: TurnChanges) => void;
  git?: {
    snapshotRoot: typeof snapshotRoot;
    diffTrees: typeof diffTrees;
    diffStats: typeof diffStats;
    headTree: typeof headTree;
    headCommit: typeof headCommit;
    changedPaths: typeof changedPaths;
    filesInCommitsSince: typeof filesInCommitsSince;
  };
}

interface OpenRoot {
  rowId: string;
  rootPath: string;
  store: SnapshotStore;
  beforeTree: string;
  /** HEAD commit at the turn start; null when unborn, undefined for shadow roots or a failed lookup. */
  headCommit?: string | null;
  /** Turn start in epoch seconds. */
  startedAt: number;
}

interface OpenTurn {
  projectId: string;
  clientMessageId: string;
  roots: OpenRoot[];
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createTurnSnapshotService(deps: TurnSnapshotServiceDeps) {
  const { snapshots, resolveRoots, emitTurnChanges } = deps;
  const options = { shadowDir: deps.shadowDir, timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS };
  const open = new Map<string, OpenTurn>();
  const sessionChains = new Map<string, Promise<unknown>>();
  const rootChains = new Map<string, Promise<unknown>>();
  /** Turns whose before-snapshot outlasted the send wait; keyed by session and user message. */
  const late = new Set<string>();
  const lateKey = (chatSessionId: string, clientMessageId: string) => `${chatSessionId}\n${clientMessageId}`;

  const git = deps.git ?? realGit;

  function chain<T>(chains: Map<string, Promise<unknown>>, key: string, fn: () => Promise<T>): Promise<T> {
    const run = (chains.get(key) ?? Promise.resolve()).then(fn, fn);
    const tail = run.catch(() => undefined);
    chains.set(key, tail);
    void tail.then(() => {
      if (chains.get(key) === tail) chains.delete(key);
    });
    return run;
  }

  /** Two chats can share a root, and the first shadow init must not race. */
  async function snapshot(rootPath: string) {
    return chain(rootChains, rootPath, () => git.snapshotRoot(rootPath, options));
  }

  /** Repo roots only. A failed lookup returns undefined so the turn falls back to unfiltered files. */
  async function currentHead(root: { rootPath: string; store: SnapshotStore }): Promise<string | null | undefined> {
    if (root.store !== 'repo') return undefined;
    try {
      return await git.headCommit(root.rootPath, options);
    } catch {
      return undefined;
    }
  }

  /** Drops files that changed only because HEAD moved during the turn. */
  async function withoutHeadMoveFiles(
    root: OpenRoot,
    after: { rootPath: string; store: SnapshotStore; tree: string },
    afterHead: string | null,
    files: TurnFileChange[],
  ): Promise<TurnFileChange[]> {
    const beforeHead = root.headCommit ?? null;
    const sinceEpoch = root.startedAt - COMMIT_CLOCK_SLACK_SECONDS;
    const [dirtyBefore, dirtyAfter, headMoved, turnCommitFiles] = await Promise.all([
      git.changedPaths(after, beforeHead ?? EMPTY_TREE, root.beforeTree, options),
      git.changedPaths(after, afterHead ?? EMPTY_TREE, after.tree, options),
      git.changedPaths(after, beforeHead ?? EMPTY_TREE, afterHead ?? EMPTY_TREE, options),
      afterHead
        ? git.filesInCommitsSince(root.rootPath, beforeHead, afterHead, sinceEpoch, options)
        : Promise.resolve(new Set<string>()),
    ]);
    return attributeHeadMove({ files, dirtyBefore, dirtyAfter, headMoved, turnCommitFiles });
  }

  function insertRow(projectId: string, chatSessionId: string, clientMessageId: string, root: OpenRoot): void {
    snapshots.insertBefore({
      id: root.rowId,
      projectId,
      chatSessionId,
      clientMessageId,
      rootPath: root.rootPath,
      store: root.store,
      beforeTree: root.beforeTree,
    });
  }

  async function begin(input: { projectId: string; chatSessionId: string; clientMessageId: string }): Promise<void> {
    if (open.has(input.chatSessionId)) await end(input.chatSessionId);
    const rootPaths = resolveRoots(input.projectId);
    const results = await Promise.allSettled(rootPaths.map((rootPath) => snapshot(rootPath)));
    const roots: OpenRoot[] = [];
    const heads = await Promise.all(results.map(async (r) => (r.status === 'fulfilled' ? currentHead(r.value) : undefined)));
    const startedAt = Math.floor(Date.now() / 1000);
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`[TurnSnapshot] skipped ${rootPaths[index]}: ${messageOf(result.reason)}`);
        return;
      }
      const root: OpenRoot = {
        rowId: randomUUID(),
        rootPath: result.value.rootPath,
        store: result.value.store,
        beforeTree: result.value.tree,
        headCommit: heads[index],
        startedAt,
      };
      try {
        insertRow(input.projectId, input.chatSessionId, input.clientMessageId, root);
        roots.push(root);
      } catch (error) {
        console.warn(`[TurnSnapshot] could not record ${root.rootPath}: ${messageOf(error)}`);
      }
    });
    if (roots.length > 0) {
      open.set(input.chatSessionId, { projectId: input.projectId, clientMessageId: input.clientMessageId, roots });
    }
  }

  async function end(chatSessionId: string, next?: { clientMessageId: string }): Promise<void> {
    const turn = open.get(chatSessionId);
    if (!turn) return;
    open.delete(chatSessionId);
    const incomplete = late.delete(lateKey(chatSessionId, turn.clientMessageId));

    const outcomes = await Promise.all(
      turn.roots.map(async (root) => {
        const recordFailure = (message: string): void => {
          try {
            snapshots.fail(root.rowId, message);
          } catch (dbError) {
            console.warn(`[TurnSnapshot] could not record failure for ${root.rootPath}: ${messageOf(dbError)}`);
          }
        };
        let after: Awaited<ReturnType<typeof snapshot>>;
        try {
          after = await snapshot(root.rootPath);
        } catch (error) {
          const message = messageOf(error);
          recordFailure(message);
          return { root, afterTree: null, afterHead: undefined, files: [] as TurnFileChange[], error: message };
        }
        const afterHead = root.headCommit === undefined ? undefined : await currentHead(after);
        // The after tree stays usable as the next turn's start even when diffing or saving fails.
        try {
          let files: TurnFileChange[] = [];
          if (after.tree !== root.beforeTree) {
            files = await git.diffStats(after, root.beforeTree, after.tree, options);
            if (files.length > 0 && afterHead !== undefined && afterHead !== root.headCommit) {
              try {
                files = await withoutHeadMoveFiles(root, after, afterHead, files);
              } catch (error) {
                console.warn(`[TurnSnapshot] could not attribute HEAD move in ${root.rootPath}: ${messageOf(error)}`);
              }
            }
          }
          if (files.length > 0) snapshots.finish(root.rowId, after.tree, files, incomplete);
          else snapshots.delete(root.rowId);
          return { root, afterTree: after.tree, afterHead, files, error: null as string | null };
        } catch (error) {
          const message = messageOf(error);
          recordFailure(message);
          return { root, afterTree: after.tree, afterHead, files: [] as TurnFileChange[], error: message };
        }
      }),
    );

    const files = outcomes.flatMap((o) => o.files);
    const errors = outcomes.flatMap((o) => (o.error ? [o.error] : []));
    if (files.length > 0 || errors.length > 0) {
      emitTurnChanges(turn.projectId, {
        chatSessionId,
        clientMessageId: turn.clientMessageId,
        createdAt: new Date().toISOString(),
        files,
        ...(incomplete ? { incomplete } : {}),
        ...(files.length === 0 ? { unavailableReason: [...new Set(errors)].join('; ') } : {}),
      });
    }

    if (next) {
      const roots: OpenRoot[] = [];
      for (const outcome of outcomes) {
        if (outcome.afterTree === null) continue;
        const root: OpenRoot = {
          rowId: randomUUID(),
          rootPath: outcome.root.rootPath,
          store: outcome.root.store,
          beforeTree: outcome.afterTree,
          headCommit: outcome.afterHead,
          startedAt: Math.floor(Date.now() / 1000),
        };
        try {
          insertRow(turn.projectId, chatSessionId, next.clientMessageId, root);
          roots.push(root);
        } catch (error) {
          console.warn(`[TurnSnapshot] could not record ${root.rootPath}: ${messageOf(error)}`);
        }
      }
      if (roots.length > 0) {
        open.set(chatSessionId, { projectId: turn.projectId, clientMessageId: next.clientMessageId, roots });
      }
    }
  }

  function listTurnChanges(chatSessionId: string): ServiceResult<TurnChanges[]> {
    try {
      const turns = new Map<string, TurnChanges & { errors: string[] }>();
      for (const row of snapshots.listBySession(chatSessionId)) {
        if (row.afterTree === null && !row.error) continue;
        let entry = turns.get(row.clientMessageId);
        if (!entry) {
          entry = {
            chatSessionId,
            clientMessageId: row.clientMessageId,
            createdAt: row.createdAt,
            files: [],
            errors: [],
            ...(row.incomplete ? { incomplete: true } : {}),
          };
          turns.set(row.clientMessageId, entry);
        }
        entry.files.push(...(row.files ?? []));
        if (row.incomplete) entry.incomplete = true;
        if (row.error) entry.errors.push(row.error);
      }
      const result: TurnChanges[] = [];
      for (const { errors, ...turn } of turns.values()) {
        if (turn.files.length === 0 && errors.length === 0) continue;
        result.push(turn.files.length === 0 ? { ...turn, unavailableReason: [...new Set(errors)].join('; ') } : turn);
      }
      return success(result);
    } catch (error) {
      return failure(messageOf(error));
    }
  }

  async function diffRows(
    rows: { rootPath: string; store: SnapshotStore; from: string; to: string; only?: Set<string> }[],
    filePath: string | undefined,
  ): Promise<FileDiff[]> {
    // Filtering in git would run before rename detection and show a renamed file as added,
    // so diff everything and pick the file out afterwards.
    const parts = await Promise.all(
      rows.map(async (r) => {
        const patch = await git.diffTrees(r, r.from, r.to, options);
        const listed = parseUnifiedDiff(patch, r.rootPath);
        const files = r.only
          ? listed.filter((f) => r.only!.has(f.path) || (f.oldPath !== undefined && r.only!.has(f.oldPath)))
          : listed;
        return filePath ? files.filter((f) => f.path === filePath || f.oldPath === filePath) : files;
      }),
    );
    return parts.flat();
  }

  /** Paths (and rename sources) the stored turns list, so the Changes tab matches the cards. */
  function listedPaths(rows: TurnSnapshotRow[]): Set<string> {
    const paths = new Set<string>();
    for (const row of rows) {
      for (const file of row.files ?? []) {
        paths.add(file.path);
        if (file.oldPath) paths.add(file.oldPath);
      }
    }
    return paths;
  }

  function finishedRows(rows: TurnSnapshotRow[]): (TurnSnapshotRow & { afterTree: string })[] {
    return rows.filter((r): r is TurnSnapshotRow & { afterTree: string } => r.afterTree !== null);
  }

  async function getDiff(input: {
    projectId: string;
    chatSessionId: string;
    scope: DiffScope;
    clientMessageId?: string;
    rootPath?: string;
    filePath?: string;
  }): AsyncResult<FileDiff[]> {
    try {
      const wanted = (rootPath: string) => !input.rootPath || input.rootPath === rootPath;
      if (input.scope === 'turn') {
        if (!input.clientMessageId) return failure('clientMessageId is required for turn scope');
        const rows = finishedRows(snapshots.listByTurn(input.chatSessionId, input.clientMessageId)).filter((r) =>
          wanted(r.rootPath),
        );
        return success(
          await diffRows(
            rows.map((r) => ({
              rootPath: r.rootPath,
              store: r.store,
              from: r.beforeTree,
              to: r.afterTree,
              only: listedPaths([r]),
            })),
            input.filePath,
          ),
        );
      }
      if (input.scope === 'chat') {
        const byRoot = new Map<string, TurnSnapshotRow[]>();
        for (const row of snapshots.listBySession(input.chatSessionId)) {
          if (!wanted(row.rootPath)) continue;
          byRoot.set(row.rootPath, [...(byRoot.get(row.rootPath) ?? []), row]);
        }
        const ranges = [...byRoot.entries()].flatMap(([rootPath, rows]) => {
          const last = finishedRows(rows).at(-1);
          return last
            ? [{ rootPath, store: last.store, from: rows[0].beforeTree, to: last.afterTree, only: listedPaths(rows) }]
            : [];
        });
        return success(await diffRows(ranges, input.filePath));
      }
      const ranges: { rootPath: string; store: SnapshotStore; from: string; to: string }[] = [];
      for (const rootPath of resolveRoots(input.projectId).filter(wanted)) {
        const snap = await snapshot(rootPath);
        if (snap.store !== 'repo') continue;
        const head = await git.headTree(rootPath, options);
        if (head) ranges.push({ rootPath, store: 'repo', from: head, to: snap.tree });
      }
      return success(await diffRows(ranges, input.filePath));
    } catch (error) {
      const message = messageOf(error);
      return failure(EXPIRED_MARKERS.some((m) => message.includes(m)) ? 'Snapshot expired' : message);
    }
  }

  return {
    beginTurn: (input: { projectId: string; chatSessionId: string; clientMessageId: string }): Promise<void> =>
      chain(sessionChains, input.chatSessionId, () => begin(input)),
    endTurn: (chatSessionId: string, next?: { clientMessageId: string }): Promise<void> =>
      chain(sessionChains, chatSessionId, () => end(chatSessionId, next)),
    /** The send gave up waiting for beginTurn, so the agent may have edited before the snapshot. */
    markLate: (chatSessionId: string, clientMessageId: string): void => {
      late.add(lateKey(chatSessionId, clientMessageId));
    },
    isKnownRoot: (projectId: string, rootPath: string): boolean => resolveRoots(projectId).includes(rootPath),
    listTurnChanges,
    getDiff,
  };
}

export type TurnSnapshotService = ReturnType<typeof createTurnSnapshotService>;
