
// Linear's six state types collapse to Jira's three category keys via
// `linearStateTypeToJiraCategoryKey`, so both trackers share this table.
const CATEGORY_TO_BUCKET: Record<StatusCategory, string[]> = {
  not_started: ['new'],
  in_progress: ['indeterminate'],
  in_review: ['indeterminate'],
  blocked: ['indeterminate'],
  done: ['done'],
  canceled: ['done'],
};

const DEFAULT_CATEGORY_FOR_BUCKET: Record<string, StatusCategory> = {
  new: 'not_started',
  indeterminate: 'in_progress',
  done: 'done',
};

// Tier 2 — convention catalog. Used ONLY at setup time to pre-fill the
// `indeterminate`/`done` bucket sub-states. Never consulted at runtime.
// Order matters: most-specific keyword first.
const CATEGORY_KEYWORDS: Record<StatusCategory, string[]> = {
  not_started: ['backlog', 'todo', 'to do', 'triage', 'open'],
  in_progress: ['in progress', 'progress', 'doing', 'started', 'active', 'wip'],
  in_review: ['in review', 'review', 'code review', 'pr review', 'qa'],
  blocked: ['blocked', 'on hold', 'waiting', 'impediment', 'stuck'],
  done: ['done', 'complete', 'completed', 'closed', 'resolved', 'shipped'],
  canceled: ['canceled', 'cancelled', 'won\'t do', 'wontdo', 'duplicate', 'invalid'],
};

  /** Suggested mapping. Only includes categories where a deterministic-or-principled match was found. */
  mapping: StatusMapping;
  /** Per-category provenance — useful for showing "auto" badges in the UI. */
  source: Partial<Record<StatusCategory, 'name-exact' | 'sole-in-bucket' | 'keyword'>>;
}

const ALL_CATEGORIES: StatusCategory[] = [
  'not_started',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'canceled',
];

function normalize(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Suggest a status mapping from a tracker's available states.
 *
 * Rules, applied in order per category. The first match wins; everything else
 * is left empty so the user makes the call:
 *
 *    e.g. `in_progress` matches a state literally named "In Progress".
 * 2. Convention keyword match — pre-fill from a catalog of common names
 *    ("review", "blocked", "waiting"). Used as a starting point the user
 *    reviews before save. Not a runtime fallback.
 * 3. Sole occupant of the bucket — if only one state belongs to an
 *    expected tracker bucket and no name signal claimed it, assign it to
 *
 * Categories that don't match any rule are omitted from the result so the
 * existing mapping (if any) isn't overwritten with empty values.
 */
export function suggestStatusMapping(
): SuggestionResult {
  const mapping: StatusMapping = {};
  const source: SuggestionResult['source'] = {};

  // Group states by their bucket (categoryKey: 'new' | 'indeterminate' | 'done').
  for (const state of availableStates) {
    const bucket = state.categoryKey.toLowerCase();
    const list = byBucket.get(bucket) ?? [];
    list.push(state);
    byBucket.set(bucket, list);
  }

  // Track which state names we've already claimed so two categories don't
  // both grab the same state via different rules.
  const claimed = new Set<string>();
  const claim = (name: string): boolean => {
    const key = normalize(name);
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  };

  const categoryLabels: Record<StatusCategory, string> = {
    not_started: 'not started',
    in_progress: 'in progress',
    in_review: 'in review',
    blocked: 'blocked',
    done: 'done',
    canceled: 'canceled',
  };

  // Pass 1: exact name match on the canonical category label.
  for (const category of ALL_CATEGORIES) {
    const buckets = CATEGORY_TO_BUCKET[category];
    const candidates = buckets.flatMap((b) => byBucket.get(b) ?? []);
    const label = categoryLabels[category];
    const exact = candidates.find((s) => normalize(s.name) === label);
    if (exact && claim(exact.name)) {
      mapping[category] = exact.name;
      source[category] = 'name-exact';
    }
  }

  // Pass 2: convention keyword match. Pre-fill the started/indeterminate
  // sub-states (in_progress/in_review/blocked) and the canceled distinction
  // from common naming conventions. The user sees the pre-fill and can edit
  // before save — this is not a runtime fallback.
  for (const category of ALL_CATEGORIES) {
    if (mapping[category]) continue;
    const buckets = CATEGORY_TO_BUCKET[category];
    const candidates = buckets.flatMap((b) => byBucket.get(b) ?? []);
    const keywords = CATEGORY_KEYWORDS[category];
    for (const keyword of keywords) {
      const match = candidates.find((s) => {
        if (claimed.has(normalize(s.name))) return false;
        return normalize(s.name).includes(keyword);
      });
      if (match && claim(match.name)) {
        mapping[category] = match.name;
        source[category] = 'keyword';
        break;
      }
    }
  }

  // Pass 3: sole-occupant fallback. Only default categories can claim a
  // single-state bucket, so a lone "QA" maps to in_review by keyword instead
  // of being taken by in_progress purely because it appears earlier.
  for (const category of ALL_CATEGORIES) {
    if (mapping[category]) continue;
    const buckets = CATEGORY_TO_BUCKET[category];
    const isDefaultForBucket = buckets.some((bucket) => DEFAULT_CATEGORY_FOR_BUCKET[bucket] === category);
    if (!isDefaultForBucket) continue;
    const candidates = buckets.flatMap((b) => byBucket.get(b) ?? []);
    if (candidates.length === 1 && claim(candidates[0].name)) {
      mapping[category] = candidates[0].name;
      source[category] = 'sole-in-bucket';
    }
  }

  return { mapping, source };
}
