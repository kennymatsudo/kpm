/**
 * Custom Prompt Generation Service
 *
 * Executes custom prompts from Command+K palette using the configured deep model
 * (`getConfig().generation.deepModel`, defaults to Sonnet) with extended thinking.
 * Claude has access to all KPM MCP tools (get_plan_items, get_project_info, etc.)
 * and decides what context to query based on the user's prompt.
 *
 * Output is saved to project/outputs/ folder.
 */

import type { Options as SDKOptions } from '@anthropic-ai/claude-agent-sdk';
import * as path from 'path';
import * as fs from 'fs';
import { getKpmServer } from '../../claude/tools/createKpmServer';
import { getConfig } from '../../config';
import { getClaudeSdkSpawnOptions } from '../../claude/findClaude';
import { runClaudeQuery, type ClaudeQueryUsage } from '../../claude/runClaudeQuery';

export interface CustomPromptExecutionOptions {
  promptId: string;
  promptName: string;
  promptContent: string;
  projectId: string;
  projectName: string;
  projectPath: string;
}

export interface CustomPromptExecutionCallbacks {
  onProgress: (message: string) => void;
  onComplete: (filePath: string) => void;
  onError: (error: string) => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Ensure outputs directory exists
 */
function ensureOutputsDir(projectPath: string): string {
  const outputsDir = path.join(projectPath, 'outputs');
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir, { recursive: true });
  }
  return outputsDir;
}

/**
 * Generate filename for output
 */
function getOutputFilename(promptName: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  // Convert prompt name to kebab-case and sanitize
  const sanitized = promptName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${sanitized}-${date}.md`;
}

// =============================================================================
// Factory Function
// =============================================================================

function createCustomPromptGenerationService() {
  return {
    /**
     * Execute a custom prompt and generate output
     */
    async executePrompt(
      options: CustomPromptExecutionOptions,
      callbacks: CustomPromptExecutionCallbacks
    ): Promise<void> {
      const log = (msg: string) => console.log(`[CustomPromptGen] ${msg}`);
      const logError = (msg: string) => console.error(`[CustomPromptGen] ${msg}`);

      try {
        log(`Starting custom prompt execution: ${options.promptName} for project ${options.projectId}`);

        // Phase 1: Setting up
        callbacks.onProgress('Setting up prompt execution...');

        // Build the prompt with project context
        const fullPrompt = `You are helping with the project "${options.projectName}".

${options.promptContent}

Use the available tools to gather the context you need, then generate the requested output as markdown.
Be thorough but concise. Focus on what was requested.`;

        log(`Prompt length: ${fullPrompt.length} chars`);

        // Phase 2: Claude with tools
        callbacks.onProgress('Generating with Claude (with KPM tools)...');

        // Get the KPM MCP server for tool access
        const kpmServer = getKpmServer();
        if (!kpmServer) {
          throw new Error('KPM MCP server not available');
        }

        // Configure SDK for the deep model with extended thinking and MCP server
        const sdkOptions: SDKOptions = {
          model: getConfig().generation.deepModel,
          // Adaptive thinking for high-quality generation.
          // display: 'summarized' ensures Opus 4.8 / Sonnet 5 stream thinking content (default is 'omitted').
          thinking: { type: 'adaptive' as const, display: 'summarized' as const },
          persistSession: false, // Ephemeral one-shot query, no need to persist
          // Use KPM MCP server for tools
          mcpServers: {
            kpm: kpmServer,
          },
          systemPrompt: `You are a helpful assistant for project "${options.projectName}".

Generate markdown output that is clear, well-structured, and professional.`,
          stderr: (data: string) => {
            logError(`stderr: ${data}`);
          },
          ...getClaudeSdkSpawnOptions(),
        };

        log('Calling Claude Agent SDK query() with KPM tools...');

        const TIMEOUT_MS = getConfig().generation.artifactGenerationTimeoutMs;
        const sdkModel = getConfig().generation.deepModel;

        const result = await runClaudeQuery({
          prompt: fullPrompt,
          sdkOptions,
          timeoutMs: TIMEOUT_MS,
          timeoutMessage: `Generation timed out after ${TIMEOUT_MS / 60000} minutes`,
          onToolUse: (toolName) => {
            log(`Tool use: ${toolName}`);
            callbacks.onProgress(`Querying ${toolName}...`);
          },
          recordUsage: ({ usage, totalCostUsd }) => {
            if (_usageRecorder) {
              _usageRecorder({
                projectId: options.projectId,
                source: 'custom_prompt',
                model: sdkModel,
                usage,
                totalCostUsd,
              });
            }
          },
        });

        const generatedContent = result.text;

        if (!generatedContent.trim()) {
          throw new Error('No content generated');
        }

        log(`Generated content: ${generatedContent.length} chars`);

        // Phase 3: Saving
        callbacks.onProgress('Saving output...');

        // Save to outputs folder
        const outputsDir = ensureOutputsDir(options.projectPath);
        const filename = getOutputFilename(options.promptName);
        const filePath = path.join(outputsDir, filename);

        // Handle filename conflicts
        let finalPath = filePath;
        let counter = 1;
        while (fs.existsSync(finalPath)) {
          const baseName = filename.replace(/\.md$/, '');
          finalPath = path.join(outputsDir, `${baseName}-${counter}.md`);
          counter++;
        }

        fs.writeFileSync(finalPath, generatedContent, 'utf-8');
        log(`Saved to: ${finalPath}`);

        // Return relative path from project root
        const relativePath = path.relative(options.projectPath, finalPath);
        log(`Calling onComplete with path: ${relativePath}`);
        callbacks.onComplete(relativePath);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const stack = error instanceof Error ? error.stack : '';
        logError(`Error: ${errorMessage}`);
        if (stack) logError(`Stack: ${stack}`);
        callbacks.onError(errorMessage);
      }
    },
  };
}

// =============================================================================
// Usage Recorder Hook
// =============================================================================
//
// `executeCustomPrompt` is called via a top-level helper (the singleton was
// established before DI was retrofitted in this part of the codebase), so the
// usage recorder is registered globally at app startup. The composition root
// calls `setCustomPromptUsageRecorder(...)` once; the function inside the
// SDK loop reads it on each `result` message.

interface CustomPromptUsageEvent {
  projectId: string;
  source: 'custom_prompt';
  model: string;
  usage: ClaudeQueryUsage;
  totalCostUsd?: number | null;
}

let _usageRecorder: ((event: CustomPromptUsageEvent) => void) | null = null;

export function setCustomPromptUsageRecorder(
  recorder: ((event: CustomPromptUsageEvent) => void) | null,
): void {
  _usageRecorder = recorder;
}

// =============================================================================
// Type Export
// =============================================================================

export type CustomPromptGenerationService = ReturnType<typeof createCustomPromptGenerationService>;

// =============================================================================
// Singleton
// =============================================================================

let _service: CustomPromptGenerationService | null = null;

export function getCustomPromptGenerationService(): CustomPromptGenerationService {
  if (!_service) {
    _service = createCustomPromptGenerationService();
  }
  return _service;
}

/** Execute a custom prompt (standalone function) */
export function executeCustomPrompt(
  options: CustomPromptExecutionOptions,
  callbacks: CustomPromptExecutionCallbacks
): Promise<void> {
  return getCustomPromptGenerationService().executePrompt(options, callbacks);
}
