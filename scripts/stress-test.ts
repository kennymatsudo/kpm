/**
 *
 * Creates items in batches (10, 25, 50, 75, 100) and measures key operations
 * at each threshold to identify where performance starts to degrade.
 *
 * Usage:
 *   npx tsx scripts/stress-test.ts
 *   npx tsx scripts/stress-test.ts --items=200    # Custom max items
 *
 * Output (in scripts/profiles/):
 *   - stress-test-<timestamp>.txt    (human-readable results)
 *   - stress-cpu-<timestamp>.cpuprofile  (CPU profile of full run)
 */

import { chromium } from 'playwright';
import type { Browser, Page, CDPSession } from 'playwright';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CDP_PORT = 9223;
const PROFILE_DIR = path.join(__dirname, 'profiles');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

// Parse --items=N argument
const maxItems = (() => {
  const arg = process.argv.find(a => a.startsWith('--items='));
  return arg ? parseInt(arg.split('=')[1], 10) : 100;
})();

const CHECKPOINTS = [10, 25, 50, 75, 100].filter(n => n <= maxItems);
if (CHECKPOINTS[CHECKPOINTS.length - 1] !== maxItems) {
  CHECKPOINTS.push(maxItems);
}

function log(msg: string): void {
  console.log(`[Stress] ${msg}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── App Launch (same as profile.ts) ─────────────────────────────────

async function launchApp(): Promise<{ browser: Browser; page: Page; process: ChildProcess }> {
  const testDataPath = path.join(os.tmpdir(), 'kpm-stress-test');

  if (fs.existsSync(testDataPath)) {
    fs.rmSync(testDataPath, { recursive: true });
  }
  fs.mkdirSync(testDataPath, { recursive: true });

  const latestBuild = findLatestBuild('release');
  const appInfo = parseElectronApp(latestBuild);

  log(`Launching: ${appInfo.executable}`);

  try {
    const { execSync } = await import('child_process');
    execSync(`lsof -ti:${CDP_PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
  } catch { /* ignore */ }

  const electronProcess = spawn(
    appInfo.executable,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${testDataPath}`,
      '--js-flags=--expose-gc',
    ],
    {
      env: { ...process.env, NODE_ENV: 'test', KPM_PERF: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for DevTools')), 30000);
    const check = (data: Buffer) => {
      if (data.toString().includes('DevTools listening')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    electronProcess.stdout?.on('data', check);
    electronProcess.stderr?.on('data', check);
    electronProcess.on('error', err => { clearTimeout(timeout); reject(err); });
  });

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
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 15000, state: 'attached' });

  await sleep(1000);
  const dismissBtn = page.getByRole('button', { name: 'Dismiss' });
  if (await dismissBtn.count() > 0) {
    await dismissBtn.click();
    await sleep(500);
  }

  log('App is ready');
  return { browser, page, process: electronProcess };
}

// ─── Measurement Helpers ─────────────────────────────────────────────

interface Measurement {
  operation: string;
  durationMs: number;
}

async function measure(name: string, fn: () => Promise<void>): Promise<Measurement> {
  const start = performance.now();
  await fn();
  const durationMs = Math.round(performance.now() - start);
  return { operation: name, durationMs };
}

async function getMemoryUsage(cdp: CDPSession): Promise<{ heapUsedMB: number; heapTotalMB: number; domNodes: number }> {
  const { metrics } = await cdp.send('Performance.getMetrics') as {
    metrics: Array<{ name: string; value: number }>;
  };
  const get = (name: string) => metrics.find(m => m.name === name)?.value ?? 0;
  return {
    heapUsedMB: Math.round(get('JSHeapUsedSize') / 1024 / 1024 * 10) / 10,
    heapTotalMB: Math.round(get('JSHeapTotalSize') / 1024 / 1024 * 10) / 10,
    domNodes: get('Nodes'),
  };
}

async function getLayoutMetrics(cdp: CDPSession): Promise<{ layouts: number; recalcStyles: number }> {
  const { metrics } = await cdp.send('Performance.getMetrics') as {
    metrics: Array<{ name: string; value: number }>;
  };
  const get = (name: string) => metrics.find(m => m.name === name)?.value ?? 0;
  return {
    layouts: get('LayoutCount'),
    recalcStyles: get('RecalcStyleCount'),
  };
}

// ─── Benchmark Operations ────────────────────────────────────────────

async function benchmarkAtCheckpoint(page: Page, cdp: CDPSession, itemCount: number): Promise<{
  itemCount: number;
  measurements: Measurement[];
  memory: { heapUsedMB: number; heapTotalMB: number; domNodes: number };
  layoutMetrics: { layouts: number; recalcStyles: number };
}> {
  const measurements: Measurement[] = [];

  // Ensure we're on Cards view
  const cardsBtn = page.locator('button[title="Card view (spatial canvas)"]');
  if (await cardsBtn.isVisible().catch(() => false)) {
    await cardsBtn.click();
    await sleep(100);
  }

  // Benchmark: Switch to Tree view
  measurements.push(await measure('Switch to Tree view', async () => {
    await page.locator('button[title="Tree view (outline)"]').click();
    // Wait for the view to actually render — look for tree-specific content
    await sleep(50);
    await page.waitForLoadState('networkidle');
  }));

  // Benchmark: Switch to Board view
  measurements.push(await measure('Switch to Board view', async () => {
    await page.locator('button[title="Board view (kanban)"]').click();
    await sleep(50);
    await page.waitForLoadState('networkidle');
  }));

  // Benchmark: Switch back to Cards view
  measurements.push(await measure('Switch to Cards view', async () => {
    await page.locator('button[title="Card view (spatial canvas)"]').click();
    await sleep(50);
    await page.waitForLoadState('networkidle');
  }));

  // Benchmark: Open and close edit modal
  const firstCard = page.getByRole('article').first();
  if (await firstCard.isVisible().catch(() => false)) {
    measurements.push(await measure('Open edit modal', async () => {
      await firstCard.getByRole('button', { name: 'Edit item' }).click();
      await page.getByText('Edit Task').waitFor({ state: 'visible', timeout: 5000 });
    }));

    measurements.push(await measure('Close edit modal', async () => {
      await page.keyboard.press('Escape');
      await sleep(50);
    }));
  }

  // Benchmark: Navigate to Workspace and back
  measurements.push(await measure('Navigate to Workspace', async () => {
    await page.getByRole('button', { name: 'Workspace' }).click();
    await sleep(50);
    await page.waitForLoadState('networkidle');
  }));

  measurements.push(await measure('Navigate back to Plan', async () => {
    await page.getByRole('button', { name: 'Plan' }).click();
    await page.getByTestId('canvas-viewport').waitFor({ state: 'visible' });
  }));

  // Benchmark: Open command palette
  measurements.push(await measure('Open command palette', async () => {
    await page.keyboard.press('Meta+k');
    await sleep(50);
  }));

  // Type in command palette to test search
  measurements.push(await measure('Search in command palette', async () => {
    await page.keyboard.type('Task 1', { delay: 20 });
    await sleep(100);
  }));

  await page.keyboard.press('Escape');
  await sleep(100);

  // Capture metrics
  const memory = await getMemoryUsage(cdp);
  const layoutMetrics = await getLayoutMetrics(cdp);

  return { itemCount, measurements, memory, layoutMetrics };
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  log(`Stress test: creating up to ${maxItems} items, checkpoints at [${CHECKPOINTS.join(', ')}]\n`);

  const { browser, page, process: electronProcess } = await launchApp();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  // Start CPU profiling for the entire run
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');

  // Create project
  const newProjectBtn = page.getByTestId('new-project-button');
  if (await newProjectBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newProjectBtn.click();
  } else {
    const projectMenu = page.locator('button[aria-label^="Project menu for"]');
    await projectMenu.click();
    await page.getByRole('menuitem', { name: 'New Project' }).click();
  }
  const input = page.getByPlaceholder('My Feature');
  await input.fill('Stress Test Project');
  await input.press('Enter');
  await page.getByText('Stress Test Project').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Plan' }).click();
  await page.getByTestId('canvas-viewport').waitFor({ state: 'visible' });

  log('Project created, starting item creation...\n');

  const allResults: Array<{
    itemCount: number;
    measurements: Measurement[];
    memory: { heapUsedMB: number; heapTotalMB: number; domNodes: number };
    layoutMetrics: { layouts: number; recalcStyles: number };
    createAvgMs: number;
  }> = [];

  let itemsCreated = 0;
  let prevCheckpoint = 0;

  for (const checkpoint of CHECKPOINTS) {
    const batchSize = checkpoint - prevCheckpoint;
    const createTimes: number[] = [];

    // Create items up to this checkpoint
    for (let i = 0; i < batchSize; i++) {
      itemsCreated++;
      const m = await measure(`Create item #${itemsCreated}`, async () => {
        await page.keyboard.press('Meta+Shift+I');
        const titleInput = page.getByPlaceholder('What needs to be done?');
        await titleInput.waitFor({ state: 'visible', timeout: 5000 });
        await titleInput.fill(`Task ${itemsCreated}`);
        await titleInput.press('Enter');
        // Wait for the item to appear
        await page.getByRole('article', { name: `Task ${itemsCreated}` })
          .waitFor({ state: 'visible', timeout: 5000 });
      });
      createTimes.push(m.durationMs);
    }

    const createAvg = Math.round(createTimes.reduce((a, b) => a + b, 0) / createTimes.length);
    log(`Created ${checkpoint} items (batch avg: ${createAvg}ms/item)`);

    // Run benchmarks at this checkpoint
    log(`Benchmarking at ${checkpoint} items...`);
    const result = await benchmarkAtCheckpoint(page, cdp, checkpoint);

    allResults.push({ ...result, createAvgMs: createAvg });

    // Print checkpoint results
    for (const m of result.measurements) {
      log(`  ${m.operation}: ${m.durationMs}ms`);
    }
    log(`  Memory: ${result.memory.heapUsedMB}MB used / ${result.memory.heapTotalMB}MB total`);
    log(`  DOM Nodes: ${result.memory.domNodes}`);
    log('');

    prevCheckpoint = checkpoint;
  }

  // Stop CPU profiling
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.send('Profiler.disable');

  // Save CPU profile
  const cpuPath = path.join(PROFILE_DIR, `stress-cpu-${timestamp}.cpuprofile`);
  fs.writeFileSync(cpuPath, JSON.stringify(profile, null, 2));
  log(`Saved CPU profile: ${cpuPath}`);

  // ─── Build Report ──────────────────────────────────────────────────

  const lines: string[] = [];
  lines.push('╔══════════════════════════════════════════════════════════════════╗');
  lines.push('╚══════════════════════════════════════════════════════════════════╝');
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push(`Max items: ${maxItems}`);
  lines.push('');

  // Table: Item creation speed
  lines.push('┌─────────────────────────────────────────────────────────────────┐');
  lines.push('│ Item Creation Speed (avg ms per item)                          │');
  lines.push('├──────────┬──────────────────────────────────────────────────────┤');
  lines.push('│  Items   │  Avg Create Time                                    │');
  lines.push('├──────────┼──────────────────────────────────────────────────────┤');
  for (const r of allResults) {
    const bar = '█'.repeat(Math.min(Math.round(r.createAvgMs / 5), 40));
    lines.push(`│  ${String(r.itemCount).padStart(5)}   │  ${String(r.createAvgMs).padStart(4)}ms ${bar.padEnd(44)} │`);
  }
  lines.push('└──────────┴──────────────────────────────────────────────────────┘');
  lines.push('');

  // Table: Operation times at each checkpoint
  if (allResults.length > 0) {
    const ops = allResults[0].measurements.map(m => m.operation);

    lines.push('┌─────────────────────────────────────────────────────────────────┐');
    lines.push('│ Operation Timing by Item Count (ms)                            │');
    lines.push('├────────────────────────────┬────────────────────────────────────┤');

    const header = '│ Operation                  │ ' +
      allResults.map(r => String(r.itemCount).padStart(5)).join('  ') +
      '  │';
    lines.push(header);
    lines.push('├────────────────────────────┼────────────────────────────────────┤');

    for (const op of ops) {
      const values = allResults.map(r => {
        const m = r.measurements.find(x => x.operation === op);
        return m ? String(m.durationMs).padStart(5) : '    -';
      });
      const name = op.padEnd(26).slice(0, 26);
      lines.push(`│ ${name} │ ${values.join('  ')}  │`);
    }

    lines.push('└────────────────────────────┴────────────────────────────────────┘');
    lines.push('');
  }

  // Table: Memory & DOM growth
  lines.push('┌─────────────────────────────────────────────────────────────────┐');
  lines.push('│ Memory & DOM Growth                                            │');
  lines.push('├──────────┬───────────┬────────────┬────────────────────────────┤');
  lines.push('│  Items   │ Heap Used │ Heap Total │ DOM Nodes                  │');
  lines.push('├──────────┼───────────┼────────────┼────────────────────────────┤');
  for (const r of allResults) {
    lines.push(
      `│  ${String(r.itemCount).padStart(5)}   │ ${String(r.memory.heapUsedMB + 'MB').padStart(8)}  │ ${String(r.memory.heapTotalMB + 'MB').padStart(9)}  │ ${String(r.memory.domNodes).padStart(6).padEnd(26)} │`
    );
  }
  lines.push('└──────────┴───────────┴────────────┴────────────────────────────┘');
  lines.push('');

  // Scaling analysis
  lines.push('─── Scaling Analysis ───');
  if (allResults.length >= 2) {
    const first = allResults[0];
    const last = allResults[allResults.length - 1];
    const itemRatio = last.itemCount / first.itemCount;

    lines.push(`Item count growth: ${first.itemCount} → ${last.itemCount} (${itemRatio.toFixed(1)}x)`);
    lines.push(`Create time growth: ${first.createAvgMs}ms → ${last.createAvgMs}ms (${(last.createAvgMs / first.createAvgMs).toFixed(1)}x)`);
    lines.push(`Heap growth: ${first.memory.heapUsedMB}MB → ${last.memory.heapUsedMB}MB (${(last.memory.heapUsedMB / first.memory.heapUsedMB).toFixed(1)}x)`);
    lines.push(`DOM node growth: ${first.memory.domNodes} → ${last.memory.domNodes} (${(last.memory.domNodes / first.memory.domNodes).toFixed(1)}x)`);

    // Check for super-linear scaling (> 2x growth per 2x items is concerning)
    const ops = first.measurements.map(m => m.operation);
    const degraded: string[] = [];
    for (const op of ops) {
      const firstTime = first.measurements.find(m => m.operation === op)?.durationMs ?? 0;
      const lastTime = last.measurements.find(m => m.operation === op)?.durationMs ?? 0;
      if (firstTime > 0 && lastTime > 0) {
        const timeRatio = lastTime / firstTime;
        if (timeRatio > itemRatio * 0.75) {
          degraded.push(`  ⚠ ${op}: ${firstTime}ms → ${lastTime}ms (${timeRatio.toFixed(1)}x — scales worse than linear)`);
        }
      }
    }

    if (degraded.length > 0) {
      lines.push('\nOperations with concerning scaling:');
      lines.push(...degraded);
    } else {
      lines.push('\nAll operations scale well relative to item count growth.');
    }
  }

  const report = lines.join('\n');

  const reportPath = path.join(PROFILE_DIR, `stress-test-${timestamp}.txt`);
  fs.writeFileSync(reportPath, report);

  console.log('\n' + report);
  log(`\nReport saved: ${reportPath}`);
  log(`CPU profile: ${cpuPath}`);

  // Cleanup
  await browser.close();
  electronProcess.kill();
}

main().catch(err => {
  console.error('Stress test failed:', err);
  process.exit(1);
});
