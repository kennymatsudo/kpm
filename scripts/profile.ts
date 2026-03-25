/**
 *
 * Launches the packaged Electron app with CDP, connects via Playwright,
 * captures CPU profiles + Performance traces while running through
 * standard user flows, then saves analyzable output files.
 *
 * Usage:
 *   npx tsx scripts/profile.ts
 *
 * Output (in scripts/profiles/):
 *   - cpu-profile-<timestamp>.cpuprofile   (open in Chrome DevTools or speedscope.app)
 *   - trace-<timestamp>.json               (open in chrome://tracing or speedscope.app)
 *   - summary-<timestamp>.txt              (human-readable summary)
 */

import { chromium } from 'playwright';
import type { Browser, Page, CDPSession } from 'playwright';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CDP_PORT = 9223; // Use different port from E2E tests
const PROFILE_DIR = path.join(__dirname, 'profiles');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

// ─── Utilities ───────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[Profile] ${msg}`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── App Launch ──────────────────────────────────────────────────────

async function launchApp(): Promise<{ browser: Browser; page: Page; process: ChildProcess }> {
  const testDataPath = path.join(os.tmpdir(), 'kpm-profile-test');

  if (fs.existsSync(testDataPath)) {
    fs.rmSync(testDataPath, { recursive: true });
  }
  fs.mkdirSync(testDataPath, { recursive: true });

  const latestBuild = findLatestBuild('release');
  const appInfo = parseElectronApp(latestBuild);

  log(`Launching: ${appInfo.executable}`);

  // Kill any existing process on CDP port
  try {
    const { execSync } = await import('child_process');
    execSync(`lsof -ti:${CDP_PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
  } catch { /* ignore */ }

  const electronProcess = spawn(
    appInfo.executable,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${testDataPath}`,
      '--js-flags=--expose-gc', // Allow manual GC for memory profiling
    ],
    {
      env: { ...process.env, NODE_ENV: 'test', KPM_PERF: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  // Wait for DevTools to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for DevTools')), 30000);
    const check = (data: Buffer) => {
      const output = data.toString();
      if (output.includes('DevTools listening')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    electronProcess.stdout?.on('data', check);
    electronProcess.stderr?.on('data', check);
    electronProcess.on('error', err => { clearTimeout(timeout); reject(err); });
  });

  log('Connecting via CDP...');

  let browser: Browser | null = null;
  for (let i = 0; i < 20; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 5000 });
      break;
    } catch {
      await sleep(500);
    }
  }

  if (!browser) throw new Error('Failed to connect to CDP');

  const context = browser.contexts()[0];
  if (!context) throw new Error('No browser context');

  const page = context.pages()[0];
  if (!page) throw new Error('No page found');

  await page.waitForLoadState('domcontentloaded');

  // Wait for app-ready signal
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 15000, state: 'attached' });
  log('App is ready');

  // Dismiss update banner if present
  await sleep(1000);
  const dismissBtn = page.getByRole('button', { name: 'Dismiss' });
  if (await dismissBtn.count() > 0) {
    await dismissBtn.click();
    await sleep(500);
  }

  return { browser, page, process: electronProcess };
}

// ─── CDP Profiling ───────────────────────────────────────────────────

async function startCPUProfile(cdp: CDPSession): Promise<void> {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); // 100μs for high resolution
  await cdp.send('Profiler.start');
  log('CPU profiling started (100μs sampling)');
}

async function stopCPUProfile(cdp: CDPSession): Promise<object> {
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.send('Profiler.disable');
  log(`CPU profile captured: ${(profile as { nodes: unknown[] }).nodes.length} nodes`);
  return profile;
}

async function startTracing(cdp: CDPSession): Promise<void> {
  await cdp.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'v8.execute',
      'blink.user_timing',
      'blink.console',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'disabled-by-default-v8.cpu_profiler',
    ].join(','),
    options: 'sampling-frequency=10000', // 10kHz sampling
  });
  log('Performance tracing started');
}

async function stopTracing(cdp: CDPSession): Promise<object[]> {
  const events: object[] = [];

  return new Promise((resolve) => {
    cdp.on('Tracing.dataCollected', (params: { value: object[] }) => {
      events.push(...params.value);
    });
    cdp.on('Tracing.tracingComplete', () => {
      log(`Trace captured: ${events.length} events`);
      resolve(events);
    });
    void cdp.send('Tracing.end');
  });
}

// ─── Performance Metrics ─────────────────────────────────────────────

async function capturePerformanceMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics } = await cdp.send('Performance.getMetrics') as {
    metrics: Array<{ name: string; value: number }>;
  };
  const result: Record<string, number> = {};
  for (const m of metrics) {
    result[m.name] = m.value;
  }
  return result;
}

// ─── User Flow Scenarios ─────────────────────────────────────────────

async function runUserFlows(page: Page): Promise<string[]> {
  const timings: string[] = [];

  async function timed(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    await fn();
    const dur = Date.now() - start;
    const entry = `${name}: ${dur}ms`;
    timings.push(entry);
    log(entry);
  }

  // Flow 1: Create a project
  await timed('Create project', async () => {
    const newProjectBtn = page.getByTestId('new-project-button');
    if (await newProjectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newProjectBtn.click();
    } else {
      const projectMenu = page.locator('button[aria-label^="Project menu for"]');
      await projectMenu.click();
      await page.getByRole('menuitem', { name: 'New Project' }).click();
    }
    const input = page.getByPlaceholder('My Feature');
    await input.fill('Perf Test Project');
    await input.press('Enter');
    await page.getByText('Perf Test Project').waitFor({ state: 'visible' });
  });

  // Flow 2: Navigate to Plan view
  await timed('Navigate to Plan view', async () => {
    await page.getByRole('button', { name: 'Plan' }).click();
    await page.getByTestId('canvas-viewport').waitFor({ state: 'visible' });
  });

  // Flow 3: Create multiple plan items
  for (let i = 1; i <= 10; i++) {
    await timed(`Create plan item #${i}`, async () => {
      await page.keyboard.press('Meta+Shift+I');
      const titleInput = page.getByPlaceholder('What needs to be done?');
      await titleInput.waitFor({ state: 'visible', timeout: 5000 });
      await titleInput.fill(`Task ${i} - Performance test item`);
      await titleInput.press('Enter');
      await page.getByRole('article', { name: `Task ${i} - Performance test item` })
        .waitFor({ state: 'visible' });
    });
  }

  // Flow 4: Switch view modes
  for (const mode of ['Board', 'Cards', 'Tree'] as const) {
    const titleMap = {
      Cards: 'Card view (spatial canvas)',
      Tree: 'Tree view (outline)',
      Board: 'Board view (kanban)',
    };
    await timed(`Switch to ${mode} view`, async () => {
      await page.locator(`button[title="${titleMap[mode]}"]`).click();
      await sleep(500);
    });
  }

  // Flow 5: Open edit modal
  await timed('Open edit modal', async () => {
    const card = page.getByRole('article', { name: 'Task 1 - Performance test item' });
    await card.getByRole('button', { name: 'Edit item' }).click();
    await page.getByText('Edit Task').waitFor({ state: 'visible' });
  });

  // Close modal
  await page.keyboard.press('Escape');
  await sleep(300);

  // Flow 6: Navigate to Workspace view
  await timed('Navigate to Workspace view', async () => {
    await page.getByRole('button', { name: 'Workspace' }).click();
    await sleep(500);
  });

  // Flow 7: Navigate back to Plan
  await timed('Navigate back to Plan view', async () => {
    await page.getByRole('button', { name: 'Plan' }).click();
    await page.getByTestId('canvas-viewport').waitFor({ state: 'visible' });
  });

  // Flow 8: Open command palette
  await timed('Open command palette', async () => {
    await page.keyboard.press('Meta+k');
    await sleep(500);
  });

  // Close command palette
  await page.keyboard.press('Escape');
  await sleep(300);

  return timings;
}

// ─── Analysis ────────────────────────────────────────────────────────

interface CpuNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
  children?: number[];
}

interface CpuProfile {
  nodes: CpuNode[];
  samples: number[];
  timeDeltas: number[];
}

function analyzeCPUProfile(profile: CpuProfile): string[] {
  const lines: string[] = [];
  lines.push('=== CPU Profile Analysis ===');
  lines.push(`Total nodes: ${profile.nodes.length}`);
  lines.push(`Total samples: ${profile.samples.length}`);

  const totalTime = profile.timeDeltas.reduce((a, b) => a + b, 0);
  lines.push(`Total time: ${(totalTime / 1000).toFixed(1)}ms`);

  // Find hottest functions by hit count
  const hotFunctions = profile.nodes
    .filter(n => (n.hitCount ?? 0) > 0 && n.callFrame.functionName)
    .sort((a, b) => (b.hitCount ?? 0) - (a.hitCount ?? 0))
    .slice(0, 25);

  lines.push('\nTop 25 hottest functions:');
  for (const fn of hotFunctions) {
    const url = fn.callFrame.url.replace(/.*\//, '');
    const name = fn.callFrame.functionName || '(anonymous)';
    const pct = ((fn.hitCount ?? 0) / profile.samples.length * 100).toFixed(1);
    lines.push(`  ${pct}%  ${name}  (${url}:${fn.callFrame.lineNumber})`);
  }

  return lines;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  ensureDir(PROFILE_DIR);
  log('Starting performance profiling session...\n');

  const { browser, page, process: electronProcess } = await launchApp();

  // Create CDP session for low-level profiling
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  // Capture initial metrics
  const metricsBefore = await capturePerformanceMetrics(cdp);

  // Start profiling
  await startCPUProfile(cdp);
  await startTracing(cdp);

  // Run user flows
  log('\n─── Running user flows ───');
  const timings = await runUserFlows(page);
  log('─── User flows complete ───\n');

  // Capture final metrics
  const metricsAfter = await capturePerformanceMetrics(cdp);

  // Stop profiling
  const cpuProfile = await stopCPUProfile(cdp);
  const traceEvents = await stopTracing(cdp);

  // Save files
  const cpuProfilePath = path.join(PROFILE_DIR, `cpu-profile-${timestamp}.cpuprofile`);
  const tracePath = path.join(PROFILE_DIR, `trace-${timestamp}.json`);
  const summaryPath = path.join(PROFILE_DIR, `summary-${timestamp}.txt`);

  fs.writeFileSync(cpuProfilePath, JSON.stringify(cpuProfile, null, 2));
  log(`Saved CPU profile: ${cpuProfilePath}`);

  fs.writeFileSync(tracePath, JSON.stringify(traceEvents));
  log(`Saved trace: ${tracePath}`);

  // Build summary
  const summary: string[] = [];
  summary.push(`Date: ${new Date().toISOString()}`);
  summary.push(`Timestamp: ${timestamp}`);
  summary.push('');

  summary.push('=== User Flow Timings ===');
  summary.push(...timings);
  summary.push('');

  summary.push('=== Key Metrics (before → after) ===');
  const interestingMetrics = [
    'JSHeapUsedSize', 'JSHeapTotalSize', 'Documents', 'Nodes', 'Frames',
    'LayoutCount', 'RecalcStyleCount', 'ScriptDuration', 'LayoutDuration',
    'RecalcStyleDuration', 'TaskDuration',
  ];
  for (const metric of interestingMetrics) {
    const before = metricsBefore[metric];
    const after = metricsAfter[metric];
    if (before !== undefined && after !== undefined) {
      const isBytes = metric.includes('Size');
      const fmt = (v: number) => isBytes ? `${(v / 1024 / 1024).toFixed(1)}MB` : `${v.toFixed(2)}`;
      summary.push(`  ${metric}: ${fmt(before)} → ${fmt(after)}`);
    }
  }
  summary.push('');

  // CPU profile analysis
  summary.push(...analyzeCPUProfile(cpuProfile as CpuProfile));

  const summaryText = summary.join('\n');
  fs.writeFileSync(summaryPath, summaryText);
  log(`Saved summary: ${summaryPath}`);

  // Print summary
  console.log('\n' + summaryText);

  // Cleanup
  log('\nCleaning up...');
  await browser.close();
  electronProcess.kill();

  log('\nDone! Open the profiles in:');
  log(`  CPU profile → speedscope.app or Chrome DevTools`);
  log(`  Trace → chrome://tracing or speedscope.app`);
  log(`  Files in: ${PROFILE_DIR}`);
}

main().catch(err => {
  console.error('Profiling failed:', err);
  process.exit(1);
});
