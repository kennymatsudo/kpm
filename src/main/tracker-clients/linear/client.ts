import { GraphQLClient, gql } from 'graphql-request';
import type {
  TrackerClient,
  ExternalIssue,
  LinearCredentials,
  JiraIssueType,
  JiraTransition,
  CreateIssueParams,
  CreatedIssue,
  UpdateIssueParams,
} from '../common/types';
import { TrackerError } from '../common/errors';
import { linearMarkdownCodec } from '../../documents';
import {
  buildLinearIssueFilter,
  buildParentIdentifierFilter,
  parseLinearFilter,
  type LinearIssueFilterInput,
} from './filter-types';

const LINEAR_ENDPOINT = 'https://api.linear.app/graphql';
const PAGE_SIZE = 50;
const TEAM_PAGE_SIZE = 250;

const ISSUE_FIELDS = gql`
  fragment IssueFields on Issue {
    id
    identifier
    number
    title
    description
    url
    updatedAt
    state {
      id
      name
      type
    }
    team {
      id
      key
    }
    parent {
      identifier
    }
    project {
      id
    }
    assignee {
      id
      name
      displayName
      avatarUrl
    }
    creator {
      id
      name
      displayName
      avatarUrl
    }
    labels {
      nodes {
        id
        name
      }
    }
  }
`;

interface LinearPerson {
  id: string;
  name?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface LinearIssue {
  id: string;
  identifier: string;
  number: number;
  title: string;
  description: string | null;
  url: string;
  updatedAt: string;
  state?: { id: string; name: string; type: string };
  team?: { id: string; key: string };
  parent?: { identifier: string } | null;
  project?: { id: string } | null;
  assignee?: LinearPerson | null;
  creator?: LinearPerson | null;
  labels?: { nodes: { id: string; name: string }[] };
}

interface PageInfo { hasNextPage: boolean; endCursor: string | null }
interface Connection<T> { nodes: T[]; pageInfo: PageInfo }
type IssueConnection = Connection<LinearIssue>;
interface LinearTeam { key: string; name: string }
interface LinearProject { id: string; name: string }

export class LinearClient implements TrackerClient {
  readonly type = 'linear' as const;
  readonly documentCodec = linearMarkdownCodec;
  private client: GraphQLClient;

  constructor(credentials: LinearCredentials) {
    this.client = new GraphQLClient(LINEAR_ENDPOINT, {
      headers: { Authorization: credentials.apiToken },
    });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.request<{ viewer: { id: string } }>(gql`query { viewer { id } }`);
      return { success: true };
    } catch (e) {
      return { success: false, error: toErrorMessage(e) };
    }
  }

  async getAvailableProjects(): Promise<{ key: string; name: string }[]> {
    try {
      return this.collectPages<LinearTeam>(async (cursor) => {
        const data = await this.client.request<{ teams: Connection<LinearTeam> }>(
          gql`
            query ListTeams($first: Int!, $after: String) {
              teams(first: $first, after: $after) {
                nodes { key name }
                pageInfo { hasNextPage endCursor }
              }
            }
          `,
          { first: TEAM_PAGE_SIZE, after: cursor }
        );
        return data.teams;
      });
    } catch (e) {
      throw linearError(e);
    }
  }

  async *fetchIssues(projectKey: string): AsyncGenerator<ExternalIssue> {
    yield* this.queryIssues({ team: { key: { eq: projectKey } } });
  }

  /**
   * For Linear, `filter` is `JSON.stringify(LinearFilter)`. See filter-types.ts.
   * Empty string is tolerated and treated as an unfiltered fetch.
   */
  async *fetchIssuesByJql(filter: string): AsyncGenerator<ExternalIssue> {
    if (!filter || filter.trim() === '') {
      throw new Error('Linear requires a filter (team key at minimum)');
    }
    const parsed = parseLinearFilter(filter);
    yield* this.queryIssues(buildLinearIssueFilter(parsed));
  }

  async fetchIssue(issueKey: string): Promise<ExternalIssue> {
    try {
      // issueKey is an identifier like "ENG-123"; Linear's `issue(id:)` accepts identifiers.
      const data = await this.client.request<{ issue: LinearIssue }>(
        gql`
          ${ISSUE_FIELDS}
          query GetIssue($id: String!) {
            issue(id: $id) {
              ...IssueFields
            }
          }
        `,
        { id: issueKey }
      );
      return this.mapIssue(data.issue);
    } catch (e) {
      throw linearError(e);
    }
  }

  async searchIssues(projectKey: string, filter?: string): Promise<ExternalIssue[]> {
    // Honor a full serialized LinearFilter if provided; otherwise default to
    // every issue in the team.
    const input: LinearIssueFilterInput = filter
      ? buildLinearIssueFilter(parseLinearFilter(filter))
      : { team: { key: { eq: projectKey } } };
    const out: ExternalIssue[] = [];
    for await (const issue of this.queryIssues(input, 100)) {
      out.push(issue);
      if (out.length >= 100) break;
    }
    return out;
  }

  async fetchChildrenByParents(parentKeys: string[]): Promise<ExternalIssue[]> {
    if (parentKeys.length === 0) return [];
    const filter = buildParentIdentifierFilter(parentKeys);
    const out: ExternalIssue[] = [];
    for await (const issue of this.queryIssues(filter)) {
      out.push(issue);
    }
    return out;
  }

  formatCustomFieldsForApi(_values: Record<string, string>): Record<string, unknown> {
    // Linear has no custom field concept analogous to Jira. Labels/priority/assignee
    // are first-class fields and handled separately in the write path (Phase 2).
    return {};
  }

  /**
   * Linear doesn't have types in the Jira sense. Return a synthetic single type so
   * downstream code that expects a non-empty list can render selection UI if needed.
   * Templates are a richer analogue if we want to surface them later.
   */
  getIssueTypes(_projectKey: string): Promise<JiraIssueType[]> {
    return Promise.resolve([{ id: 'linear-issue', name: 'Issue', subtask: false }]);
  }

  /**
   * Synthesize one pseudo-transition per workflow state on the issue's team.
   * Matches the Jira signature so ExportService can treat both identically.
   */
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    try {
      const data = await this.client.request<{
        issue: { team: { states: { nodes: { id: string; name: string; type: string }[] } } };
      }>(
        gql`
          query TeamStates($id: String!) {
            issue(id: $id) {
              team { states { nodes { id name type } } }
            }
          }
        `,
        { id: issueKey }
      );
      return data.issue.team.states.nodes.map((state) => ({
        id: state.id,
        name: `Move to ${state.name}`,
        to: {
          id: state.id,
          name: state.name,
          statusCategory: {
            key: linearStateTypeToJiraCategoryKey(state.type),
            name: state.name,
          },
        },
      }));
    } catch (e) {
      throw linearError(e);
    }
  }

  async transitionIssue(issueKey: string, transitionId: string, _toDoneCategory?: boolean): Promise<void> {
    // `transitionId` is the target workflow-state UUID (see getTransitions).
    try {
      // Need the issue UUID to mutate — identifier works with issue(id:) for fetch,
      // but issueUpdate requires the UUID.
      const issue = await this.client.request<{ issue: { id: string } }>(
        gql`query GetIssueId($id: String!) { issue(id: $id) { id } }`,
        { id: issueKey }
      );
      const data = await this.client.request<{ issueUpdate: { success: boolean } }>(
        gql`
          mutation SetIssueState($id: String!, $stateId: String!) {
            issueUpdate(id: $id, input: { stateId: $stateId }) { success }
          }
        `,
        { id: issue.issue.id, stateId: transitionId }
      );
      if (!data.issueUpdate.success) {
        throw new Error('Linear state transition returned success=false');
      }
    } catch (e) {
      throw linearError(e);
    }
  }

  async createIssue(params: CreateIssueParams): Promise<CreatedIssue> {
    try {
      const team = await this.client.request<{ teams: { nodes: { id: string }[] } }>(
        gql`query TeamId($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }`,
        { key: params.projectKey }
      );
      const teamId = team.teams.nodes[0]?.id;
      if (!teamId) throw new Error(`Linear team "${params.projectKey}" not found`);

      const input: Record<string, unknown> = {
        teamId,
        title: params.summary,
      };
      const description = this.documentCodec.toExternal(params.description);
      if (description !== null) input.description = description;
      if (params.labels?.length) input.labelIds = params.labels; // Labels must be IDs, not names
      if (params.linearProjectId) input.projectId = params.linearProjectId;
      if (params.parentKey) {
        const parent = await this.client.request<{ issue: { id: string } }>(
          gql`query ParentId($id: String!) { issue(id: $id) { id } }`,
          { id: params.parentKey }
        );
        input.parentId = parent.issue.id;
      }

      const data = await this.client.request<{
        issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string } | null };
      }>(
        gql`
          mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) { success issue { id identifier url } }
          }
        `,
        { input }
      );
      if (!data.issueCreate.success || !data.issueCreate.issue) {
        throw new Error('Linear issueCreate returned success=false');
      }
      const created = data.issueCreate.issue;
      return { id: created.id, key: created.identifier, self: created.url };
    } catch (e) {
      throw linearError(e);
    }
  }

  async updateIssue(issueKey: string, params: UpdateIssueParams): Promise<void> {
    try {
      const issue = await this.client.request<{ issue: { id: string } }>(
        gql`query UpdateTargetId($id: String!) { issue(id: $id) { id } }`,
        { id: issueKey }
      );
      const input: Record<string, unknown> = {};
      if (params.summary !== undefined) input.title = params.summary;
      if (params.description !== undefined) {
        input.description = this.documentCodec.toExternal(params.description) ?? '';
      }
      if (params.labels !== undefined) input.labelIds = params.labels;

      const data = await this.client.request<{ issueUpdate: { success: boolean } }>(
        gql`
          mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
            issueUpdate(id: $id, input: $input) { success }
          }
        `,
        { id: issue.issue.id, input }
      );
      if (!data.issueUpdate.success) {
        throw new Error('Linear issueUpdate returned success=false');
      }
    } catch (e) {
      throw linearError(e);
    }
  }

  /**
   * Return Linear Projects accessible to a team. Linear "Projects" are our epic
   * proxy and are surfaced in the link form so users can scope an association
   * to a single project rather than the whole team.
   */
  async getProjectsForTeam(teamKey: string): Promise<{ id: string; name: string }[]> {
    try {
      return this.collectPages<LinearProject>(async (cursor) => {
        const data = await this.client.request<{
          teams: {
            nodes: {
              projects: {
                nodes: LinearProject[];
                pageInfo: PageInfo;
              };
            }[];
          };
        }>(
          gql`
            query TeamProjects($key: String!, $first: Int!, $after: String) {
              teams(filter: { key: { eq: $key } }) {
                nodes {
                  projects(first: $first, after: $after) {
                    nodes { id name }
                    pageInfo { hasNextPage endCursor }
                  }
                }
              }
            }
          `,
          // Linear's GraphQL complexity budget for nested connections caps the
          // page size — 50 keeps us well under the 10k limit.
          { key: teamKey, first: PAGE_SIZE, after: cursor }
        );
        const team = data.teams.nodes[0];
        return team?.projects ?? { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
      });
    } catch (e) {
      throw linearError(e);
    }
  }

  /**
   * Return workflow states for a team — used by the status-mapping UI.
   * Matches the Jira signature: `{ id, name, categoryKey }`.
   */
  async getProjectStatuses(projectKey: string): Promise<{ id: string; name: string; categoryKey: string }[]> {
    try {
      const data = await this.client.request<{
        teams: { nodes: { states: { nodes: { id: string; name: string; type: string }[] } }[] };
      }>(
        gql`
          query TeamStatesByKey($key: String!) {
            teams(filter: { key: { eq: $key } }) {
              nodes { states { nodes { id name type } } }
            }
          }
        `,
        { key: projectKey }
      );
      const states = data.teams.nodes[0]?.states?.nodes ?? [];
      return states.map((s) => ({
        id: s.id,
        name: s.name,
        categoryKey: linearStateTypeToJiraCategoryKey(s.type),
      }));
    } catch (e) {
      throw linearError(e);
    }
  }

  // ---- Internals -----------------------------------------------------------

  private async *queryIssues(
    filter: LinearIssueFilterInput,
    maxResults: number | null = null
  ): AsyncGenerator<ExternalIssue> {
    let cursor: string | null = null;
    let fetched = 0;
    while (true) {
      const data: { issues: IssueConnection } = await this.client.request<{ issues: IssueConnection }>(
        gql`
          ${ISSUE_FIELDS}
          query ListIssues($filter: IssueFilter, $first: Int!, $after: String) {
            issues(filter: $filter, first: $first, after: $after) {
              nodes { ...IssueFields }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
        { filter, first: PAGE_SIZE, after: cursor }
      );

      for (const node of data.issues.nodes) {
        yield this.mapIssue(node);
        fetched++;
        if (maxResults != null && fetched >= maxResults) return;
      }

      if (!data.issues.pageInfo.hasNextPage || !data.issues.pageInfo.endCursor) return;
      cursor = data.issues.pageInfo.endCursor;
    }
  }

  private async collectPages<T>(loadPage: (cursor: string | null) => Promise<Connection<T>>): Promise<T[]> {
    const nodes: T[] = [];
    let cursor: string | null = null;

    while (true) {
      const page = await loadPage(cursor);
      nodes.push(...page.nodes);
      if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) return nodes;
      cursor = page.pageInfo.endCursor;
    }
  }

  private mapIssue(issue: LinearIssue): ExternalIssue {
    const stateName = issue.state?.name ?? 'Unknown';
    const stateType = issue.state?.type;
    const labels = issue.labels?.nodes.map((l) => l.name) ?? [];
    // Linear has no "type" field; surface the first label as a proxy so the
    // Import UI's group-by-type grouping has something meaningful to show.
    const issueType = labels[0] ?? 'Issue';

    return {
      key: issue.identifier,
      id: issue.id,
      title: issue.title,
      description: this.documentCodec.fromExternal(issue.description),
      issueType,
      status: stateName,
      statusType: stateType,
      parentKey: issue.parent?.identifier ?? null,
      // Linear "Projects" are our epic proxy.
      epicKey: issue.project?.id ?? null,
      assignee: mapLinearPerson(issue.assignee),
      creator: mapLinearPerson(issue.creator),
      updatedAt: issue.updatedAt,
      url: issue.url,
    };
  }
}

function mapLinearPerson(person: LinearPerson | null | undefined): ExternalIssue['assignee'] {
  if (!person) return null;
  const name = person.displayName ?? person.name ?? person.id;
  return { id: person.id, name, avatarUrl: person.avatarUrl ?? null };
}

function toErrorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const resp = (e as { response?: { errors?: { message: string }[] } }).response;
    const msgs = resp?.errors?.map((x) => x.message).join('; ');
    if (msgs) return msgs;
  }
  return e instanceof Error ? e.message : String(e);
}

function linearError(e: unknown): TrackerError {
  const msg = toErrorMessage(e);
  const status = (e as { response?: { status?: number } })?.response?.status;
  let code: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'NETWORK_ERROR' | 'SERVER_ERROR' | 'UNKNOWN' = 'UNKNOWN';
  if (status === 401 || status === 403) code = 'UNAUTHORIZED';
  else if (status === 429) code = 'RATE_LIMITED';
  else if (status && status >= 500) code = 'SERVER_ERROR';
  else if (!status && e instanceof Error && e.message.includes('fetch')) code = 'NETWORK_ERROR';
  return new TrackerError(code, msg, e instanceof Error ? e : undefined);
}

/**
 * Translate Linear state types into Jira statusCategory.key so existing
 * transition-matching heuristics (written around Jira's three buckets) still
 * work for the synthesized transition list.
 */
function linearStateTypeToJiraCategoryKey(stateType: string): string {
  const t = stateType.toLowerCase();
  if (t === 'triage' || t === 'backlog' || t === 'unstarted') return 'new';
  if (t === 'started') return 'indeterminate';
  if (t === 'completed' || t === 'canceled') return 'done';
  return 'undefined';
}
