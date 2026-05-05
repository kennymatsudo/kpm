/**
 * Monaco language providers (completion, hover, definition) for `@plan/<uuid>`
 * references in the markdown editor. Reads plan items live from the project
 * store so suggestions and hovers reflect current state.
 *
 * Returns a single disposer that unregisters all providers. Call from the
 * editor's onMount and dispose on unmount.
 */

import type * as Monaco from 'monaco-editor';
import { usePlanDomainStore, useProjectUiDomainStore } from '../../stores';
import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';
import { findRefs, PLAN_REF_REGEX, serializeRef } from '../../../shared/planRefs';
import type { PlanItem } from '../../../shared/types';

const PLAN_REF_OWNER = 'kpm-plan-ref';

type MonacoNs = typeof Monaco;
type EditorInstance = Monaco.editor.IStandaloneCodeEditor;
interface Disposable {
  dispose: () => void;
}

const DEFINITION_COMMAND_ID = 'kpm.openPlanRef';

function getPlanItems(): readonly PlanItem[] {
  return usePlanDomainStore.getState().planItems;
}

function getOpenItem(): (id: string) => void {
  return useProjectUiDomainStore.getState().setEditingItemId;
}

function buildHoverMarkdown(item: PlanItem): string {
  const lines: string[] = [`**${item.title}**`];
  const meta: string[] = [];
  if (item.status_category) {
    meta.push(STATUS_CATEGORY_CONFIG[item.status_category].label);
  }
  if (item.external_key) {
    meta.push(item.external_key);
  }
  if (meta.length) lines.push(`_${meta.join(' · ')}_`);
  if (item.intent) {
    lines.push('');
    lines.push(`**Intent:** ${item.intent}`);
  }
  if (item.acceptance_criteria?.length) {
    const items = item.acceptance_criteria.slice(0, 5).map((c) => `- ${c}`);
    const extra = item.acceptance_criteria.length - items.length;
    lines.push('');
    lines.push('**Criteria:**');
    lines.push(...items);
    if (extra > 0) lines.push(`- _…and ${extra} more_`);
  }
  return lines.join('\n');
}

function buildCompletionDetail(item: PlanItem): string {
  const parts: string[] = [];
  if (item.external_key) parts.push(item.external_key);
  if (item.status_category) parts.push(STATUS_CATEGORY_CONFIG[item.status_category].label);
  return parts.join(' · ');
}

/**
 * Readable label shown in place of the UUID in the Monaco editor.
 * Truncated so long titles don't swamp the prose.
 */
function buildRefLabel(item: PlanItem): string {
  const maxTitle = 32;
  const title = item.title.length > maxTitle
    ? item.title.slice(0, maxTitle) + '…'
    : item.title;
  return item.external_key ? `@plan/${title} · ${item.external_key}` : `@plan/${title}`;
}

export function registerPlanRefMonacoProviders(
  editor: EditorInstance,
  monacoNs: MonacoNs,
): Disposable {
  const disposables: Disposable[] = [];

  // Completion provider: triggered by `@`. Lists every plan item; Monaco's
  // built-in fuzzy filtering narrows by what the user types after the `@`.
  disposables.push(
    monacoNs.languages.registerCompletionItemProvider('markdown', {
      triggerCharacters: ['@'],
      provideCompletionItems(model, position) {
        const lineText = model.getLineContent(position.lineNumber);
        // Find the most recent `@` on this line at or before the caret.
        const before = lineText.slice(0, position.column - 1);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) {
          return { suggestions: [] };
        }
        // Whatever comes after the `@` so far becomes the filter prefix.
        const word = model.getWordUntilPosition(position);
        const replaceRange = new monacoNs.Range(
          position.lineNumber,
          atIdx + 1,
          position.lineNumber,
          word.endColumn,
        );

        const items = getPlanItems();
        const suggestions: Monaco.languages.CompletionItem[] = items.map((item) => ({
          label: {
            label: item.title,
            description: item.external_key ?? '',
          },
          kind: monacoNs.languages.CompletionItemKind.Reference,
          insertText: serializeRef(item.id),
          detail: buildCompletionDetail(item),
          documentation: { value: buildHoverMarkdown(item), isTrusted: false },
          range: replaceRange,
          // Filter on title text typed after the `@`.
          filterText: `@${item.title}`,
        }));

        return { suggestions };
      },
    }),
  );

  // Hover provider: show resolved item details for the ref under the cursor.
  disposables.push(
    monacoNs.languages.registerHoverProvider('markdown', {
      provideHover(model, position) {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const lineText = model.getLineContent(position.lineNumber);
        // Look around the word for a full `@plan/<uuid>` token.
        const search = lineText.slice(Math.max(0, word.startColumn - 7));
        PLAN_REF_REGEX.lastIndex = 0;
        const match = PLAN_REF_REGEX.exec(search);
        if (!match) return null;
        const tokenStart = Math.max(0, word.startColumn - 7) + match.index + 1; // 1-based column
        const tokenEnd = tokenStart + match[0].length;
        if (position.column < tokenStart || position.column > tokenEnd) return null;
        const id = match[1].toLowerCase();
        const items = getPlanItems();
        const item = items.find((p) => p.id.toLowerCase() === id);
        const range = new monacoNs.Range(
          position.lineNumber,
          tokenStart,
          position.lineNumber,
          tokenEnd,
        );
        const value = item
          ? buildHoverMarkdown(item)
          : `_Unresolved plan reference:_ \`${id}\``;
        return {
          range,
          contents: [{ value }],
        };
      },
    }),
  );

  // Cmd+click → open the referenced item in TaskEditModal. Monaco fires
  // this through its definition affordance; we intercept all results and
  // invoke the open action directly via a registered command.
  disposables.push(
    editor.addAction({
      id: DEFINITION_COMMAND_ID,
      label: 'Open Plan Reference',
      run: () => {
        const model = editor.getModel();
        const position = editor.getPosition();
        if (!model || !position) return;
        const lineText = model.getLineContent(position.lineNumber);
        const matches = findRefs(lineText);
        const col = position.column;
        const hit = matches.find(
          (m) => col - 1 >= m.start && col - 1 <= m.end,
        );
        if (!hit) return;
        getOpenItem()(hit.id);
      },
    }),
  );

  disposables.push(
    monacoNs.languages.registerDefinitionProvider('markdown', {
      provideDefinition(model, position) {
        const lineText = model.getLineContent(position.lineNumber);
        const matches = findRefs(lineText);
        const col0 = position.column - 1;
        const hit = matches.find((m) => col0 >= m.start && col0 <= m.end);
        if (!hit) return null;
        // Trigger our action by returning a self-location and letting the
        // user's click land on the `addAction` command via keybinding.
        // To open the modal directly on Cmd+click, schedule it.
        queueMicrotask(() => getOpenItem()(hit.id));
        // Return null so Monaco does not try to navigate Monaco-side.
        return null;
      },
    }),
  );

  // Bind Cmd+B (already taken by toolbar) — instead use Monaco's "go to
  // definition" default keybinding. Users can invoke via right-click or F12.
  // The definition provider above already opens the modal as a side effect.

  // Diagnostics: mark every unresolved @plan/<uuid> as a Warning so the
  // editor surfaces the broken link with the same red squiggle / problems
  // affordance as TypeScript errors. Re-runs on every content change and
  // when the plan store updates, since the same UUID can resolve again
  // after a sync.
  const refreshPlanRefs = (): void => {
    const model = editor.getModel();
    if (!model) return;
    const text = model.getValue();
    if (!/@plan\//i.test(text)) {
      monacoNs.editor.setModelMarkers(model, PLAN_REF_OWNER, []);
      styleEl.textContent = '';
      decorationsCollection.set([]);
      return;
    }

    const matches = findRefs(text);
    const items = getPlanItems();
    const byId = new Map(items.map((i) => [i.id.toLowerCase(), i]));

    if (matches.length === 0) {
      monacoNs.editor.setModelMarkers(model, PLAN_REF_OWNER, []);
      styleEl.textContent = '';
      decorationsCollection.set([]);
      return;
    }

    const markers: Monaco.editor.IMarkerData[] = [];
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
    const cssRules: string[] = [];

    for (const match of matches) {
      const start = model.getPositionAt(match.start);
      const end = model.getPositionAt(match.end);
      const item = byId.get(match.id);
      if (!item) {
        markers.push({
          severity: monacoNs.MarkerSeverity.Warning,
          message: `Unresolved plan reference: ${match.id}`,
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
          source: 'kpm',
        });
        continue;
      }

      // Build the label: title truncated + optional key
      const label = buildRefLabel(item);
      // Stable class name keyed by UUID so the same item reuses the same rule
      const className = `kpm-ref-${match.id.replace(/-/g, '')}`;

      decorations.push({
        range: new monacoNs.Range(
          start.lineNumber, start.column,
          end.lineNumber, end.column,
        ),
        options: {
          inlineClassName: className,
          inlineClassNameAffectsLetterSpacing: true,
          hoverMessage: { value: buildHoverMarkdown(item) },
        },
      });

      // Escape single quotes in the label for CSS content value
      const safeLabel = label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      cssRules.push(
        `.${className} { color: transparent; font-size: 0; }`,
        `.${className}::before {`,
        `  content: '${safeLabel}';`,
        `  color: var(--color-accent, #6366f1);`,
        `  font-size: 13px;`,
        `  font-family: var(--font-mono, monospace);`,
        `  font-weight: 500;`,
        `}`,
      );
    }

    monacoNs.editor.setModelMarkers(model, PLAN_REF_OWNER, markers);
    styleEl.textContent = cssRules.join('\n');
    decorationsCollection.set(decorations);
  };

  // Decorations visually replace the UUID portion of each resolved ref with a
  // readable label. The underlying text is never modified.
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-kpm-plan-refs', '');
  document.head.appendChild(styleEl);
  disposables.push({ dispose: () => styleEl.remove() });

  const decorationsCollection = editor.createDecorationsCollection([]);
  disposables.push({ dispose: () => decorationsCollection.clear() });

  refreshPlanRefs();
  disposables.push(editor.onDidChangeModelContent(() => {
    refreshPlanRefs();
  }));
  // The plan store can update underneath us (sync, approval flow); subscribe
  // so a previously-broken ref re-resolves once its target item lands.
  const unsubscribePlanStore = usePlanDomainStore.subscribe(() => {
    refreshPlanRefs();
  });
  disposables.push({ dispose: unsubscribePlanStore });

  // Code actions: offer "Remove ref" for unresolved tokens. Relink-to-picker
  // is deferred — opening a Monaco-side picker UI conflicts with our chip
  // picker; users can simply delete + re-type @ to invoke completion.
  disposables.push(
    monacoNs.languages.registerCodeActionProvider('markdown', {
      provideCodeActions(model, range, context) {
        const ourMarkers = context.markers.filter((m) => m.source === 'kpm');
        if (ourMarkers.length === 0) return { actions: [], dispose: () => {} };

        const actions: Monaco.languages.CodeAction[] = ourMarkers.map((marker) => ({
          title: 'Remove unresolved plan reference',
          kind: 'quickfix',
          diagnostics: [marker],
          edit: {
            edits: [
              {
                resource: model.uri,
                versionId: model.getVersionId(),
                textEdit: {
                  range: {
                    startLineNumber: marker.startLineNumber,
                    startColumn: marker.startColumn,
                    endLineNumber: marker.endLineNumber,
                    endColumn: marker.endColumn,
                  },
                  text: '',
                },
              },
            ],
          },
          isPreferred: true,
        }));
        return { actions, dispose: () => {} };
      },
    }),
  );

  return {
    dispose: () => {
      // Clear markers we set so they don't outlive this editor instance.
      const model = editor.getModel();
      if (model) {
        try {
          monacoNs.editor.setModelMarkers(model, PLAN_REF_OWNER, []);
        } catch {
          // ignore
        }
      }
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      }
    },
  };
}
