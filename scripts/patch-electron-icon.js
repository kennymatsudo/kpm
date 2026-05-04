// Replaces the default Electron icon inside node_modules with our app icon so
// that `make dev` shows the KPM icon in the macOS Dock from the moment
// the tile appears — eliminating the brief Electron-logo flash on startup.
//
// In packaged builds the icon comes from electron-builder, so this script
// only matters for development. It's idempotent (runs every `npm install`)
// and a no-op on non-macOS platforms or if either file is missing.

const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') {
  process.exit(0);
}

const source = path.join(__dirname, '..', 'assets', 'icon.icns');
const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'Resources',
  'electron.icns',
);

if (!fs.existsSync(source)) {
  console.warn(`[patch-electron-icon] Source icon missing: ${source}`);
  process.exit(0);
}

if (!fs.existsSync(target)) {
  // Electron not installed yet, or path layout changed. Nothing to do.
  process.exit(0);
}

try {
  fs.copyFileSync(source, target);
  console.log('[patch-electron-icon] Replaced node_modules Electron.app icon with assets/icon.icns');
} catch (err) {
  console.warn('[patch-electron-icon] Failed to patch icon:', err.message);
}
