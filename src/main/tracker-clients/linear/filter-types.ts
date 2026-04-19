/**
 * Linear-native filter shape. Stored as `JSON.stringify(filter)` in the
 * `tracker_associations.jql_filter` TEXT column (name is misleading — it's the
 * tracker-native filter string for whichever client owns the association).
 *
 * The LinearClient parses this into Linear's GraphQL IssueFilter at query time.
 */
export interface LinearFilter {
  /** Team key, e.g. "ENG". Required — Linear filters are scoped to a team. */
  teamKey: string;
  /** Workflow state IDs to include. When omitted, all states match. */
  stateIds?: string[];
  /** Label IDs the issue must have at least one of. */
  labelIds?: string[];
  /** Linear Project UUID — our "epic" proxy. */
  projectId?: string;
  /** Filter to issues whose parent has this identifier ("ENG-123"). */
  parentIdentifier?: string;
  /** Full-text match against title/description. */
  searchTerm?: string;
}

/**
 * GraphQL filter input for the `issues` query. We treat this as a loosely-typed
 * JSON object — Linear's schema is the source of truth at query time. We only
 * enumerate the fields we actually produce here.
 */
export interface LinearIssueFilterInput {
  team?: { key: { eq: string } };
  state?: { id: { in: string[] } };
  labels?: { id: { in: string[] } };
  project?: { id: { eq: string } };
  parent?: LinearIssueFilterInput;
  or?: LinearIssueFilterInput[];
  and?: LinearIssueFilterInput[];
  title?: { containsIgnoreCase: string };
  number?: { eq: number };
}

/** Parse the serialized filter. Throws if invalid JSON or missing teamKey. */
export function parseLinearFilter(serialized: string): LinearFilter {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (e) {
    throw new Error(`Invalid Linear filter (not valid JSON): ${(e as Error).message}`, { cause: e });
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid Linear filter: expected an object');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.teamKey !== 'string' || obj.teamKey.length === 0) {
    throw new Error('Invalid Linear filter: "teamKey" is required');
  }
}

export function stringifyLinearFilter(filter: LinearFilter): string {
  return JSON.stringify(filter);
}

/**
 * Convert a parsed LinearFilter into a GraphQL IssueFilter input.
 */
export function buildLinearIssueFilter(filter: LinearFilter): LinearIssueFilterInput {
  const input: LinearIssueFilterInput = {
    team: { key: { eq: filter.teamKey } },
  };
  if (filter.stateIds?.length) {
    input.state = { id: { in: filter.stateIds } };
  }
  if (filter.labelIds?.length) {
    input.labels = { id: { in: filter.labelIds } };
  }
  if (filter.projectId) {
    input.project = { id: { eq: filter.projectId } };
  }
  if (filter.searchTerm) {
    input.title = { containsIgnoreCase: filter.searchTerm };
  }
  return input;
}

/**
 * Build an `or` filter for a batch of parent identifiers. Used by
 * fetchChildrenByParents — Linear's parent filter can't match by identifier
 * directly, so we decompose each identifier into team-key + issue-number
 * and OR the combinations at the top level.
 */
export function buildParentIdentifierFilter(parentIdentifiers: string[]): LinearIssueFilterInput {
  const clauses: LinearIssueFilterInput[] = [];
  const identifierPattern = /^([A-Z][A-Z0-9_]*)-(\d+)$/;
  for (const id of parentIdentifiers) {
    const match = identifierPattern.exec(id);
    if (!match) continue;
    clauses.push({
      parent: {
        team: { key: { eq: match[1] } },
        number: { eq: Number(match[2]) },
      },
    });
  }
  if (clauses.length === 0) {
    return { number: { eq: -1 } };
  }
  return { or: clauses };
}
