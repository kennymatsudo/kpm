/**
 * Confluence REST API Client
 *
 * Uses Confluence v2 API for page operations.
 * Reuses Jira credentials (same Atlassian Cloud account).
 */

import type { JiraCredentials } from '../../tracker-clients/common/types';
import { jiraAdfCodec } from '../../documents';

export interface ConfluencePage {
  id: string;
  title: string;
  spaceId: string;
  version: number;
  content: string; // Markdown (converted from ADF)
  webUrl: string;
}

export interface ParsedConfluenceUrl {
  siteUrl: string;
  spaceKey: string;
  pageId: string;
}

/** Internal response type from Confluence API */
interface ConfluencePageResponse {
  id: string;
  title: string;
  spaceId: string;
  version?: { number: number };
  body?: {
      value: string;
    };
  };
  _links?: {
    webui?: string;
  };
}

export class ConfluenceClient {
  private baseUrl: string;
  private authHeader: string;
  private documentCodec = jiraAdfCodec;

  constructor(credentials: JiraCredentials) {
    this.baseUrl = `https://${credentials.siteUrl}/wiki`;
    this.authHeader =
      'Basic ' + Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64');
  }

  /**
   * Test connection to Confluence API.
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/spaces?limit=1`, {
        headers: { Authorization: this.authHeader },
      });
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get a Confluence page by ID.
   */
  async getPage(pageId: string): Promise<ConfluencePage> {
    const response = await fetch(
      { headers: { Authorization: this.authHeader } }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch page: HTTP ${response.status}`);
    }

    const data = (await response.json()) as ConfluencePageResponse;

    // Parse ADF content
    let content = '';
      try {
        content = this.documentCodec.fromExternal(adf) ?? '';
      } catch {
        // If ADF parsing fails, leave content empty
      }
    }

    return {
      id: data.id,
      title: data.title,
      spaceId: data.spaceId,
      version: data.version?.number ?? 1,
      content,
      webUrl: data._links?.webui ?? '',
    };
  }

  /**
   * Update a Confluence page with markdown content.
   */
  async updatePage(
    pageId: string,
    markdownContent: string,
    currentVersion: number
  ): Promise<ConfluencePage> {
    const adfContent = this.documentCodec.toExternal(markdownContent);

    // First get the page to get its title (required for update)
    const currentPage = await this.getPage(pageId);

    const response = await fetch(`${this.baseUrl}/api/v2/pages/${pageId}`, {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: pageId,
        status: 'current',
        title: currentPage.title,
        spaceId: currentPage.spaceId,
        version: { number: currentVersion + 1 },
        body: {
          value: JSON.stringify(adfContent),
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update page: ${errorText}`);
    }

    return this.getPage(pageId);
  }

  /**
   * Parse a Confluence page URL to extract site, space, and page ID.
   * Supports both modern and legacy URL formats.
   *
   * @example
   * // Modern format
   * parsePageUrl('https://company.atlassian.net/wiki/spaces/EN/pages/1234567890/Page+Title')
   * // => { siteUrl: 'company.atlassian.net', spaceKey: 'EN', pageId: '1234567890' }
   *
   * @example
   * // Legacy format
   * parsePageUrl('https://company.atlassian.net/wiki/pages/viewpage.action?pageId=1234567890')
   * // => { siteUrl: 'company.atlassian.net', spaceKey: '', pageId: '1234567890' }
   */
  static parsePageUrl(url: string): ParsedConfluenceUrl | null {
    // Modern format: /wiki/spaces/SPACEKEY/pages/PAGEID/...
    const modernRegex = /https?:\/\/([^/]+)\/wiki\/spaces\/([^/]+)\/pages\/(\d+)/;
    const modernMatch = modernRegex.exec(url);
    if (modernMatch) {
      return {
        siteUrl: modernMatch[1],
        spaceKey: modernMatch[2],
        pageId: modernMatch[3],
      };
    }

    // Legacy format: /wiki/pages/viewpage.action?pageId=PAGEID
    const legacyRegex = /https?:\/\/([^/]+)\/wiki\/pages\/viewpage\.action\?.*pageId=(\d+)/;
    const legacyMatch = legacyRegex.exec(url);
    if (legacyMatch) {
      return {
        siteUrl: legacyMatch[1],
        spaceKey: '', // Space key not in legacy URL
        pageId: legacyMatch[2],
      };
    }

    return null;
  }
}
