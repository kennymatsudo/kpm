import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { getConfig } from '../config';
import { FALLBACK_MODEL_CATALOG } from '../../shared/modelCatalog';
import { getModelCatalog, refreshModelCatalog, resetModelCatalogForTests } from './modelCatalog';

const CLAUDE_ROWS = [
  { value: 'sonnet', resolvedModel: 'claude-sonnet-5', displayName: 'Sonnet 5', description: 'Everyday' },
  { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus 5.5', description: 'Most capable' },
];
const CODEX_RESULT = { data: [{ id: 'gpt-6-astra', displayName: 'GPT-6-Astra', supportedReasoningEfforts: [] }] };

function savedPath(): string {
  return path.join(app.getPath('userData'), getConfig().session.modelCatalogFilename);
}

describe('model catalog refresh', () => {
  beforeEach(() => {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.rmSync(savedPath(), { force: true });
    resetModelCatalogForTests();
  });

  afterEach(() => {
    fs.rmSync(savedPath(), { force: true });
    resetModelCatalogForTests();
  });

  it('serves the fallback list before anything has been fetched', () => {
    expect(getModelCatalog()).toEqual(FALLBACK_MODEL_CATALOG);
  });

  it('adopts both lists, saves them for the next launch, and announces the change', async () => {
    const onChange = vi.fn();
    await refreshModelCatalog({ claude: async () => CLAUDE_ROWS, codex: async () => CODEX_RESULT }, onChange);

    expect(getModelCatalog().claude[1].label).toBe('Opus 5.5');
    expect(getModelCatalog().codex.map((model) => model.id)).toEqual(['gpt-6-astra']);
    expect(onChange).toHaveBeenCalledOnce();

    resetModelCatalogForTests();
    expect(getModelCatalog().codex.map((model) => model.id)).toEqual(['gpt-6-astra']);
  });

  it('keeps the previous list for a provider that fails, without holding back the other', async () => {
    await refreshModelCatalog({ claude: async () => CLAUDE_ROWS, codex: async () => CODEX_RESULT }, () => {});
    await refreshModelCatalog(
      { claude: async () => { throw new Error('not signed in'); }, codex: async () => ({ data: [{ id: 'gpt-7', displayName: 'GPT-7' }] }) },
      () => {},
    );

    expect(getModelCatalog().claude[1].label).toBe('Opus 5.5');
    expect(getModelCatalog().codex.map((model) => model.id)).toEqual(['gpt-7']);
  });

  it('does not announce a refresh that found nothing new', async () => {
    await refreshModelCatalog({ claude: async () => CLAUDE_ROWS, codex: async () => CODEX_RESULT }, () => {});
    const onChange = vi.fn();
    await refreshModelCatalog({ claude: async () => CLAUDE_ROWS, codex: async () => CODEX_RESULT }, onChange);

    expect(onChange).not.toHaveBeenCalled();
  });
});
