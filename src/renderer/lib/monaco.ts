import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
// Monaco 0.56 added an `exports` map, so the workers are reached through the
// package's public subpaths — the old `monaco-editor/esm/vs/...` deep paths no
// longer resolve. The `?worker` suffix is Vite's worker-constructor import: it
// synthesizes the default export that the module itself does not declare.
// eslint-disable-next-line import-x/default
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

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
