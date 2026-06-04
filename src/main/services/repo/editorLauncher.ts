import { spawn } from 'child_process';

const ENV_EDITOR_KEYS = ['KPM_CODE_EDITOR', 'KPM_EDITOR', 'VISUAL', 'EDITOR'] as const;

const TERMINAL_EDITORS = new Set([
  'vi',
  'vim',
  'nvim',
  'nano',
  'emacs',
  'pico',
  'ed',
]);

const GUI_EDITOR_COMMANDS = [
  'code',
  'cursor',
  'windsurf',
  'zed',
  'subl',
  'idea',
  'webstorm',
  'phpstorm',
  'pycharm',
  'goland',
  'rubymine',
  'clion',
  'fleet',
  'atom',
  'mate',
] as const;

const MACOS_EDITOR_APPS = [
  'Visual Studio Code',
  'Cursor',
  'Windsurf',
  'Zed',
  'Sublime Text',
  'IntelliJ IDEA',
  'WebStorm',
  'PhpStorm',
  'PyCharm',
  'GoLand',
  'RubyMine',
  'CLion',
  'Fleet',
  'Atom',
  'TextMate',
] as const;

function splitCommand(commandLine: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of commandLine.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) parts.push(current);
  return parts;
}

function basename(command: string): string {
  return command.replace(/\\/g, '/').split('/').pop()?.replace(/\.(cmd|exe|bat)$/i, '') ?? command;
}

function getEnvEditorCommand(): { command: string; args: string[] } | null {
  for (const key of ENV_EDITOR_KEYS) {
    const value = process.env[key];
    if (!value?.trim()) continue;

    const [command, ...args] = splitCommand(value);
    if (!command || TERMINAL_EDITORS.has(basename(command))) continue;
    return { command, args };
  }

  return null;
}

async function launch(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function launchAndWait(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

export async function openDirectoryInCodeEditor(targetPath: string): Promise<void> {
  const envEditor = getEnvEditorCommand();
  if (envEditor) {
    await launch(envEditor.command, [...envEditor.args, targetPath]);
    return;
  }

  for (const command of GUI_EDITOR_COMMANDS) {
    if (!resolved) continue;

    await launch(resolved, [targetPath]);
    return;
  }

  if (process.platform === 'darwin') {
    for (const appName of MACOS_EDITOR_APPS) {
      try {
        await launchAndWait('open', ['-a', appName, targetPath]);
        return;
      } catch {
        // Try the next installed editor.
      }
    }
  }

  throw new Error('No code editor found. Install a code editor CLI such as code or cursor, or set KPM_CODE_EDITOR.');
}
