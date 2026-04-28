import type { Database, Statement } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { CustomTheme, CustomThemeColors, CustomThemeSource, CustomThemeVsCodeData } from '../../../../shared/types';
import type { CustomThemeSaveInput, ICustomThemeRepository } from '../../interfaces';

interface CustomThemeRow {
  id: string;
  source_key: string;
  name: string;
  description: string;
  colors_json: string;
  preview_json: string;
  vscode_json: string;
  source_json: string;
  created_at: string;
  updated_at: string;
}

interface PreparedStatements {
  list: Statement;
  get: Statement;
  upsert: Statement;
  delete: Statement;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToTheme(row: CustomThemeRow): CustomTheme {
  const colors = parseJson<CustomThemeColors>(row.colors_json, {
    colorScheme: 'dark',
    surface0: '#141211',
    surface1: '#1c1a18',
    surface2: '#242220',
    surface3: '#2e2b28',
    surface4: '#3a3632',
    surfaceElevated: '#302e2b',
    textPrimary: '#e8e4e0',
    textSecondary: '#9b9490',
    textTertiary: '#8a8480',
    textMuted: '#5c5652',
    accent: '#a78bfa',
    accentHover: '#b9a0fb',
  });

  return {
    id: row.id,
    sourceKey: row.source_key,
    name: row.name,
    description: row.description,
    colors,
    preview: parseJson(row.preview_json, {
      surface: colors.surface0,
      accent: colors.accent,
      text: colors.textPrimary,
    }),
    vscode: parseJson<CustomThemeVsCodeData>(row.vscode_json, {
      base: colors.colorScheme === 'dark' ? 'vs-dark' : 'vs',
      inherit: true,
      colors: {},
      rules: [],
    }),
    source: parseJson<CustomThemeSource>(row.source_json, {
      type: 'vscodethemes',
      url: '',
      extensionId: '',
      publisher: '',
      extensionName: '',
      themeSlug: '',
      themeLabel: row.name,
      importedAt: row.created_at,
    }),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class CustomThemeRepository implements ICustomThemeRepository {
  private stmts: PreparedStatements;

  constructor(db: Database) {
    this.stmts = {
      list: db.prepare(`
        SELECT * FROM custom_themes
        ORDER BY updated_at DESC, name ASC
      `),
      get: db.prepare('SELECT * FROM custom_themes WHERE id = ?'),
      upsert: db.prepare(`
        INSERT INTO custom_themes (
          id,
          source_key,
          name,
          description,
          colors_json,
          preview_json,
          vscode_json,
          source_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          colors_json = excluded.colors_json,
          preview_json = excluded.preview_json,
          vscode_json = excluded.vscode_json,
          source_json = excluded.source_json,
          updated_at = excluded.updated_at
        RETURNING *
      `),
      delete: db.prepare('DELETE FROM custom_themes WHERE id = ?'),
    };
  }

  list(): CustomTheme[] {
    return (this.stmts.list.all() as CustomThemeRow[]).map(rowToTheme);
  }

  get(id: string): CustomTheme | undefined {
    const row = this.stmts.get.get(id) as CustomThemeRow | undefined;
    return row ? rowToTheme(row) : undefined;
  }

  upsert(theme: CustomThemeSaveInput): CustomTheme {
    const now = new Date().toISOString();
    const row = this.stmts.upsert.get(
      randomUUID(),
      theme.sourceKey,
      theme.name,
      theme.description,
      JSON.stringify(theme.colors),
      JSON.stringify(theme.preview),
      JSON.stringify(theme.vscode),
      JSON.stringify(theme.source),
      now,
      now,
    ) as CustomThemeRow;

    return rowToTheme(row);
  }

  delete(id: string): void {
    this.stmts.delete.run(id);
  }
}

