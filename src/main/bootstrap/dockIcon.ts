import { app, nativeImage, systemPreferences } from 'electron';
import path from 'path';

// Dynamic macOS Dock icon. The light (white) tile is the default shipped icon;
// when macOS is in dark mode the Dock tile swaps to the inverted (dark) variant.
//
// This tracks the *system* appearance directly via AppleInterfaceStyle, so it is
// independent of KPM's in-app theme (which lives entirely in the renderer). It
// only affects the running app's Dock tile — Finder and the Dock-when-closed
// show whichever variant is bundled, since macOS has no per-appearance app icon
// for the desktop.

function systemPrefersDark(): boolean {
  // 'Dark' when macOS is in dark mode; empty string in light mode.
  return systemPreferences.getUserDefault('AppleInterfaceStyle', 'string') === 'Dark';
}

function iconPathFor(dark: boolean): string {
  const file = dark ? 'icon-dark.png' : 'icon.png';
  // Packaged builds bundle these under Resources (electron-builder extraResources);
  // in dev they're read straight from the repo's assets/ dir.
  return app.isPackaged
    ? path.join(process.resourcesPath, file)
    : path.join(process.cwd(), 'assets', file);
}

/** Set the Dock icon to match the current macOS appearance. No-op off macOS. */
export function applyDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return;
  try {
    const image = nativeImage.createFromPath(iconPathFor(systemPrefersDark()));
    if (!image.isEmpty()) {
      app.dock.setIcon(image);
    }
  } catch (err) {
    console.warn('[dockIcon] Failed to set Dock icon:', err);
  }
}

/**
 * Keep the Dock icon in sync with the macOS light/dark setting while the app
 * runs. Safe to call once after the app is ready; no-op off macOS.
 */
export function watchSystemAppearance(): void {
  if (process.platform !== 'darwin') return;
  try {
    systemPreferences.subscribeNotification(
      'AppleInterfaceThemeChangedNotification',
      () => applyDockIcon(),
    );
  } catch (err) {
    console.warn('[dockIcon] Failed to subscribe to appearance changes:', err);
  }
}
