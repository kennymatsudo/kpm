import { test as base, expect as pwExpect } from '@playwright/test';
import type { Page, Browser, BrowserContext } from '@playwright/test';
import { chromium } from 'playwright';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CDP_PORT = 9222;

interface WorkerFixtures {
  electronApp: {
    browser: Browser;
    context: BrowserContext;
    process: ChildProcess;
  };
}

interface TestFixtures {
  window: Page;
}

// Worker-scoped fixture: launches Electron ONCE per worker, reused across all tests
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Worker scope - app launches once and is shared
  electronApp: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      // Use isolated test data directory
      const testDataPath = path.join(os.tmpdir(), 'kpm-e2e-test');

      // Clean up any previous test data
      if (fs.existsSync(testDataPath)) {
        fs.rmSync(testDataPath, { recursive: true });
      }
      fs.mkdirSync(testDataPath, { recursive: true });

      // Mark the directory as disposable test data. The app's resetDatabase
      // handler refuses to truncate a database without this sentinel next to
      // it, so a broken isolation setup can't wipe the real database.
      fs.writeFileSync(path.join(testDataPath, '.kpm-e2e'), '');

      // Find the latest packaged build
      const latestBuild = findLatestBuild('release');
      const appInfo = parseElectronApp(latestBuild);

      console.log('Launching Electron app:', appInfo.executable);
      console.log('Using isolated test data directory:', testDataPath);

      // Kill any existing process on CDP port
      try {
        const { execSync } = await import('child_process');
        execSync(`lsof -ti:${CDP_PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
      } catch {
        // Ignore errors
      }

      // Launch Electron with remote debugging
      const electronProcess = spawn(
        appInfo.executable,
        [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${testDataPath}`],
        {
          env: { ...process.env, NODE_ENV: 'test' },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      // Wait for DevTools to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for DevTools')), 30000);

        const checkOutput = (data: Buffer) => {
          const output = data.toString();
          console.log('Electron output:', output.slice(0, 200));
          if (output.includes('DevTools listening')) {
            clearTimeout(timeout);
            resolve();
          }
        };

        electronProcess.stdout?.on('data', checkOutput);
        electronProcess.stderr?.on('data', checkOutput);
        electronProcess.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        electronProcess.on('exit', (code) => {
          if (code !== 0) {
            clearTimeout(timeout);
            reject(new Error(`Electron exited with code ${code}`));
          }
        });
      });

      console.log('Electron app launched, connecting via CDP...');

      // Poll for CDP endpoint to be ready (replaces hardcoded 2000ms wait)
      let browser: Browser | null = null;
      const maxAttempts = 20;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, {
            timeout: 5000,
          });
          break;
        } catch (err) {
          if (attempt === maxAttempts - 1) {
            throw new Error(`Failed to connect to CDP after ${maxAttempts} attempts: ${String(err)}`, { cause: err });
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (!browser) {
        throw new Error('Failed to connect to browser');
      }

      const contexts = browser.contexts();
      const context = contexts[0];

      if (!context) {
        throw new Error('No browser context found');
      }

      console.log('Connected to Electron');

      // Isolation check: confirm the app actually opened the database in our
      // temp directory before any test (or destructive reset) runs. The
      // --user-data-dir flag has been silently ignored before, pointing
      // test-mode runs at the real database.
      let page = context.pages()[0];
      for (let attempt = 0; !page && attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        page = context.pages()[0];
      }
      if (!page) {
        throw new Error('Isolation check failed: no app window appeared');
      }
      await page.waitForLoadState('domcontentloaded');
      const dbPath = await page.evaluate(async () => {
        const api = (window as unknown as { api?: { testing?: { getDbPath: () => Promise<{ dbPath: string | null }> } } }).api;
        return api?.testing ? (await api.testing.getDbPath()).dbPath : null;
      });
      // realpath both sides: macOS tmpdir paths involve the /var → /private/var symlink
      const expectedDir = fs.realpathSync(testDataPath);
      const actualDir = dbPath ? fs.realpathSync(path.dirname(dbPath)) : null;
      if (actualDir !== expectedDir) {
        electronProcess.kill();
        throw new Error(
          `E2E isolation check failed: app opened database at ${String(dbPath)}, expected it under ${expectedDir}. ` +
            'Refusing to run tests against a database outside the isolated test directory.'
        );
      }
      console.log('Isolation check passed: app database is', dbPath);

      await use({ browser, context, process: electronProcess });

      // Cleanup after all tests in this worker are done
      console.log('Cleaning up Electron...');
      await browser.close();
      electronProcess.kill();

      // Clean up test data
      if (fs.existsSync(testDataPath)) {
        fs.rmSync(testDataPath, { recursive: true });
      }
    },
    { scope: 'worker' },
  ],

  // Test scope - provides the page reference without resetting database.
  // Spec files manage their own setup/teardown via ensureAppReady() in beforeAll.
  window: async ({ electronApp }, use) => {
    const pages = electronApp.context.pages();
    const window = pages[0];

    if (!window) {
      throw new Error('No window found');
    }

    await window.waitForLoadState('domcontentloaded');

    await use(window);
  },
});

export { pwExpect as expect };
