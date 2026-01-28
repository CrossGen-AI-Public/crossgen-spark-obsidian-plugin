/**
 * WorkflowEditHandler - Processes workflow edit requests from the chat UI
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '../../logger/Logger.js';
import type { AIProviderFactory } from '../../providers/AIProviderFactory.js';
import type { AIConfig } from '../../types/config.js';
import { layoutWorkflow } from '../generation/layoutWorkflow.js';
import { validateAndNormalizeWorkflowDefinition } from '../generation/validateWorkflowDefinition.js';
import type { WorkflowDefinition } from '../types.js';
import { buildRepairPrompt, buildWorkflowEditPrompt } from './workflowEditorPromptPack.js';

const WORKFLOW_EDIT_QUEUE_DIR = '.spark/workflow-edit-queue';
const WORKFLOW_EDIT_RESULTS_DIR = '.spark/workflow-edit-results';
const WORKFLOWS_DIR = '.spark/workflows';

const DEFAULT_MAX_ATTEMPTS = 4;

/**
 * Chat message in conversation history
 */
interface ChatMessage {
  role: string;
  content: string;
}

/**
 * Workflow edit request schema
 */
interface WorkflowEditRequest {
  requestId: string;
  workflowId: string;
  timestamp: number;
  source: 'workflow-chat';
  workflow: WorkflowDefinition;
  selectedNodeId?: string;
  recentRuns: unknown[];
  message: string;
  conversationHistory: ChatMessage[];
  threadId?: string;
}

/**
 * Workflow edit result schema
 */
type WorkflowEditResult =
  | {
      requestId: string;
      status: 'processing';
      stage: string;
      progress?: number;
      message?: string;
      updatedAt: number;
    }
  | {
      requestId: string;
      status: 'completed';
      updatedWorkflow?: WorkflowDefinition;
      responseMessage: string;
      changesDescription?: string;
    }
  | {
      requestId: string;
      status: 'needs_clarification';
      questions: string[];
    }
  | {
      requestId: string;
      status: 'failed';
      error: string;
    };

/**
 * Response from AI
 */
interface AIEditResponse {
  status: 'completed' | 'needs_clarification';
  responseMessage?: string;
  changesDescription?: string;
  updatedWorkflow?: unknown;
  questions?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJsonParse(text: string): unknown {
  const trimmed = text.trim();

  // Strip markdown fences if present
  if (trimmed.startsWith('```')) {
    const withoutFirstLine = trimmed.replace(/^```[a-zA-Z]*\n/, '');
    const withoutLastFence = withoutFirstLine.replace(/\n```$/, '');
    return JSON.parse(withoutLastFence.trim());
  }

  // Best-effort: parse the first JSON object in the string
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Fall through to parse the whole string
    }
  }

  return JSON.parse(trimmed);
}

function isValidEditResponse(value: unknown): value is AIEditResponse {
  if (!isRecord(value)) return false;
  if (value.status !== 'completed' && value.status !== 'needs_clarification') return false;
  return true;
}

function isClarificationResponse(
  value: AIEditResponse
): value is AIEditResponse & { status: 'needs_clarification'; questions: string[] } {
  return (
    value.status === 'needs_clarification' &&
    Array.isArray(value.questions) &&
    value.questions.every((q) => typeof q === 'string')
  );
}

export class WorkflowEditHandler {
  private processingFiles: Set<string> = new Set();

  constructor(
    private vaultPath: string,
    private logger: Logger,
    private providerFactory: AIProviderFactory,
    private aiConfig: AIConfig
  ) {}

  isQueueFile(relativePath: string): boolean {
    return relativePath.startsWith(WORKFLOW_EDIT_QUEUE_DIR) && relativePath.endsWith('.json');
  }

  private getRequestIdFromPath(relativePath: string): string {
    return (
      relativePath
        .split('/')
        .pop()
        ?.replace(/\.json$/, '') ?? relativePath
    );
  }

  private loadRequestOrThrow(fullPath: string): WorkflowEditRequest {
    const raw = readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw) as WorkflowEditRequest;
  }

  private selectProviderName(): string {
    return this.aiConfig.providers['claude-client']
      ? 'claude-client'
      : this.aiConfig.defaultProvider;
  }

  private writeProgress(requestId: string, stage: string, message?: string): void {
    this.logger.debug('[WorkflowEdit] Stage update', { requestId, stage, message });
    this.writeResultFile({
      requestId,
      status: 'processing',
      stage,
      message,
      updatedAt: Date.now(),
    });
  }

  private writeResultFile(result: WorkflowEditResult): void {
    const resultsDir = join(this.vaultPath, WORKFLOW_EDIT_RESULTS_DIR);
    if (!existsSync(resultsDir)) {
      mkdirSync(resultsDir, { recursive: true });
    }
    const path = join(resultsDir, `${result.requestId}.json`);
    writeFileSync(path, JSON.stringify(result, null, 2));
  }

  private writeWorkflowFile(workflow: WorkflowDefinition): void {
    const workflowsDir = join(this.vaultPath, WORKFLOWS_DIR);
    if (!existsSync(workflowsDir)) {
      mkdirSync(workflowsDir, { recursive: true });
    }
    const path = join(workflowsDir, `${workflow.id}.json`);
    writeFileSync(path, JSON.stringify(workflow, null, 2));
  }

  private deleteQueueFileBestEffort(fullPath: string, relativePath: string): void {
    try {
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
      }
    } catch (error) {
      this.logger.warn('Failed to delete workflow edit queue file', {
        path: relativePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async parseModelJsonOrThrow(
    prompt: string,
    provider: { complete: (options: { prompt: string }) => Promise<{ content: string }> }
  ): Promise<{ parsed: unknown; rawJson: string }> {
    const result = await provider.complete({ prompt });
    const parsed = safeJsonParse(result.content);
    return { parsed, rawJson: JSON.stringify(parsed, null, 2) };
  }

  private tryValidateWorkflow(
    parsed: unknown
  ): { ok: true; workflow: WorkflowDefinition } | { ok: false; errors: string[] } {
    if (!isRecord(parsed)) {
      return { ok: false, errors: ['Workflow must be an object.'] };
    }

    const validated = validateAndNormalizeWorkflowDefinition(parsed, { allowCode: true });
    if (!validated.ok) {
      return { ok: false, errors: validated.errors };
    }

    return { ok: true, workflow: validated.workflow };
  }

  /**
   * Validate and repair a workflow with retry loop
   */
  private async validateAndRepairWorkflow(
    requestId: string,
    initialWorkflow: unknown,
    provider: { complete: (options: { prompt: string }) => Promise<{ content: string }> }
  ): Promise<{ ok: true; workflow: WorkflowDefinition } | { ok: false; errors: string[] }> {
    let parsedWorkflow: unknown = initialWorkflow;
    let lastRawJson = JSON.stringify(parsedWorkflow, null, 2);
    let validationErrors: string[] = [];

    for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt++) {
      const validated = this.tryValidateWorkflow(parsedWorkflow);

      if (validated.ok) {
        return validated;
      }

      validationErrors = validated.errors;
      this.logger.debug('[WorkflowEdit] Validation failed', {
        requestId,
        attempt,
        errors: validationErrors,
      });

      if (attempt >= DEFAULT_MAX_ATTEMPTS) break;

      // Attempt repair
      this.writeProgress(
        requestId,
        'repairing',
        `Fixing validation issues (attempt ${attempt + 1}/${DEFAULT_MAX_ATTEMPTS})...`
      );

      const repairPrompt = buildRepairPrompt({
        errors: validationErrors,
        lastJson: lastRawJson,
      });

      const repaired = await this.parseModelJsonOrThrow(repairPrompt, provider);
      parsedWorkflow = repaired.parsed;
      lastRawJson = repaired.rawJson;
    }

    return { ok: false, errors: validationErrors };
  }

  async processQueueFile(relativePath: string): Promise<void> {
    if (this.processingFiles.has(relativePath)) return;
    this.processingFiles.add(relativePath);

    const fullPath = join(this.vaultPath, relativePath);
    if (!existsSync(fullPath)) {
      this.processingFiles.delete(relativePath);
      return;
    }

    try {
      const request = this.loadRequestOrThrow(fullPath);
      this.logger.info('[WorkflowEdit] Processing request', {
        requestId: request.requestId,
        workflowId: request.workflowId,
        messagePreview: request.message.slice(0, 100),
      });

      this.writeProgress(request.requestId, 'queued', 'Picked up request...');

      const providerName = this.selectProviderName();
      this.logger.debug('[WorkflowEdit] Provider selected', {
        requestId: request.requestId,
        providerName,
      });
      const provider = this.providerFactory.createFromConfig(this.aiConfig, providerName);

      this.writeProgress(request.requestId, 'processing', 'Analyzing workflow...');

      // Build the prompt with all context
      const prompt = buildWorkflowEditPrompt({
        workflow: request.workflow,
        selectedNodeId: request.selectedNodeId,
        recentRuns: request.recentRuns,
        message: request.message,
        conversationHistory: request.conversationHistory,
      });

      const initial = await this.parseModelJsonOrThrow(prompt, provider);
      this.logger.debug('[WorkflowEdit] Initial response parsed', {
        requestId: request.requestId,
        rawJsonLength: initial.rawJson.length,
      });

      if (!isValidEditResponse(initial.parsed)) {
        this.writeResultFile({
          requestId: request.requestId,
          status: 'failed',
          error: 'AI returned invalid response format.',
        });
        return;
      }

      const aiResponse = initial.parsed;

      // Handle clarification requests
      if (isClarificationResponse(aiResponse)) {
        this.writeResultFile({
          requestId: request.requestId,
          status: 'needs_clarification',
          questions: aiResponse.questions,
        });
        return;
      }

      // Handle completed responses (with or without workflow changes)
      if (aiResponse.status === 'completed') {
        // If no workflow changes, just return the message
        if (!aiResponse.updatedWorkflow) {
          this.writeResultFile({
            requestId: request.requestId,
            status: 'completed',
            responseMessage: aiResponse.responseMessage || 'Done.',
            changesDescription: aiResponse.changesDescription,
          });
          return;
        }

        // Validate and apply workflow changes
        this.writeProgress(request.requestId, 'validating', 'Validating changes...');

        const validated = await this.validateAndRepairWorkflow(
          request.requestId,
          aiResponse.updatedWorkflow,
          provider
        );

        if (!validated.ok) {
          this.writeResultFile({
            requestId: request.requestId,
            status: 'failed',
            error: `Workflow validation failed after ${DEFAULT_MAX_ATTEMPTS} attempts:\n${validated.errors.map((e) => `- ${e}`).join('\n')}`,
          });
          return;
        }

        // Apply layout to new/moved nodes
        this.writeProgress(request.requestId, 'layout', 'Organizing nodes...');
        const laidOut = layoutWorkflow(validated.workflow, { force: false });

        // Save the workflow
        this.writeProgress(request.requestId, 'writing', 'Saving changes...');
        this.writeWorkflowFile(laidOut);

        // Return success
        this.writeResultFile({
          requestId: request.requestId,
          status: 'completed',
          responseMessage: aiResponse.responseMessage || 'Changes applied.',
          changesDescription: aiResponse.changesDescription,
          updatedWorkflow: laidOut,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to process workflow edit queue file', {
        path: relativePath,
        error: message,
      });

      const requestId = this.getRequestIdFromPath(relativePath);
      this.writeResultFile({
        requestId,
        status: 'failed',
        error: message,
      });
    } finally {
      this.deleteQueueFileBestEffort(fullPath, relativePath);
      this.processingFiles.delete(relativePath);
    }
  }

  async scanQueue(): Promise<void> {
    const queuePath = join(this.vaultPath, WORKFLOW_EDIT_QUEUE_DIR);
    if (!existsSync(queuePath)) {
      return;
    }

    const files = readdirSync(queuePath).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const relativePath = `${WORKFLOW_EDIT_QUEUE_DIR}/${file}`;
      await this.processQueueFile(relativePath);
    }
  }
}
