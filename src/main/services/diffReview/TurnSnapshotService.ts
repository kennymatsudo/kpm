import { randomUUID } from 'crypto';
import type { DiffScope, FileDiff, TurnChanges, TurnFileChange } from '../../../shared/diffReview';
import { toTurnFileChange } from '../../../shared/diffReview';
import { parseUnifiedDiff } from '../../../shared/unifiedDiff';
import type { ITurnSnapshotRepository, TurnSnapshotRow } from '../../db/interfaces';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';
import * as realGit from './gitSnapshot';
import type { SnapshotStore, diffTrees, headTree, snapshotRoot } from './gitSnapshot';

const DEFAULT_TIMEOUT_MS = 20_000;
const EXPIRED_MARKERS = ['bad object', 'not a tree object', 'Invalid revision'];

export interface TurnSnapshotServiceDeps {
  snapshots: ITurnSnapshotRepository;
  resolveRoots: (projectId: string) => string[];
  shadowDir: string;
  timeoutMs?: number;
  emitTurnChanges: (projectId: string, changes: TurnChanges) => void;
  git?: { snapshotRoot: typeof snapshotRoot; diffTrees: typeof diffTrees; headTree: typeof headTree };
}

interface OpenRoot {
  rowId: string;
  rootPath: string;
  store: SnapshotStore;
  beforeTree: string;
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

    const outcomes = await Promise.all(
      turn.roots.map(async (root) => {
        try {
          const after = await snapshot(root.rootPath);
          let files: TurnFileChange[] = [];
          if (after.tree !== root.beforeTree) {
            const patch = await git.diffTrees(after, root.beforeTree, after.tree, options);
            files = parseUnifiedDiff(patch, root.rootPath).map(toTurnFileChange);
          }
          if (files.length > 0) snapshots.finish(root.rowId, after.tree, files);
          else snapshots.delete(root.rowId);
          return { root, afterTree: after.tree, files, error: null as string | null };
        } catch (error) {
          const message = messageOf(error);
          snapshots.fail(root.rowId, message);
          return { root, afterTree: null, files: [] as TurnFileChange[], error: message };
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
          };
          turns.set(row.clientMessageId, entry);
        }
        entry.files.push(...(row.files ?? []));
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
    rows: { rootPath: string; store: SnapshotStore; from: string; to: string }[],
    filePath: string | undefined,
  ): Promise<FileDiff[]> {
    const paths = filePath ? [filePath] : undefined;
    const parts = await Promise.all(
      rows.map(async (r) => {
        const patch = await git.diffTrees(r, r.from, r.to, { ...options, ...(paths ? { paths } : {}) });
        return parseUnifiedDiff(patch, r.rootPath);
      }),
    );
    return parts.flat();
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
            rows.map((r) => ({ rootPath: r.rootPath, store: r.store, from: r.beforeTree, to: r.afterTree })),
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
          return last ? [{ rootPath, store: last.store, from: rows[0].beforeTree, to: last.afterTree }] : [];
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
    listTurnChanges,
    getDiff,
  };
}

export type TurnSnapshotService = ReturnType<typeof createTurnSnapshotService>;
