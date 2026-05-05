// Patches CFBundleName and CFBundleDisplayName in the dev Electron binary so
// that macOS shows "KPM" in the Dock tooltip and app switcher during
// development. In packaged builds, electron-builder sets these from
// productName automatically.
//
// Idempotent — safe to run on every `npm install`.

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

if (process.platform !== 'darwin') {
  process.exit(0);
}

const plist = path.join(
  __dirname,
  '..',
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'Info.plist',
);

if (!fs.existsSync(plist)) {
  process.exit(0);
}

const buddy = '/usr/libexec/PlistBuddy';

try {
  execFileSync(buddy, ['-c', 'Set :CFBundleName KPM', plist]);
  execFileSync(buddy, ['-c', 'Set :CFBundleDisplayName KPM', plist]);
  console.log('[patch-electron-plist] Set CFBundleName/CFBundleDisplayName → KPM');
} catch (err) {
  console.warn('[patch-electron-plist] Failed to patch Info.plist:', err.message);
}
