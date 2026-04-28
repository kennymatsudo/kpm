export function listCustomThemes() {
  return window.api.customThemes.list();
}

export function importCustomThemeFromUrl(url: string) {
  return window.api.customThemes.importFromUrl(url);
}

export function deleteCustomTheme(themeId: string) {
  return window.api.customThemes.delete(themeId);
}

