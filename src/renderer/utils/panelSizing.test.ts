import { describe, it, expect } from 'vitest';
import { clampWidth, getViewportBoundedMax, resolvePanelMax } from './panelSizing';
import { PANEL_SIZES } from '../constants/layout';

describe('clampWidth', () => {
  it('clamps below min up to min', () => {
    expect(clampWidth(100, 240, 480)).toBe(240);
  });

  it('clamps above max down to max', () => {
    expect(clampWidth(900, 240, 480)).toBe(480);
  });

  it('passes through values within range', () => {
    expect(clampWidth(300, 240, 480)).toBe(300);
  });
});

describe('getViewportBoundedMax', () => {
  it('falls back to hardMax when no viewportWidth is available', () => {
    expect(
      getViewportBoundedMax({ min: 280, hardMax: 1600, viewportFraction: 0.75 })
    ).toBe(1600);
  });

  it('bounds by an explicit viewportWidth (container-bounded strategy)', () => {
    const max = getViewportBoundedMax({
      min: 320,
      hardMax: 1600,
      viewportFraction: 0.75,
      remainingMinWidth: 480,
      viewportWidth: 1000,
    });
    expect(max).toBe(520);
  });

  it('subtracts reservedWidth before applying remainingMinWidth (window-bounded strategy)', () => {
    const max = getViewportBoundedMax({
      min: 280,
      hardMax: 1600,
      viewportFraction: 0.75,
      reservedWidth: 240,
      remainingMinWidth: 480,
      viewportWidth: 1200,
    });
    expect(max).toBe(480);
  });

  it('ignores remainingMinWidth entirely when it is 0', () => {
    const max = getViewportBoundedMax({
      min: 280,
      hardMax: 1600,
      viewportFraction: 0.75,
      viewportWidth: 1200,
    });
    expect(max).toBe(900);
  });

  it('never returns below min even when the viewport is very small', () => {
    const max = getViewportBoundedMax({
      min: 320,
      hardMax: 1600,
      viewportFraction: 0.75,
      remainingMinWidth: 480,
      viewportWidth: 400,
    });
    expect(max).toBe(320);
  });
});

describe('resolvePanelMax', () => {
  it('sidebar has a fixed max unaffected by viewport width', () => {
    expect(resolvePanelMax(PANEL_SIZES.sidebar, { viewportWidth: 300 })).toBe(480);
    expect(resolvePanelMax(PANEL_SIZES.sidebar, { viewportWidth: 4000 })).toBe(480);
  });

  it('planningChat max is bounded by the window and shrinks as sidebar width is reserved', () => {
    const max = resolvePanelMax(PANEL_SIZES.planningChat, {
      viewportWidth: 1200,
      reservedWidth: 240,
    });
    expect(max).toBe(480);
  });

  it('planningChat max never drops below its own min', () => {
    const max = resolvePanelMax(PANEL_SIZES.planningChat, {
      viewportWidth: 700,
      reservedWidth: 480,
    });
    expect(max).toBe(PANEL_SIZES.planningChat.min);
  });

  it('workspaceChat max is bounded by the available container width', () => {
    const max = resolvePanelMax(PANEL_SIZES.workspaceChat, { viewportWidth: 1000 });
    expect(max).toBe(520);
  });

  it('workspaceChat and planningChat preserve their own distinct min/default values', () => {
    expect(PANEL_SIZES.planningChat.min).toBe(280);
    expect(PANEL_SIZES.planningChat.default).toBe(384);
    expect(PANEL_SIZES.workspaceChat.min).toBe(320);
    expect(PANEL_SIZES.workspaceChat.default).toBe(420);
  });
});
