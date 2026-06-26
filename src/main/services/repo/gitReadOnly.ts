/**
 * Read-only git classification for the structured `git_read` tool.
 *
 * The tool invokes git via `execFile` with an argument ARRAY (no shell), so
 * there is no quoting, piping, redirection, or command substitution to reason
 * about — only git's own subcommands and flags can cause a write. This module
 * is the single source of truth for "is this git invocation read-only?". It
 * takes a subcommand plus its already-tokenized arguments and rejects anything
 * that can mutate the repo, working tree, refs, or object store, or run an
 * external program (`--ext-diff`, grep's pager) or write a file (`--output`).
 *
 * Raw `git` in chat Bash is blocked entirely (see permissions.ts); this is the
 * only sanctioned git path in chat, which is why the gate lives at the argument
 * level rather than trying to parse shell strings.
 */

export type GitReadCheck = { ok: true } | { ok: false; reason: string };

/**
 * Allowed read-only git subcommands. Subcommands that can write depending on
 * their arguments (branch, tag, config, remote, stash, worktree, submodule,
 * fetch, reflog, symbolic-ref) are included but argument-validated below.
 */
export const READ_GIT_SUBCOMMANDS = [
  'blame',
  'branch',
  'cat-file',
  'check-ignore',
  'config',
  'describe',
  'diff',
  'fetch',
  'for-each-ref',
  'grep',
  'log',
  'ls-files',
  'ls-remote',
  'merge-base',
  'name-rev',
  'reflog',
  'remote',
  'rev-list',
  'rev-parse',
  'shortlog',
  'show',
  'show-ref',
  'stash',
  'status',
  'submodule',
  'symbolic-ref',
  'tag',
  'worktree',
] as const;

export type GitReadSubcommand = (typeof READ_GIT_SUBCOMMANDS)[number];

const READ_SUBCOMMAND_SET = new Set<string>(READ_GIT_SUBCOMMANDS);

const GIT_BRANCH_WRITE_FLAGS = new Set([
  '-d', '-D', '-m', '-M', '-c', '-C', '-f',
  '--copy', '--delete', '--edit-description', '--force', '--move',
  '--no-track', '--set-upstream-to', '--track', '--unset-upstream',
]);

const GIT_BRANCH_READ_FLAGS = new Set([
  '-a', '-r', '-v', '-vv', '--all', '--color', '--column', '--contains',
  '--format', '--list', '--merged', '--no-color', '--no-column',
  '--no-contains', '--no-merged', '--points-at', '--remotes',
  '--show-current', '--sort', '--verbose',
]);

const GIT_TAG_WRITE_FLAGS = new Set([
  '-a', '-d', '-f', '-m', '-s', '-u',
  '--annotate', '--delete', '--file', '--force', '--local-user',
  '--message', '--sign',
]);

const GIT_TAG_READ_FLAGS = new Set([
  '-l', '-n', '--column', '--contains', '--format', '--ignore-case',
  '--list', '--merged', '--no-column', '--no-contains', '--no-merged',
  '--points-at', '--sort',
]);

const GIT_CONFIG_WRITE_FLAGS = new Set([
  '--add', '--edit', '--fixed-value', '--remove-section', '--rename-section',
  '--replace-all', '--unset', '--unset-all',
]);

const GIT_CONFIG_READ_FLAGS = new Set([
  '-l', '-z', '--get', '--get-all', '--get-color', '--get-colorbool',
  '--get-regexp', '--list', '--name-only', '--null', '--show-origin',
  '--show-scope',
]);

function hasAny(args: string[], values: Set<string>): boolean {
  return args.some(
    (arg) => values.has(arg) || Array.from(values).some((value) => arg.startsWith(`${value}=`))
  );
}

function hasReadMode(args: string[], readFlags: Set<string>): boolean {
  return args.some(
    (arg) => readFlags.has(arg) || Array.from(readFlags).some((flag) => arg.startsWith(`${flag}=`))
  );
}

function isReadOnlyBranch(args: string[]): boolean {
  if (hasAny(args, GIT_BRANCH_WRITE_FLAGS)) return false;
  if (args.length === 0) return true;
  return hasReadMode(args, GIT_BRANCH_READ_FLAGS) || args.every((arg) => arg.startsWith('-'));
}

function isReadOnlyTag(args: string[]): boolean {
  if (hasAny(args, GIT_TAG_WRITE_FLAGS)) return false;
  if (args.length === 0) return true;
  return hasReadMode(args, GIT_TAG_READ_FLAGS) || args.every((arg) => arg.startsWith('-'));
}

function isReadOnlyConfig(args: string[]): boolean {
  if (hasAny(args, GIT_CONFIG_WRITE_FLAGS)) return false;
  // Require an explicit read flag so a bare `git config key value` (a write)
  // can't slip through.
  return hasReadMode(args, GIT_CONFIG_READ_FLAGS);
}

function isReadOnlyRemote(args: string[]): boolean {
  if (args.length === 0) return true;
  if (args.every((arg) => arg === '-v' || arg === '--verbose')) return true;
  const [subcommand] = args;
  return subcommand === 'show' || subcommand === 'get-url';
}

function isReadOnlyStash(args: string[]): boolean {
  // Bare `git stash` is `stash push` (a write); only list/show are reads.
  return args[0] === 'list' || args[0] === 'show';
}

function isReadOnlyWorktree(args: string[]): boolean {
  return args[0] === 'list';
}

function isReadOnlySubmodule(args: string[]): boolean {
  return args.length === 0 || args[0] === 'status';
}

function isReadOnlyFetch(args: string[]): boolean {
  // A refspec `src:dst` (and force `+src:dst`) can create or force-update a
  // LOCAL branch — a write that can discard commits. A colon in any positional
  // arg signals a refspec (or scp-style URL); deny to stay safe. Plain forms
  // (fetch, fetch <remote>, --all, --prune, --dry-run) have none.
  return !args.some((arg) => !arg.startsWith('-') && arg.includes(':'));
}

function isReadOnlyReflog(args: string[]): boolean {
  // `show`/`exists` are reads; `expire`/`delete` are writes. A leading flag or
  // no args means the default `show`.
  if (args.length === 0) return true;
  if (args[0].startsWith('-')) return true;
  return args[0] === 'show' || args[0] === 'exists';
}

function isReadOnlySymbolicRef(args: string[]): boolean {
  // Reading: `symbolic-ref [--short|-q] <name>`. Writing: setting a value
  // (`<name> <ref>` — two positionals) or `-d`/`--delete`.
  if (args.includes('-d') || args.includes('--delete')) return false;
  const positionals = args.filter((arg) => !arg.startsWith('-'));
  return positionals.length <= 1;
}

/**
 * Flags that turn an otherwise read-only command into a file write or program
 * execution: `--output`/`-o` (write a file), `--ext-diff` (run a configured
 * external diff driver), `-O`/`--open-files-in-pager` (grep opens matches in a
 * pager/editor). `--no-ext-diff` is the safe default and is left alone.
 */
function findWriteOrExecFlag(args: string[]): string | null {
  for (const arg of args) {
    if (arg === '--output' || arg.startsWith('--output=')) return arg;
    if (arg === '-o' || (arg.startsWith('-o') && arg.length > 2)) return arg;
    if (arg === '-O' || (arg.startsWith('-O') && arg.length > 2)) return arg;
    if (arg === '--open-files-in-pager' || arg.startsWith('--open-files-in-pager=')) return arg;
    if (arg === '--ext-diff') return arg;
  }
  return null;
}

/**
 * Decide whether `git <subcommand> <args...>` is read-only and safe to run.
 * `args` are the tokens after the subcommand (no leading `git`, no global
 * options — the caller fixes the subcommand and cwd).
 */
export function classifyGitInvocation(subcommand: string, args: string[]): GitReadCheck {
  if (!READ_SUBCOMMAND_SET.has(subcommand)) {
    return {
      ok: false,
      reason: `"${subcommand}" is not an allowed read-only git operation.`,
    };
  }

  const writeOrExec = findWriteOrExecFlag(args);
  if (writeOrExec) {
    return {
      ok: false,
      reason: `flag "${writeOrExec}" can write a file or run a program.`,
    };
  }

  const deny = (reason: string): GitReadCheck => ({ ok: false, reason });

  switch (subcommand) {
    case 'branch':
      return isReadOnlyBranch(args) ? { ok: true } : deny('"git branch" with a write flag (create/delete/rename/move).');
    case 'tag':
      return isReadOnlyTag(args) ? { ok: true } : deny('"git tag" with a write flag (create/delete/annotate/sign).');
    case 'config':
      return isReadOnlyConfig(args) ? { ok: true } : deny('"git config" must use a read flag such as --get or --list.');
    case 'remote':
      return isReadOnlyRemote(args) ? { ok: true } : deny('only "git remote", "remote -v", "remote show", and "remote get-url" are read-only.');
    case 'stash':
      return isReadOnlyStash(args) ? { ok: true } : deny('only "git stash list" and "git stash show" are read-only.');
    case 'worktree':
      return isReadOnlyWorktree(args) ? { ok: true } : deny('only "git worktree list" is read-only.');
    case 'submodule':
      return isReadOnlySubmodule(args) ? { ok: true } : deny('only "git submodule status" is read-only.');
    case 'fetch':
      return isReadOnlyFetch(args) ? { ok: true } : deny('"git fetch" with a refspec (src:dst) can update a local branch.');
    case 'reflog':
      return isReadOnlyReflog(args) ? { ok: true } : deny('only "git reflog" / "git reflog show" are read-only (not expire/delete).');
    case 'symbolic-ref':
      return isReadOnlySymbolicRef(args) ? { ok: true } : deny('"git symbolic-ref" may only read a ref, not set or delete one.');
    default:
      return { ok: true };
  }
}
