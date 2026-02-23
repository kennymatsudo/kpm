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
