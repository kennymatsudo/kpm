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
 * `classifyGitShellCommand` (bottom of this file) reuses the same rules for the
 * one place a shell string has to be judged: raw `git` in chat Bash.
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

/**
 * Global git options that cannot write a file or run a program. `-c` and
 * `--config-env` are excluded deliberately: `git -c core.pager='sh -c ...' log`
 * executes an arbitrary command. `--exec-path` and `--paginate` are excluded for
 * the same reason.
 */
const SAFE_GLOBAL_FLAGS = new Set([
  '--no-pager',
  '-P',
  '--no-optional-locks',
  '--literal-pathspecs',
  '--no-replace-objects',
  '--no-lazy-fetch',
]);

/** Safe global options that consume the following token as their value. */
const SAFE_GLOBAL_FLAGS_WITH_VALUE = new Set(['-C', '--git-dir', '--work-tree']);

/** Global options that are themselves the whole read-only operation. */
const TERMINAL_READ_FLAGS = new Set(['--version', '--help', '-h']);

/**
 * Commands allowed downstream of a pipe. Every one is a pure filter: none has a
 * flag that writes a file or runs a program, which is why `tee`, `sed`, `awk`,
 * `xargs`, and `sort` (`sort -o` writes) are absent.
 */
const PIPE_FILTER_COMMANDS = new Set([
  'cat', 'column', 'cut', 'grep', 'head', 'nl', 'rg', 'tail', 'tr', 'uniq', 'wc',
]);

/** A pipeline's stages; a chain is the `&&`-separated pipelines of one command. */
type ShellPipeline = string[][];

/**
 * Split a shell command into `&&`-separated pipelines of tokens, honoring single
 * and double quotes. Returns null for anything else — redirection, command
 * substitution, backgrounding, subshells, escapes, `||` — so unparsed syntax can
 * never be mistaken for a read.
 */
function tokenizeShellCommand(command: string): ShellPipeline[] | null {
  const unsupported = new Set([';', '<', '>', '$', '`', '\\', '(', ')', '{', '}', '\n']);
  const chain: ShellPipeline[] = [];
  let pipeline: ShellPipeline = [];
  let tokens: string[] = [];
  let token = '';
  let inToken = false;
  let quote: '"' | "'" | null = null;

  const endToken = (): void => {
    if (!inToken) return;
    tokens.push(token);
    token = '';
    inToken = false;
  };
  const endStage = (): boolean => {
    endToken();
    if (tokens.length === 0) return false;
    pipeline.push(tokens);
    tokens = [];
    return true;
  };
  const endPipeline = (): boolean => {
    if (!endStage()) return false;
    chain.push(pipeline);
    pipeline = [];
    return true;
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (quote) {
      if (char === quote) quote = null;
      else token += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      inToken = true;
      continue;
    }
    if (char === ' ' || char === '\t') {
      endToken();
      continue;
    }
    if (char === '&') {
      if (command[index + 1] !== '&') return null;
      if (!endPipeline()) return null;
      index += 1;
      continue;
    }
    if (char === '|') {
      if (command[index + 1] === '|') return null;
      if (!endStage()) return null;
      continue;
    }
    if (unsupported.has(char)) return null;
    token += char;
    inToken = true;
  }

  if (quote) return null;
  if (!endPipeline()) return null;
  return chain;
}

function basename(executable: string): string {
  return executable.split('/').pop() ?? executable;
}

/** Classify one `git ...` stage: skip safe global options, then check the subcommand. */
function classifyGitStage(tokens: string[]): GitReadCheck {
  const [executable, ...rest] = tokens;
  if (basename(executable) !== 'git') {
    return { ok: false, reason: `"${executable}" is not git.` };
  }

  let index = 0;
  while (index < rest.length && rest[index].startsWith('-')) {
    const flag = rest[index];
    if (TERMINAL_READ_FLAGS.has(flag)) return { ok: true };
    if (SAFE_GLOBAL_FLAGS.has(flag)) {
      index += 1;
      continue;
    }
    const valueFlag = Array.from(SAFE_GLOBAL_FLAGS_WITH_VALUE).find(
      (candidate) => flag === candidate || flag.startsWith(`${candidate}=`)
    );
    if (valueFlag) {
      index += flag === valueFlag ? 2 : 1;
      continue;
    }
    return { ok: false, reason: `global option "${flag}" is not a known read-only option.` };
  }

  const subcommand = rest[index];
  if (!subcommand) return { ok: false, reason: 'no git subcommand to classify.' };
  return classifyGitInvocation(subcommand, rest.slice(index + 1));
}

function classifyFilterStage(tokens: string[]): GitReadCheck {
  const command = basename(tokens[0]);
  if (!PIPE_FILTER_COMMANDS.has(command)) {
    return { ok: false, reason: `"${tokens[0]}" is not a read-only filter.` };
  }
  return { ok: true };
}

/**
 * Decide whether a whole shell command is nothing but read-only git.
 *
 * Bash counts as a write tool, so it normally raises the conversation-wide
 * write-consent prompt — but reading git state is a read, and asking for write
 * access to run `git status` is friction with no safety value. A command this
 * function accepts skips the gate.
 *
 * "Accepts" is narrow on purpose: a plain `&&` chain of pipelines, each starting
 * with a read-only git invocation and continuing only through pure filters, with
 * no other shell syntax. Anything it cannot prove read-only falls back to the
 * write gate, so a miss costs a prompt rather than an unreviewed write.
 */
export function classifyGitShellCommand(command: string): GitReadCheck {
  const chain = tokenizeShellCommand(command);
  if (!chain) {
    return { ok: false, reason: 'the command uses shell syntax beyond an `&&` chain of git commands.' };
  }

  for (const pipeline of chain) {
    const [gitStage, ...filterStages] = pipeline;
    const gitCheck = classifyGitStage(gitStage);
    if (!gitCheck.ok) return gitCheck;
    for (const stage of filterStages) {
      const filterCheck = classifyFilterStage(stage);
      if (!filterCheck.ok) return filterCheck;
    }
  }

  return { ok: true };
}
