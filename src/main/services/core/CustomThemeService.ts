import path from 'path';
import { inflateRawSync } from 'zlib';
import type {
  CustomTheme,
  CustomThemeColors,
  CustomThemeTokenRule,
  CustomThemeVsCodeData,
} from '../../../shared/types';
import type { ICustomThemeRepository } from '../../db/interfaces';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';

const MAX_VSIX_BYTES = 50 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_THEME_BYTES = 2 * 1024 * 1024;
const MAX_THEME_COUNT = 100;
const MARKETPLACE_VSIX_BASE = 'https://marketplace.visualstudio.com/_apis/public/gallery/publishers';

interface VsCodeThemesUrlParts {
  url: string;
  publisher: string;
  extensionName: string;
  extensionId: string;
  themeSlug: string;
}

interface VsCodeThemeContribution {
  label?: unknown;
  uiTheme?: unknown;
  path?: unknown;
  id?: unknown;
}

interface VsCodeManifest {
  name?: unknown;
  displayName?: unknown;
  publisher?: unknown;
  version?: unknown;
  contributes?: {
    themes?: unknown;
  };
}

interface VsCodeThemeJson {
  name?: unknown;
  type?: unknown;
  include?: unknown;
  colors?: unknown;
  tokenColors?: unknown;
  semanticHighlighting?: unknown;
  semanticTokenColors?: unknown;
  encodedTokensColors?: unknown;
}

interface ThemeCandidate {
  contribution: VsCodeThemeContribution;
  json: VsCodeThemeJson;
  label: string;
  slug: string;
}

interface ZipEntry {
  name: string;
  flags: number;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

interface CustomThemeServiceDeps {
  customThemes: ICustomThemeRepository;
  fetchFn?: typeof fetch;
}

export function parseVsCodeThemesUrl(input: string): ServiceResult<VsCodeThemesUrlParts> {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return failure('Enter a valid VS Code Themes URL');
  }

  if (parsed.protocol !== 'https:') {
    return failure('Theme URL must use HTTPS');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'vscodethemes.com' && hostname !== 'www.vscodethemes.com') {
    return failure('Only vscodethemes.com theme URLs are supported');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 3 || segments[0] !== 'e') {
    return failure('Use a theme page URL like https://vscodethemes.com/e/publisher.extension/theme-name');
  }

  const extensionId = decodeURIComponent(segments[1] ?? '');
  const themeSlug = decodeURIComponent(segments[2] ?? '').toLowerCase();
  const separatorIndex = extensionId.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex === extensionId.length - 1) {
    return failure('Theme URL does not include a valid Marketplace extension id');
  }

  const publisher = extensionId.slice(0, separatorIndex);
  const extensionName = extensionId.slice(separatorIndex + 1);
  const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
  const safeSlug = /^[a-z0-9][a-z0-9-]{0,199}$/;
  if (!safeId.test(publisher) || !safeId.test(extensionName) || !safeSlug.test(themeSlug)) {
    return failure('Theme URL contains unsupported characters');
  }

  return success({
    url: parsed.toString(),
    publisher,
    extensionName,
    extensionId: `${publisher}.${extensionName}`,
    themeSlug,
  });
}

export function createCustomThemeService(deps: CustomThemeServiceDeps) {
  const fetchFn = deps.fetchFn ?? fetch;

  return {
    list(): ServiceResult<CustomTheme[]> {
      try {
        return success(deps.customThemes.list().map(normalizeThemeForRuntime));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    get(themeId: string): ServiceResult<CustomTheme> {
      try {
        const theme = deps.customThemes.get(themeId);
        return theme ? success(normalizeThemeForRuntime(theme)) : failure('Theme not found');
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    delete(themeId: string): ServiceResult<void> {
      try {
        if (!deps.customThemes.get(themeId)) {
          return failure('Theme not found');
        }
        deps.customThemes.delete(themeId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async importFromVsCodeThemesUrl(url: string): AsyncResult<{ theme: CustomTheme; warnings: string[] }> {
      try {
        const parsed = parseVsCodeThemesUrl(url);
        if (!parsed.ok) {
          return parsed;
        }

        const imported = await importThemeFromMarketplace(parsed.data, fetchFn);
        const theme = deps.customThemes.upsert(imported.theme);
        return success({ theme, warnings: imported.warnings });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type CustomThemeService = ReturnType<typeof createCustomThemeService>;

function normalizeThemeForRuntime(theme: CustomTheme): CustomTheme {
  const vscodeColors = sanitizeVsCodeColors(theme.vscode.colors);
  if (Object.keys(vscodeColors).length === 0) {
    return theme;
  }

  const colors = buildKpmThemeColors(vscodeColors, theme.colors.colorScheme);
  return {
    ...theme,
    colors,
    preview: {
      surface: colors.surface0,
      accent: colors.accent,
      text: colors.textPrimary,
    },
  };
}

async function importThemeFromMarketplace(
  parts: VsCodeThemesUrlParts,
  fetchFn: typeof fetch,
): Promise<{ theme: Omit<CustomTheme, 'id' | 'created_at' | 'updated_at'>; warnings: string[] }> {
  const warnings: string[] = [];
  const vsixUrl = `${MARKETPLACE_VSIX_BASE}/${encodeURIComponent(parts.publisher)}/vsextensions/${encodeURIComponent(parts.extensionName)}/latest/vspackage`;
  const response = await fetchWithTimeout(fetchFn, vsixUrl, 20_000);

  if (!response.ok) {
    throw new Error(`Marketplace download failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (contentLength > MAX_VSIX_BYTES) {
    throw new Error('Theme package is too large to import');
  }

  const packageBytes = Buffer.from(await response.arrayBuffer());
  if (packageBytes.byteLength > MAX_VSIX_BYTES) {
    throw new Error('Theme package is too large to import');
  }

  const zip = ZipArchive.from(packageBytes);
  const manifest = readManifest(zip);
  const themes = isRecord(manifest.contributes) && Array.isArray(manifest.contributes.themes)
    ? manifest.contributes.themes.slice(0, MAX_THEME_COUNT).filter(isRecord) as VsCodeThemeContribution[]
    : [];

  if (themes.length === 0) {
    throw new Error('This extension does not declare any JSON color themes');
  }

  const candidates = themes
    .map((contribution) => loadThemeCandidate(zip, contribution, warnings))
    .filter((candidate): candidate is ThemeCandidate => candidate !== null);

  if (candidates.length === 0) {
    throw new Error('No supported JSON themes were found in this extension');
  }

  const selected = candidates.find((candidate) => candidate.slug === parts.themeSlug)
    ?? candidates.find((candidate) => slugify(stringValue(candidate.contribution.id) ?? '') === parts.themeSlug)
    ?? (candidates.length === 1 ? candidates[0] : null);

  if (!selected) {
    const names = candidates.map((candidate) => candidate.label).join(', ');
    throw new Error(`Could not match "${parts.themeSlug}" to a theme in this extension. Available themes: ${names}`);
  }

  if (selected.slug !== parts.themeSlug) {
    warnings.push(`Imported ${selected.label}; the URL slug did not exactly match the theme label.`);
  }

  const uiTheme = typeof selected.contribution.uiTheme === 'string' ? selected.contribution.uiTheme : undefined;
  const colorScheme = inferColorScheme(uiTheme, selected.json);
  const vscodeColors = sanitizeVsCodeColors(selected.json.colors);
  const colors = buildKpmThemeColors(vscodeColors, colorScheme);
  const vscode = buildMonacoThemeData(selected.json, vscodeColors, colorScheme, warnings);
  const importedAt = new Date().toISOString();
  const sourceKey = `vscodethemes:${parts.extensionId.toLowerCase()}:${parts.themeSlug}`;

  return {
    theme: {
      sourceKey,
      name: selected.label,
      description: `Imported from ${parts.extensionId}`,
      colors,
      preview: {
        surface: colors.surface0,
        accent: colors.accent,
        text: colors.textPrimary,
      },
      vscode,
      source: {
        type: 'vscodethemes',
        url: parts.url,
        extensionId: parts.extensionId,
        publisher: parts.publisher,
        extensionName: parts.extensionName,
        themeSlug: parts.themeSlug,
        themeLabel: selected.label,
        importedAt,
      },
    },
    warnings,
  };
}

async function fetchWithTimeout(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/octet-stream',
        'User-Agent': 'KPM Theme Importer',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function readManifest(zip: ZipArchive): VsCodeManifest {
  const manifestText = zip.readText('extension/package.json', MAX_MANIFEST_BYTES)
    ?? zip.readText('package.json', MAX_MANIFEST_BYTES);
  if (!manifestText) {
    throw new Error('Theme package did not contain a VS Code extension manifest');
  }

  return parseJsonc(manifestText) as VsCodeManifest;
}

function loadThemeCandidate(
  zip: ZipArchive,
  contribution: VsCodeThemeContribution,
  warnings: string[],
): ThemeCandidate | null {
  if (typeof contribution.path !== 'string') {
    warnings.push('Skipped a theme contribution without a JSON path.');
    return null;
  }

  if (!contribution.path.toLowerCase().endsWith('.json')) {
    warnings.push(`Skipped ${stringValue(contribution.label) ?? 'theme'} because only JSON themes are supported.`);
    return null;
  }

  const themePath = resolveExtensionPath(contribution.path);
  const json = loadThemeJson(zip, themePath, warnings);
  if (!json) {
    warnings.push(`Skipped ${stringValue(contribution.label) ?? contribution.path} because its theme file could not be read.`);
    return null;
  }

  const label = stringValue(contribution.label) ?? stringValue(json.name) ?? path.basename(themePath, '.json');
  return {
    contribution,
    json,
    label,
    slug: slugify(label),
  };
}

function loadThemeJson(zip: ZipArchive, themePath: string, warnings: string[], depth = 0): VsCodeThemeJson | null {
  if (depth > 3) {
    warnings.push('Stopped following nested theme includes after three levels.');
    return null;
  }

  const text = zip.readText(themePath, MAX_THEME_BYTES);
  if (!text) {
    return null;
  }

  const current = parseJsonc(text) as VsCodeThemeJson;
  if (typeof current.include !== 'string') {
    return current;
  }

  if (!current.include.toLowerCase().endsWith('.json')) {
    warnings.push('Ignored a non-JSON theme include.');
    return current;
  }

  const includePath = resolveExtensionPath(path.posix.join(path.posix.dirname(themePath.replace(/^extension\//, '')), current.include));
  const base = loadThemeJson(zip, includePath, warnings, depth + 1);
  if (!base) {
    warnings.push(`Ignored unresolved theme include ${current.include}.`);
    return current;
  }

  return mergeThemeJson(base, current);
}

function mergeThemeJson(base: VsCodeThemeJson, current: VsCodeThemeJson): VsCodeThemeJson {
  const baseTokenColors = Array.isArray(base.tokenColors) ? base.tokenColors : [];
  const currentTokenColors = Array.isArray(current.tokenColors) ? current.tokenColors : [];

  return {
    ...base,
    ...current,
    colors: {
      ...(isRecord(base.colors) ? base.colors : {}),
      ...(isRecord(current.colors) ? current.colors : {}),
    },
    tokenColors: [...baseTokenColors, ...currentTokenColors],
    semanticTokenColors: {
      ...(isRecord(base.semanticTokenColors) ? base.semanticTokenColors : {}),
      ...(isRecord(current.semanticTokenColors) ? current.semanticTokenColors : {}),
    },
  };
}

function resolveExtensionPath(themePath: string): string {
  const normalized = themePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').includes('..')) {
    throw new Error('Theme package contains an unsafe theme path');
  }
  return normalized.startsWith('extension/') ? normalized : `extension/${normalized}`;
}

function inferColorScheme(uiTheme: string | undefined, theme: VsCodeThemeJson): 'light' | 'dark' {
  if (uiTheme === 'vs') return 'light';
  if (uiTheme === 'vs-dark' || uiTheme === 'hc-black') return 'dark';
  if (theme.type === 'light') return 'light';
  if (theme.type === 'dark') return 'dark';

  const colors = sanitizeVsCodeColors(theme.colors);
  const editorBackground = normalizeOpaqueHex(colors['editor.background'], '#1e1e1e');
  return isDarkColor(editorBackground) ? 'dark' : 'light';
}

function sanitizeVsCodeColors(input: unknown): Record<string, string> {
  if (!isRecord(input)) {
    return {};
  }

  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!/^[A-Za-z0-9._-]{1,160}$/.test(key) || typeof value !== 'string') {
      continue;
    }

    const normalized = normalizeHexColor(value);
    if (normalized) {
      sanitized[key] = normalized;
    }
  }
  return sanitized;
}

function buildKpmThemeColors(vscodeColors: Record<string, string>, colorScheme: 'light' | 'dark'): CustomThemeColors {
  const isDark = colorScheme === 'dark';
  const defaultBg = isDark ? '#1e1e1e' : '#ffffff';
  const defaultFg = isDark ? '#d4d4d4' : '#1f2328';
  const surface0 = getOpaqueColor(vscodeColors, ['editor.background', 'window.background'], defaultBg, defaultBg);
  const textPrimary = ensureTextContrast(
    getOpaqueColor(vscodeColors, ['editor.foreground', 'foreground'], defaultFg, surface0),
    surface0,
    colorScheme,
  );

  const accent = getContrastingColor(
    vscodeColors,
    [
      'button.background',
      'activityBarBadge.background',
      'activityBar.foreground',
      'tab.activeForeground',
      'list.highlightForeground',
      'panelTitle.activeBorder',
      'textLink.foreground',
      'progressBar.background',
      'terminal.ansiBlue',
      'focusBorder',
    ],
    isDark ? '#60a5fa' : '#2563eb',
    surface0,
    3,
  );

  const surface1 = getOpaqueColor(vscodeColors, ['sideBar.background', 'panel.background', 'activityBar.background'], mix(surface0, isDark ? '#ffffff' : '#000000', 0.04), surface0);
  const surface2 = getOpaqueColor(vscodeColors, ['editorWidget.background', 'dropdown.background', 'quickInput.background'], mix(surface0, isDark ? '#ffffff' : '#000000', 0.08), surface0);
  const surface3 = getOpaqueColor(vscodeColors, ['list.hoverBackground', 'toolbar.hoverBackground'], mix(surface0, isDark ? '#ffffff' : '#000000', 0.12), surface0);
  const surface4 = getOpaqueColor(vscodeColors, ['list.activeSelectionBackground', 'editor.selectionBackground'], mix(surface0, isDark ? '#ffffff' : '#000000', 0.18), surface0);
  const surfaceElevated = getOpaqueColor(vscodeColors, ['menu.background', 'editorSuggestWidget.background'], surface2, surface0);

  return {
    colorScheme,
    surface0,
    surface1,
    surface2,
    surface3,
    surface4,
    surfaceElevated,
    textPrimary,
    textSecondary: ensureTextContrast(
      getOpaqueColor(vscodeColors, ['sideBar.foreground', 'descriptionForeground'], mix(textPrimary, surface0, 0.28), surface0),
      surface0,
      colorScheme,
    ),
    textTertiary: getOpaqueColor(vscodeColors, ['disabledForeground'], mix(textPrimary, surface0, 0.42), surface0),
    textMuted: getOpaqueColor(vscodeColors, ['editorLineNumber.foreground', 'input.placeholderForeground'], mix(textPrimary, surface0, 0.58), surface0),
    accent,
    accentHover: getContrastingColor(
      vscodeColors,
      ['button.hoverBackground', 'textLink.activeForeground'],
      mix(accent, isDark ? '#ffffff' : '#000000', 0.14),
      surface0,
      3,
    ),
    success: getOpaqueColor(vscodeColors, ['terminal.ansiGreen', 'testing.iconPassed', 'charts.green'], isDark ? '#4ade80' : '#16a34a', surface0),
    warning: getOpaqueColor(vscodeColors, ['terminal.ansiYellow', 'editorWarning.foreground', 'charts.yellow'], isDark ? '#fbbf24' : '#ca8a04', surface0),
    danger: getOpaqueColor(vscodeColors, ['terminal.ansiRed', 'errorForeground', 'editorError.foreground'], isDark ? '#f87171' : '#dc2626', surface0),
    info: getOpaqueColor(vscodeColors, ['terminal.ansiBlue', 'editorInfo.foreground', 'charts.blue'], isDark ? '#60a5fa' : '#2563eb', surface0),
    purple: getOpaqueColor(vscodeColors, ['terminal.ansiMagenta', 'charts.purple'], isDark ? '#c084fc' : '#9333ea', surface0),
    depth0: accent,
    depth1: getOpaqueColor(vscodeColors, ['terminal.ansiBlue', 'charts.blue'], isDark ? '#60a5fa' : '#2563eb', surface0),
    depth2: getOpaqueColor(vscodeColors, ['terminal.ansiGreen', 'charts.green'], isDark ? '#4ade80' : '#16a34a', surface0),
    depth3: getOpaqueColor(vscodeColors, ['terminal.ansiMagenta', 'charts.purple'], isDark ? '#c084fc' : '#9333ea', surface0),
    depth4: getOpaqueColor(vscodeColors, ['terminal.ansiRed', 'charts.red'], isDark ? '#f87171' : '#dc2626', surface0),
  };
}

function buildMonacoThemeData(
  theme: VsCodeThemeJson,
  vscodeColors: Record<string, string>,
  colorScheme: 'light' | 'dark',
  warnings: string[],
): CustomThemeVsCodeData {
  const rules: CustomThemeTokenRule[] = [];

  if (Array.isArray(theme.tokenColors)) {
    for (const tokenColor of theme.tokenColors.slice(0, 3_000)) {
      if (!isRecord(tokenColor) || !isRecord(tokenColor.settings)) {
        continue;
      }
      const scopes = Array.isArray(tokenColor.scope) ? tokenColor.scope : [tokenColor.scope];
      const foreground = typeof tokenColor.settings.foreground === 'string'
        ? normalizeHexColor(tokenColor.settings.foreground)?.slice(1, 7)
        : undefined;
      const background = typeof tokenColor.settings.background === 'string'
        ? normalizeHexColor(tokenColor.settings.background)?.slice(1, 7)
        : undefined;
      const fontStyle = sanitizeFontStyle(tokenColor.settings.fontStyle);

      for (const scope of scopes) {
        if (typeof scope !== 'string' || scope.length === 0 || scope.length > 200) {
          continue;
        }
        const rule: CustomThemeTokenRule = { token: scope };
        if (foreground) rule.foreground = foreground;
        if (background) rule.background = background;
        if (fontStyle !== undefined) rule.fontStyle = fontStyle;
        if (rule.foreground || rule.background || rule.fontStyle !== undefined) {
          rules.push(rule);
        }
      }
    }
  } else if (typeof theme.tokenColors === 'string') {
    warnings.push('Ignored tokenColors file reference; KPM only imports inline JSON token rules.');
  }

  const encodedTokensColors = Array.isArray(theme.encodedTokensColors)
    ? theme.encodedTokensColors
        .filter((value): value is string => typeof value === 'string')
        .map((value) => normalizeHexColor(value))
        .filter((value): value is string => value !== null)
        .slice(0, 512)
    : undefined;

  return {
    base: colorScheme === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    colors: vscodeColors,
    rules,
    ...(encodedTokensColors && encodedTokensColors.length > 0 ? { encodedTokensColors } : {}),
    ...(typeof theme.semanticHighlighting === 'boolean' ? { semanticHighlighting: theme.semanticHighlighting } : {}),
    ...(sanitizeSemanticTokenColors(theme.semanticTokenColors) ? { semanticTokenColors: sanitizeSemanticTokenColors(theme.semanticTokenColors) } : {}),
  };
}

function sanitizeSemanticTokenColors(input: unknown): Record<string, unknown> | undefined {
  if (!isRecord(input)) return undefined;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input).slice(0, 1_000)) {
    if (!/^[A-Za-z0-9_.:*#-]{1,200}$/.test(key)) {
      continue;
    }

    if (typeof value === 'string') {
      const color = normalizeHexColor(value);
      if (color) sanitized[key] = color;
      continue;
    }

    if (!isRecord(value)) {
      continue;
    }

    const entry: Record<string, unknown> = {};
    if (typeof value.foreground === 'string') {
      const color = normalizeHexColor(value.foreground);
      if (color) entry.foreground = color;
    }
    const fontStyle = sanitizeFontStyle(value.fontStyle);
    if (fontStyle !== undefined) entry.fontStyle = fontStyle;
    for (const flag of ['bold', 'italic', 'underline', 'strikethrough'] as const) {
      if (typeof value[flag] === 'boolean') entry[flag] = value[flag];
    }
    if (Object.keys(entry).length > 0) {
      sanitized[key] = entry;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeFontStyle(value: unknown): string | undefined {
  if (value === '') return '';
  if (typeof value !== 'string') return undefined;
  const allowed = value
    .split(/\s+/)
    .filter((part) => ['italic', 'bold', 'underline', 'strikethrough'].includes(part));
  return allowed.length > 0 ? allowed.join(' ') : undefined;
}

function parseJsonc(text: string): unknown {
  return JSON.parse(removeTrailingCommas(stripJsonComments(text)));
}

function stripJsonComments(text: string): string {
  let output = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (char === '\n' || char === '\r') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (!inString && char === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (!inString && char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    output += char;

    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      inString = !inString;
    }
  }

  return output;
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1');
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getOpaqueColor(
  colors: Record<string, string>,
  keys: string[],
  fallback: string,
  background: string,
): string {
  for (const key of keys) {
    const value = colors[key];
    if (value) {
      return normalizeOpaqueHex(value, background);
    }
  }
  return normalizeOpaqueHex(fallback, background);
}

function getContrastingColor(
  colors: Record<string, string>,
  keys: string[],
  fallback: string,
  background: string,
  minRatio: number,
): string {
  let firstValid: string | null = null;

  for (const key of keys) {
    const value = colors[key];
    if (!value) {
      continue;
    }

    const color = normalizeOpaqueHex(value, background);
    firstValid ??= color;
    if (contrastRatio(color, background) >= minRatio) {
      return color;
    }
  }

  const fallbackColor = normalizeOpaqueHex(fallback, background);
  if (contrastRatio(fallbackColor, background) >= minRatio) {
    return fallbackColor;
  }

  return firstValid ?? fallbackColor;
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const hex = match[1].toLowerCase();
  if (hex.length === 3 || hex.length === 4) {
    return `#${hex.split('').map((char) => `${char}${char}`).join('')}`;
  }
  return `#${hex}`;
}

function normalizeOpaqueHex(value: string, background: string): string {
  const normalized = normalizeHexColor(value) ?? normalizeHexColor(background) ?? '#000000';
  if (normalized.length === 7) {
    return normalized;
  }

  const foregroundRgb = hexToRgb(normalized.slice(0, 7));
  const backgroundRgb = hexToRgb(background);
  const alpha = parseInt(normalized.slice(7, 9), 16) / 255;
  return rgbToHex({
    r: Math.round(foregroundRgb.r * alpha + backgroundRgb.r * (1 - alpha)),
    g: Math.round(foregroundRgb.g * alpha + backgroundRgb.g * (1 - alpha)),
    b: Math.round(foregroundRgb.b * alpha + backgroundRgb.b * (1 - alpha)),
  });
}

function mix(a: string, b: string, factor: number): string {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  return rgbToHex({
    r: Math.round(left.r + (right.r - left.r) * factor),
    g: Math.round(left.g + (right.g - left.g) * factor),
    b: Math.round(left.b + (right.b - left.b) * factor),
  });
}

function ensureTextContrast(text: string, background: string, colorScheme: 'light' | 'dark'): string {
  if (contrastRatio(text, background) >= 3) {
    return text;
  }
  return colorScheme === 'dark' ? '#f5f5f5' : '#1f2328';
}

function isDarkColor(hex: string): boolean {
  return relativeLuminance(hexToRgb(hex)) < 0.5;
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(hexToRgb(a));
  const l2 = relativeLuminance(hexToRgb(b));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const values = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex)?.slice(1, 7) ?? '000000';
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class ZipArchive {
  private constructor(
    private readonly data: Buffer,
    private readonly entries: Map<string, ZipEntry>,
  ) {}

  static from(data: Buffer): ZipArchive {
    const entries = new Map<string, ZipEntry>();
    const eocdOffset = findEndOfCentralDirectory(data);
    const totalEntries = data.readUInt16LE(eocdOffset + 10);
    const centralDirectoryOffset = data.readUInt32LE(eocdOffset + 16);
    let offset = centralDirectoryOffset;

    for (let index = 0; index < totalEntries; index++) {
      if (offset + 46 > data.length || data.readUInt32LE(offset) !== 0x02014b50) {
        throw new Error('Theme package has an invalid zip directory');
      }

      const flags = data.readUInt16LE(offset + 8);
      const compressionMethod = data.readUInt16LE(offset + 10);
      const compressedSize = data.readUInt32LE(offset + 20);
      const uncompressedSize = data.readUInt32LE(offset + 24);
      const fileNameLength = data.readUInt16LE(offset + 28);
      const extraLength = data.readUInt16LE(offset + 30);
      const commentLength = data.readUInt16LE(offset + 32);
      const localHeaderOffset = data.readUInt32LE(offset + 42);
      const nameStart = offset + 46;
      const nameEnd = nameStart + fileNameLength;
      const name = data.toString('utf8', nameStart, nameEnd).replace(/\\/g, '/');

      if (!name.endsWith('/') && !name.split('/').includes('..')) {
        entries.set(name, {
          name,
          flags,
          compressionMethod,
          compressedSize,
          uncompressedSize,
          localHeaderOffset,
        });
      }

      offset = nameEnd + extraLength + commentLength;
    }

    return new ZipArchive(data, entries);
  }

  readText(entryName: string, maxBytes: number): string | undefined {
    const entry = this.entries.get(entryName);
    if (!entry) {
      return undefined;
    }

    if (entry.uncompressedSize > maxBytes) {
      throw new Error(`Theme package entry ${entryName} is too large`);
    }

    if ((entry.flags & 0x1) === 0x1) {
      throw new Error('Encrypted theme packages are not supported');
    }

    const localOffset = entry.localHeaderOffset;
    if (localOffset + 30 > this.data.length || this.data.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('Theme package has an invalid zip entry');
    }

    const fileNameLength = this.data.readUInt16LE(localOffset + 26);
    const extraLength = this.data.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > this.data.length) {
      throw new Error('Theme package has a truncated zip entry');
    }

    const compressed = this.data.subarray(dataStart, dataEnd);
    let uncompressed: Buffer;
    if (entry.compressionMethod === 0) {
      uncompressed = Buffer.from(compressed);
    } else if (entry.compressionMethod === 8) {
      uncompressed = inflateRawSync(compressed, { maxOutputLength: maxBytes });
    } else {
      throw new Error('Theme package uses an unsupported zip compression method');
    }

    if (uncompressed.byteLength > maxBytes) {
      throw new Error(`Theme package entry ${entryName} is too large`);
    }

    return uncompressed.toString('utf8');
  }
}

function findEndOfCentralDirectory(data: Buffer): number {
  const minOffset = Math.max(0, data.length - 65_557);
  for (let offset = data.length - 22; offset >= minOffset; offset--) {
    if (data.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error('Theme package is not a valid VSIX file');
}
