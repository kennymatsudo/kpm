/**
 * Storybook Tools
 *
 * Tools for querying Storybook design system components
 */

import { z } from 'zod';
import { tool, jsonResult, toolError } from './index';
import type { IProjectRepository } from '../../db/interfaces';

// Storybook type definitions
interface StorybookIndexEntry {
  id: string;
  title: string;
  name: string;
  importPath: string;
  tags?: string[];
  type: 'story' | 'docs';
}

interface StorybookIndex {
  v: number;
  entries: Record<string, StorybookIndexEntry>;
}

interface StorybookComponent {
  id: string;
  title: string;
  storyCount: number;
  tags: string[];
}

// In-memory cache with 30-second TTL
const STORYBOOK_CACHE_TTL_MS = 30_000;
const storybookIndexCache = new Map<string, { index: StorybookIndex; fetchedAt: number }>();

/**
 * Fetch and parse Storybook index.json with caching
 */
async function fetchStorybookIndex(storybookUrl: string): Promise<StorybookIndex> {
  const normalizedUrl = storybookUrl.replace(/\/$/, '');
  const cached = storybookIndexCache.get(normalizedUrl);
  if (cached && Date.now() - cached.fetchedAt < STORYBOOK_CACHE_TTL_MS) {
    return cached.index;
  }

  const url = `${normalizedUrl}/index.json`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000), // 10 second timeout
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Storybook index: ${response.status} ${response.statusText}`);
  }

  const index = (await response.json()) as StorybookIndex;
  storybookIndexCache.set(normalizedUrl, { index, fetchedAt: Date.now() });
  return index;
}

/**
 * Extract unique components from Storybook index
 */
function extractComponentsFromIndex(index: StorybookIndex): StorybookComponent[] {
  const componentMap = new Map<string, StorybookComponent>();

  for (const entry of Object.values(index.entries)) {
    if (entry.type !== 'story') continue;

    // Component ID is derived from title (e.g., "Components/Button" -> "components-button")
    const componentId = entry.title.toLowerCase().replace(/\//g, '-').replace(/\s+/g, '-');

    if (!componentMap.has(componentId)) {
      componentMap.set(componentId, {
        id: componentId,
        title: entry.title,
        storyCount: 0,
        stories: [],
        tags: [],
      });
    }

    const component = componentMap.get(componentId)!;
    component.storyCount++;
    component.stories.push({ id: entry.id, name: entry.name });

    // Merge tags
    if (entry.tags) {
      for (const tag of entry.tags) {
        if (!component.tags.includes(tag)) {
          component.tags.push(tag);
        }
      }
    }
  }

  return Array.from(componentMap.values()).sort((a, b) => a.title.localeCompare(b.title));
}

export function createStorybookTools(projectRepo: IProjectRepository) {
  return [
    tool(
      'List all components in the project Storybook. Use this to discover what UI components already exist before proposing new ones during planning. Returns component names, story counts, and available variants.',
      {
        projectId: z.string().uuid().describe('The project UUID'),
      },
      async ({ projectId }) => {
        const project = projectRepo.get(projectId);
        if (!project) {
          return toolError('Project not found');
        }

        if (!project.storybook_url) {
          return toolError('No Storybook configured for this project. Add a Storybook URL in project settings.');
        }

        try {
          const index = await fetchStorybookIndex(project.storybook_url);
          const components = extractComponentsFromIndex(index);

          return jsonResult({
            storybookUrl: project.storybook_url,
            components: components.map((c) => ({
              id: c.id,
              title: c.title,
              storyCount: c.storyCount,
              tags: c.tags,
            })),
            totalComponents: components.length,
          });
        } catch (error) {
          return toolError(`Could not connect to Storybook at ${project.storybook_url}: ${error instanceof Error ? error.message : 'Unknown error'}. Ensure Storybook is running and accessible.`);
        }
    ),

    tool(
      {
        projectId: z.string().uuid().describe('The project UUID'),
        componentTitle: z.string().describe('Component title from list_components (e.g., "Components/Button")'),
      },
      async ({ projectId, componentTitle }) => {
        const project = projectRepo.get(projectId);
        if (!project) {
          return toolError('Project not found');
        }

        if (!project.storybook_url) {
          return toolError('No Storybook configured for this project.');
        }

        try {
          const index = await fetchStorybookIndex(project.storybook_url);

          // Find all stories for this component
          const stories = Object.values(index.entries)
            .filter((entry) => entry.type === 'story' && entry.title === componentTitle)
            .map((entry) => ({
              id: entry.id,
              name: entry.name,
              tags: entry.tags || [],
            }));

          if (stories.length === 0) {
          }

          // Collect all unique tags
          const allTags = [...new Set(stories.flatMap((s) => s.tags))];

          return jsonResult({
            component: {
              title: componentTitle,
              storyCount: stories.length,
              tags: allTags,
              stories: stories.map((s) => ({ id: s.id, name: s.name })),
            },
            viewUrl: `${project.storybook_url}/?path=/story/${stories[0].id}`,
          });
        } catch (error) {
          return toolError(`Could not fetch component from Storybook: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    ),

    tool(
      'Search for components by name. Use when looking for a specific type of component (e.g., "modal", "button", "form").',
      {
        projectId: z.string().uuid().describe('The project UUID'),
        query: z.string().describe('Search query (case-insensitive, matches component titles)'),
      },
      async ({ projectId, query }) => {
        const project = projectRepo.get(projectId);
        if (!project) {
          return toolError('Project not found');
        }

        if (!project.storybook_url) {
          return toolError('No Storybook configured for this project.');
        }

        try {
          const index = await fetchStorybookIndex(project.storybook_url);
          const allComponents = extractComponentsFromIndex(index);

          const queryLower = query.toLowerCase();
          const matches = allComponents.filter(
            (c) =>
              c.title.toLowerCase().includes(queryLower) ||
              c.stories.some((s) => s.name.toLowerCase().includes(queryLower))
          );

          return jsonResult({
            query,
            matches: matches.map((c) => ({
              title: c.title,
              storyCount: c.storyCount,
              stories: c.stories.map((s) => s.name),
            })),
            matchCount: matches.length,
            totalComponents: allComponents.length,
          });
        } catch (error) {
          return toolError(`Could not search Storybook: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    ),
  ];
}
