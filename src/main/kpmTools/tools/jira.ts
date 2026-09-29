/**
 * Jira Tools
 *
 * Tools for integrating with Jira issue tracker
 */

import { z } from 'zod';
import { tool, jsonResult, toolError, projectScoped } from './index';
import { TrackerClientService } from '../../trackers/TrackerClientService';
import { TrackerError } from '../../tracker-clients';
import type { ExternalIssue } from '../../tracker-clients/common/types';
import { getDatabase } from '../../db/connection';

/**
 * Format error response preserving TrackerError codes for programmatic handling
 */
function formatJiraError(error: unknown) {
  if (error instanceof TrackerError) return toolError(`${error.userMessage} (${error.code})`);
  return toolError(error instanceof Error ? error.message : 'Unknown error');
}

const JIRA_NOT_CONFIGURED = 'Jira is not configured in KPM. The user can add credentials in Settings; a Jira or Atlassian connector tool, if available, can be used instead.';

/** Longest list a gap report returns per side; the summary still counts everything. */
const MAX_GAP_LIST = 100;

function summarizeIssue(issue: ExternalIssue) {
  return {
    key: issue.key,
    title: issue.title,
    issueType: issue.issueType,
    status: issue.status,
    parentKey: issue.parentKey ?? undefined,
    assignee: issue.assignee?.name ?? undefined,
  };
}

export function createJiraTools() {
  const db = getDatabase();

  return [
    tool(
      'jira_list_projects',
      'List the Jira projects reachable with the Jira credentials configured in KPM, to find the project key the other jira_ tools take. Use when the user names a Jira project loosely or no key is known yet.',
      {},
      async () => {
        try {
          const hasCredentials = await TrackerClientService.hasJiraCredentials();
          if (!hasCredentials) {
            return toolError(JIRA_NOT_CONFIGURED);
          }

          const client = await TrackerClientService.getJiraClient();
          const projects = await client.getAvailableProjects();

          return jsonResult({ projects, count: projects.length });
        } catch (error) {
          return formatJiraError(error);
        }
      },
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),

    tool(
      'jira_search',
      'Search one Jira project\'s issues, optionally narrowed by a JQL fragment, using the Jira credentials configured in KPM. Returns key, title, type, status, parent, and assignee per issue, up to 100; read an issue\'s description with jira_get_issue. For a plan item\'s linked issue, its external_key is the issue key.',
      {
        projectKey: z.string().describe('Jira project key (e.g., "AUTH")'),
        jql: z.string().optional().describe('JQL fragment ANDed with the project, e.g. "status = Open"'),
        maxResults: z.number().int().min(1).max(100).optional().default(50).describe('Max results to return (at most 100)'),
      },
      async ({ projectKey, jql, maxResults }) => {
        try {
          const hasCredentials = await TrackerClientService.hasJiraCredentials();
          if (!hasCredentials) {
            return toolError(JIRA_NOT_CONFIGURED);
          }

          const client = await TrackerClientService.getJiraClient();
          const issues = await client.searchIssues(projectKey, jql);
          const limited = issues.slice(0, maxResults);

          return jsonResult({
            issues: limited.map(summarizeIssue),
            count: limited.length,
            truncated: issues.length > limited.length || issues.length === 100,
          });
        } catch (error) {
          return formatJiraError(error);
        }
      },
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),

    tool(
      'jira_get_issue',
      'Read one Jira issue in full by key, including its description, using the Jira credentials configured in KPM. Use for an issue the user names or a plan item\'s external_key.',
      {
        issueKey: z.string().describe('Jira issue key (e.g., "AUTH-123")'),
      },
      async ({ issueKey }) => {
        try {
          const hasCredentials = await TrackerClientService.hasJiraCredentials();
          if (!hasCredentials) {
            return toolError(JIRA_NOT_CONFIGURED);
          }

          const client = await TrackerClientService.getJiraClient();
          const issue = await client.fetchIssue(issueKey);

          return jsonResult({ issue });
        } catch (error) {
          return formatJiraError(error);
        }
      },
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),

    tool(
      'jira_compare_plan',
      'Compare a Jira project with this KPM plan by issue key. Returns Jira issues no plan item links to, and plan items that are not linked to any tracker issue or whose linked issue no longer exists in that Jira project. Use for "what is in Jira that is not in my plan" and the reverse.',
      {
        jiraProjectKey: z.string().describe('Jira project key (e.g., "AUTH")'),
      },
      projectScoped(async ({ projectId, jiraProjectKey }) => {
        try {
          const hasCredentials = await TrackerClientService.hasJiraCredentials();
          if (!hasCredentials) {
            return toolError(JIRA_NOT_CONFIGURED);
          }

          const planItems = db
            .prepare('SELECT id, title, label, external_key FROM plan_items WHERE project_id = ? ORDER BY item_order')
            .all(projectId) as { id: string; title: string; label: string | null; external_key: string | null }[];

          const client = await TrackerClientService.getJiraClient();
          const jiraIssues: ExternalIssue[] = [];
          for await (const issue of client.fetchIssues(jiraProjectKey)) jiraIssues.push(issue);

          const jiraKeys = new Set(jiraIssues.map((issue) => issue.key));
          const linkedKeys = new Set(planItems.map((item) => item.external_key).filter(Boolean));
          const projectKeyPrefix = `${jiraProjectKey}-`;

          const inJiraNotInPlan = jiraIssues.filter((issue) => !linkedKeys.has(issue.key));
          const inPlanNotInJira = planItems.filter((item) => item.external_key
            ? item.external_key.startsWith(projectKeyPrefix) && !jiraKeys.has(item.external_key)
            : true);

          return jsonResult({
            summary: {
              totalJiraIssues: jiraIssues.length,
              totalPlanItems: planItems.length,
              inJiraNotInPlan: inJiraNotInPlan.length,
              inPlanNotInJira: inPlanNotInJira.length,
            },
            inJiraNotInPlan: inJiraNotInPlan.slice(0, MAX_GAP_LIST).map((i) => ({
              key: i.key,
              title: i.title,
              issueType: i.issueType,
              status: i.status,
            })),
            inPlanNotInJira: inPlanNotInJira.slice(0, MAX_GAP_LIST).map((i) => ({
              id: i.id,
              title: i.title,
              external_key: i.external_key ?? undefined,
            })),
          });
        } catch (error) {
          return formatJiraError(error);
        }
      }),
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),
  ];
}
