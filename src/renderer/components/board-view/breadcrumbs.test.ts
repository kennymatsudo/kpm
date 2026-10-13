import { describe, expect, it } from 'vitest';
import type { PlanItem } from '../../../shared/types';
import { buildBreadcrumb, buildColumnBreadcrumbs, EMPTY_BREADCRUMB } from './breadcrumbs';

const item = (id: string, parent_id: string | null, title = id, external_key: string | null = null) =>
  ({ id, parent_id, title, external_key }) as PlanItem;

const parentMapOf = (...items: PlanItem[]) => new Map(items.map((i) => [i.id, i]));

describe('buildBreadcrumb', () => {
  it('returns the shared empty array when there are no ancestors', () => {
    expect(buildBreadcrumb(item('a', null), parentMapOf())).toBe(EMPTY_BREADCRUMB);
    expect(buildBreadcrumb(item('a', 'missing'), parentMapOf())).toBe(EMPTY_BREADCRUMB);
  });

  it('lists ancestors outermost first and caps at three', () => {
    const chain = [item('p4', null), item('p3', 'p4'), item('p2', 'p3'), item('p1', 'p2', 'P1', 'K-1')];
    const crumbs = buildBreadcrumb(item('leaf', 'p1'), parentMapOf(...chain));
    expect(crumbs.map((c) => c.title)).toEqual(['p3', 'p2', 'P1']);
    expect(crumbs[2].externalKey).toBe('K-1');
  });
});

describe('buildColumnBreadcrumbs', () => {
  it('reuses the previous array while the crumbs are unchanged', () => {
    const leaf = item('leaf', 'p');
    const first = buildColumnBreadcrumbs([{ item: leaf }], parentMapOf(item('p', null, 'Parent')), new Map());
    const second = buildColumnBreadcrumbs([{ item: leaf }], parentMapOf(item('p', null, 'Parent')), first);
    expect(second.get('leaf')).toBe(first.get('leaf'));
  });

  it('builds a new array when an ancestor title changes', () => {
    const leaf = item('leaf', 'p');
    const first = buildColumnBreadcrumbs([{ item: leaf }], parentMapOf(item('p', null, 'Old')), new Map());
    const second = buildColumnBreadcrumbs([{ item: leaf }], parentMapOf(item('p', null, 'New')), first);
    expect(second.get('leaf')).not.toBe(first.get('leaf'));
    expect(second.get('leaf')?.[0].title).toBe('New');
  });
});
