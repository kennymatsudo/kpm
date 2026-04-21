import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
// Vite worker modules export a worker constructor default at build time.
// eslint-disable-next-line import-x/default
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// eslint-disable-next-line import-x/default
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
// eslint-disable-next-line import-x/default
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
// eslint-disable-next-line import-x/default
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: (_moduleId: string, label: string) => Worker;
    };
  }
}

let configured = false;

export function configureMonaco() {
  if (configured) return monaco;

  window.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') {
        return new jsonWorker();
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return new cssWorker();
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new htmlWorker();
      }
      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker();
      }

      return new editorWorker();
    },
  };

  loader.config({ monaco });

  configured = true;
  return monaco;
}

export function getMonacoLanguage(path: string): string {
  const lowerPath = path.toLowerCase();

  if (lowerPath.endsWith('.json')) return 'json';
  if (lowerPath.endsWith('.yaml') || lowerPath.endsWith('.yml')) return 'yaml';
  if (lowerPath.endsWith('.toml')) return 'ini';
  if (lowerPath.endsWith('.md')) return 'markdown';
  if (lowerPath.endsWith('.txt')) return 'plaintext';
  if (lowerPath.endsWith('.ts') || lowerPath.endsWith('.tsx')) return 'typescript';
  if (lowerPath.endsWith('.js') || lowerPath.endsWith('.jsx') || lowerPath.endsWith('.mjs') || lowerPath.endsWith('.cjs')) return 'javascript';
  if (lowerPath.endsWith('.css') || lowerPath.endsWith('.pcss') || lowerPath.endsWith('.postcss')) return 'css';
  if (lowerPath.endsWith('.scss') || lowerPath.endsWith('.sass') || lowerPath.endsWith('.less')) return 'scss';
  if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) return 'html';
  if (lowerPath.endsWith('.xml') || lowerPath.endsWith('.svg')) return 'xml';
  if (lowerPath.endsWith('.sql')) return 'sql';
  if (lowerPath.endsWith('.py')) return 'python';
  if (lowerPath.endsWith('.sh') || lowerPath.endsWith('.bash') || lowerPath.endsWith('.zsh')) return 'shell';

  return 'plaintext';
}
