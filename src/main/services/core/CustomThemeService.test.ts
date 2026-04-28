import { describe, expect, it, vi } from 'vitest';
import type { CustomTheme } from '../../../shared/types';
import type { ICustomThemeRepository } from '../../db/interfaces';
import { createCustomThemeService, parseVsCodeThemesUrl } from './CustomThemeService';

function createStore(): ICustomThemeRepository {
  const themes = new Map<string, CustomTheme>();

  return {
    list: () => [...themes.values()],
    get: (id) => themes.get(id),
    upsert: (theme) => {
      const persisted: CustomTheme = {
        ...theme,
        id: 'theme-1',
        created_at: '2026-04-28T00:00:00.000Z',
        updated_at: '2026-04-28T00:00:00.000Z',
      };
      themes.set(persisted.id, persisted);
      return persisted;
    },
    delete: (id) => {
      themes.delete(id);
    },
  };
}

function createZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const contentBuffer = Buffer.from(content, 'utf8');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(contentBuffer.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, contentBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(contentBuffer.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + contentBuffer.length;
  }

  const local = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([local, central, end]);
}

describe('parseVsCodeThemesUrl', () => {
  it('extracts extension id and theme slug from vscodethemes URLs', () => {
    const result = parseVsCodeThemesUrl('https://vscodethemes.com/e/GitHub.github-vscode-theme/github-dark-default');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.publisher).toBe('GitHub');
    expect(result.data.extensionName).toBe('github-vscode-theme');
    expect(result.data.themeSlug).toBe('github-dark-default');
  });

  it('rejects unsupported hosts and protocols', () => {
    expect(parseVsCodeThemesUrl('http://vscodethemes.com/e/a.b/c').ok).toBe(false);
    expect(parseVsCodeThemesUrl('https://example.com/e/a.b/c').ok).toBe(false);
  });
});

describe('CustomThemeService', () => {
  it('imports sanitized JSON theme data from a VS Code theme package', async () => {
    const packageJson = JSON.stringify({
      publisher: 'GitHub',
      name: 'github-vscode-theme',
      contributes: {
        themes: [
          {
            label: 'GitHub Dark Default',
            uiTheme: 'vs-dark',
            path: './themes/dark.json',
          },
        ],
      },
    });
    const themeJson = JSON.stringify({
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#c9d1d9',
        'button.background': '#238636',
        'evil.color': 'url(https://example.com/bad.css)',
      },
      tokenColors: [
        {
          scope: 'comment',
          settings: {
            foreground: '#8b949e',
            fontStyle: 'italic unknown',
          },
        },
      ],
    });
    const zip = createZip({
      'extension/package.json': packageJson,
      'extension/themes/dark.json': themeJson,
    });
    const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    const fetchFn = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'content-length': String(zip.length) },
    })) as unknown as typeof fetch;
    const service = createCustomThemeService({
      customThemes: createStore(),
      fetchFn,
    });

    const result = await service.importFromVsCodeThemesUrl(
      'https://vscodethemes.com/e/GitHub.github-vscode-theme/github-dark-default',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.theme.name).toBe('GitHub Dark Default');
    expect(result.data.theme.colors.surface0).toBe('#0d1117');
    expect(result.data.theme.colors.accent).toBe('#238636');
    expect(result.data.theme.vscode.colors['evil.color']).toBeUndefined();
    expect(result.data.theme.vscode.rules[0]).toEqual({
      token: 'comment',
      foreground: '8b949e',
      fontStyle: 'italic',
    });
  });

  it('skips low-contrast workbench colors when deriving the app accent', async () => {
    const packageJson = JSON.stringify({
      publisher: 'liviuschera',
      name: 'noctis',
      contributes: {
        themes: [
          {
            label: 'Noctis Hibernus',
            uiTheme: 'vs',
            path: './themes/hibernus.json',
          },
        ],
      },
    });
    const themeJson = JSON.stringify({
      colors: {
        'editor.background': '#f4f6f6',
        'editor.foreground': '#005661',
        'focusBorder': '#e0eff1',
        'button.background': '#099',
        'button.hoverBackground': '#0cc',
        'textLink.foreground': '#00c6e0',
        'textLink.activeForeground': '#00c6e0',
      },
    });
    const zip = createZip({
      'extension/package.json': packageJson,
      'extension/themes/hibernus.json': themeJson,
    });
    const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    const fetchFn = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'content-length': String(zip.length) },
    })) as unknown as typeof fetch;
    const service = createCustomThemeService({
      customThemes: createStore(),
      fetchFn,
    });

    const result = await service.importFromVsCodeThemesUrl(
      'https://vscodethemes.com/e/liviuschera.noctis/noctis-hibernus',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.theme.colors.colorScheme).toBe('light');
    expect(result.data.theme.colors.accent).toBe('#009999');
    expect(result.data.theme.colors.accentHover).toBe('#008484');
  });

  it('normalizes existing imported themes on read', () => {
    const store = createStore();
    const persisted = store.upsert({
      sourceKey: 'vscodethemes:liviuschera.noctis:noctis-hibernus',
      name: 'Noctis Hibernus',
      description: 'Imported from liviuschera.noctis',
      colors: {
        colorScheme: 'light',
        surface0: '#f4f6f6',
        surface1: '#e7f2f3',
        surface2: '#e0eff1',
        surface3: '#d1eafa',
        surface4: '#b6e1e7',
        surfaceElevated: '#e0eff1',
        textPrimary: '#005661',
        textSecondary: '#71838e',
        textTertiary: '#8ca6a6',
        textMuted: '#a0abac',
        accent: '#e0eff1',
        accentHover: '#00c6e0',
      },
      preview: {
        surface: '#f4f6f6',
        accent: '#e0eff1',
        text: '#005661',
      },
      vscode: {
        base: 'vs',
        inherit: true,
        colors: {
          'editor.background': '#f4f6f6',
          'editor.foreground': '#005661',
          'focusBorder': '#e0eff1',
          'button.background': '#099',
          'button.hoverBackground': '#0cc',
        },
        rules: [],
      },
      source: {
        type: 'vscodethemes',
        url: 'https://vscodethemes.com/e/liviuschera.noctis/noctis-hibernus',
        extensionId: 'liviuschera.noctis',
        publisher: 'liviuschera',
        extensionName: 'noctis',
        themeSlug: 'noctis-hibernus',
        themeLabel: 'Noctis Hibernus',
        importedAt: '2026-04-28T00:00:00.000Z',
      },
    });
    const service = createCustomThemeService({ customThemes: store });

    const listResult = service.list();
    const getResult = service.get(persisted.id);

    expect(listResult.ok).toBe(true);
    expect(getResult.ok).toBe(true);
    if (!listResult.ok || !getResult.ok) return;
    expect(listResult.data[0].colors.accent).toBe('#009999');
    expect(listResult.data[0].preview.accent).toBe('#009999');
    expect(getResult.data.colors.accent).toBe('#009999');
  });
});
