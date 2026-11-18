import { execFile } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type SnapshotStore = 'repo' | 'shadow';
export interface RootSnapshot {
  rootPath: string;
  store: SnapshotStore;
  tree: string;
}
export interface GitSnapshotOptions {
  shadowDir: string;
  timeoutMs: number;
}
export const FULL_CONTEXT = 1_000_000;

const SHADOW_EXCLUDES = ['.DS_Store', 'node_modules/', '.git/', '*.db', '*.db-wal', '*.db-shm'].join('\n');
const MAX_BUFFER = 256 * 1024 * 1024;
// Inherited from a parent git process (e.g. a hook). Left in place, they would point our commands at another repo.
const INHERITED_GIT_ENV = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR'];

function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of INHERITED_GIT_ENV) delete env[key];
  return { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', ...extra };
}

async function git(args: string[], cwd: string, timeoutMs: number, env: Record<string, string> = {}): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd,
    timeout: timeoutMs,
    maxBuffer: MAX_BUFFER,
    env: childEnv(env),
  });
  return stdout;
}

/** The repo's own git dir when `rootPath` is a work tree's top level, else null. */
async function ownGitDir(rootPath: string, timeoutMs: number): Promise<string | null> {
  try {
    const out = await git(['rev-parse', '--show-toplevel', '--absolute-git-dir'], rootPath, timeoutMs);
    const [top, gitDir] = out.trim().split('\n');
    return fs.realpathSync(top) === fs.realpathSync(rootPath) ? gitDir : null;
  } catch {
    return null;
  }
}

function shadowGitDir(rootPath: string, shadowDir: string): string {
  const hash = createHash('sha1').update(fs.realpathSync(rootPath)).digest('hex').slice(0, 16);
  return path.join(shadowDir, `${hash}.git`);
}

async function ensureShadowRepo(gitDir: string, timeoutMs: number): Promise<void> {
  if (!fs.existsSync(path.join(gitDir, 'HEAD'))) {
    fs.mkdirSync(gitDir, { recursive: true });
    await git(['init', '--bare', '-q', gitDir], os.tmpdir(), timeoutMs);
  }
  // Rewritten on every call so a user-edited or deleted exclude file cannot persist.
  fs.mkdirSync(path.join(gitDir, 'info'), { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'info', 'exclude'), `${SHADOW_EXCLUDES}\n`);
}

function shadowArgs(rootPath: string, options: GitSnapshotOptions): string[] {
  return [`--git-dir=${shadowGitDir(rootPath, options.shadowDir)}`, `--work-tree=${rootPath}`];
}

export async function snapshotRoot(rootPath: string, options: GitSnapshotOptions): Promise<RootSnapshot> {
  const gitDir = await ownGitDir(rootPath, options.timeoutMs);
  if (gitDir) {
    // A copy of the real index keeps git's stat cache, so unchanged files are not re-read.
    const tempIndex = path.join(os.tmpdir(), `kpm-snapshot-${randomUUID()}.index`);
    try {
      const realIndex = path.join(gitDir, 'index');
      if (fs.existsSync(realIndex)) fs.copyFileSync(realIndex, tempIndex);
      const env = { GIT_INDEX_FILE: tempIndex };
      await git(['add', '-A', '--', '.'], rootPath, options.timeoutMs, env);
      const tree = (await git(['write-tree'], rootPath, options.timeoutMs, env)).trim();
      return { rootPath, store: 'repo', tree };
    } finally {
      fs.rmSync(tempIndex, { force: true });
    }
  }

  const shadow = shadowGitDir(rootPath, options.shadowDir);
  await ensureShadowRepo(shadow, options.timeoutMs);
  const args = shadowArgs(rootPath, options);
  // The shadow store keeps its own persistent index for the stat cache.
  const env = { GIT_INDEX_FILE: path.join(shadow, 'kpm-index') };
  await git([...args, 'add', '-A', '--', '.'], rootPath, options.timeoutMs, env);
  const tree = (await git([...args, 'write-tree'], rootPath, options.timeoutMs, env)).trim();
  return { rootPath, store: 'shadow', tree };
}

export async function diffTrees(
  snapshot: { rootPath: string; store: SnapshotStore },
  from: string,
  to: string,
  options: GitSnapshotOptions & { paths?: string[] },
): Promise<string> {
  const prefix = snapshot.store === 'shadow' ? shadowArgs(snapshot.rootPath, options) : [];
  const args = [...prefix, 'diff-tree', '-p', '-r', '-M', '--no-color', '--no-ext-diff', `-U${FULL_CONTEXT}`, from, to];
  if (options.paths?.length) args.push('--', ...options.paths);
  return git(args, snapshot.rootPath, options.timeoutMs);
}

export async function headTree(rootPath: string, options: GitSnapshotOptions): Promise<string | null> {
  try {
    return (await git(['rev-parse', 'HEAD^{tree}'], rootPath, options.timeoutMs)).trim();
  } catch {
    return null;
  }
}
