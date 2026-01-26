/**
 * Jira Tools
 *
 * Tools for integrating with Jira issue tracker
 */

import { z } from 'zod';
import { tool, jsonResult, toolError } from './index';
import { TrackerClientService } from '../../trackers/TrackerClientService';
import { TrackerError } from '../../tracker-clients';
import { getDatabase } from '../../db/connection';

/**
 * Format error response preserving TrackerError codes for programmatic handling
 */
function formatJiraError(error: unknown) {
  if (error instanceof TrackerError) {
    return jsonResult({
      error: error.userMessage,
      errorCode: error.code,
    });
  }
  return toolError(error instanceof Error ? error.message : 'Unknown error');
}

  const db = getDatabase();

  return [
    tool(
      'jira_list_projects',
      {},
      async () => {
        try {
          const hasCredentials = await TrackerClientService.hasJiraCredentials();
          if (!hasCredentials) {
            return jsonResult({
            });
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
      'Search issues in Jira project. Returns issues matching JQL query.',
      {
        projectKey: z.string().describe('Jira project key (e.g., "AUTH")'),
        jql: z.string().optional().describe('JQL query fragment (e.g., "status = Open")'),
        maxResults: z.number().optional().default(50).describe('Max results to return'),
      },
      async ({ projectKey, jql, maxResults }) => {
        try {
          const hasCredentials = await TrackerClientService.hasJiraCredentials();
          if (!hasCredentials) {
            return jsonResult({
            });
          }

          const client = await TrackerClientService.getJiraClient();
          const issues = await client.searchIssues(projectKey, jql);
          const limited = issues.slice(0, maxResults);

          return jsonResult({
            issues: limited,
            count: limited.length,
            total: issues.length,
          });
        } catch (error) {
          return formatJiraError(error);
        }
      },
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),

    tool(
      'jira_get_issue',
      'Get a single Jira issue by key',
      {
        issueKey: z.string().describe('Jira issue key (e.g., "AUTH-123")'),
      },
      async ({ issueKey }) => {
        try {
          const hasCredentials = await TrackerClientService.hasJiraCredentials();
          if (!hasCredentials) {
            return jsonResult({
            });
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
      {
        jiraProjectKey: z.string().describe('Jira project key (e.g., "AUTH")'),
      },
      async ({ projectId, jiraProjectKey }) => {
        try {
          const hasCredentials = await TrackerClientService.hasJiraCredentials();
          if (!hasCredentials) {
            return jsonResult({
            });
          }

          // Get plan items
          const planItems = db
            .prepare(
              `
            SELECT id, title, parent_id, status, status_category, label, release_tag, external_key
            FROM plan_items
            WHERE project_id = ?
            ORDER BY item_order
          `
            )
            .all(projectId) as {
            id: string;
            title: string;
            parent_id: string | null;
            status: string | null;
            status_category: string | null;
            label: string | null;
            release_tag: string | null;
            external_key: string | null;
          }[];

          // Get Jira issues
          const client = await TrackerClientService.getJiraClient();
          const jiraIssues = await client.searchIssues(jiraProjectKey);

          // Find gaps
          const planItemKeys = new Set(
            planItems
              .map((item) => (/^([A-Z]+-\d+)/.exec(item.title))?.[1])
              .filter(Boolean)
          );

          const jiraKeys = new Set(jiraIssues.map((issue) => issue.key));

          const inJiraNotInPlan = jiraIssues.filter((issue) => !planItemKeys.has(issue.key));
          const inPlanNotInJira = planItems.filter((item) => {
            const match = /^([A-Z]+-\d+)/.exec(item.title);
            return match && !jiraKeys.has(match[1]);
          });

          return jsonResult({
            summary: {
              totalJiraIssues: jiraIssues.length,
              totalPlanItems: planItems.length,
              inJiraNotInPlan: inJiraNotInPlan.length,
              inPlanNotInJira: inPlanNotInJira.length,
            },
            inJiraNotInPlan: inJiraNotInPlan.map((i) => ({
              key: i.key,
              title: i.title,
              issueType: i.issueType,
              status: i.status,
            })),
            inPlanNotInJira: inPlanNotInJira.map((i) => ({
              id: i.id,
              title: i.title,
              label: i.label,
            })),
          });
        } catch (error) {
          return formatJiraError(error);
        }
      },
      { annotations: { readOnlyHint: true, openWorldHint: true } }
    ),
  ];
}
