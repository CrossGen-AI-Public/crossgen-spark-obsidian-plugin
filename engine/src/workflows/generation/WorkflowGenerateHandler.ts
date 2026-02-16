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
import type { IAIProvider } from '../../types/provider.js';
import type { WorkflowDefinition } from '../types.js';
import { layoutWorkflow } from './layoutWorkflow.js';
import type {
  WorkflowGenerateClarificationResponse,
  WorkflowGenerateProgressStage,
  WorkflowGenerateRequest,
  WorkflowGenerateResult,
} from './types.js';
import { validateAndNormalizeWorkflowDefinition } from './validateWorkflowDefinition.js';
import { WORKFLOW_BUILDER_V1_PROMPT } from './workflowBuilderPromptPack.js';

const WORKFLOWS_DIR = '.spark/workflows';
const WORKFLOW_GENERATE_QUEUE_DIR = '.spark/workflow-generate-queue';
const WORKFLOW_GENERATE_RESULTS_DIR = '.spark/workflow-generate-results';

const DEFAULT_MAX_ATTEMPTS = 4;

function defaultStageProgress(stage: WorkflowGenerateProgressStage): number {
  switch (stage) {
    case 'queued':
      return 0;
    case 'generating':
      return 20;
    case 'validating':
      return 50;
    case 'repairing':
      return 65;
    case 'layout':
      return 85;
    case 'writing':
      return 95;
    default:
      return 0;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJsonParse(text: string): unknown {
  const trimmed = text.trim();

  // Strip markdown fences if present.
  if (trimmed.startsWith('```')) {
    const withoutFirstLine = trimmed.replace(/^```[a-zA-Z]*\n/, '');
    const withoutLastFence = withoutFirstLine.replace(/\n```$/, '');
    return JSON.parse(withoutLastFence.trim());
  }

  // Best-effort: parse the first JSON object in the string.
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Fall through to parse the whole string to preserve the original error.
    }
  }

  return JSON.parse(trimmed);
}

function isClarificationResponse(value: unknown): value is WorkflowGenerateClarificationResponse {
  if (!isRecord(value)) return false;
  if (value.status !== 'needs_clarification') return false;
  if (!Array.isArray(value.questions)) return false;
  return value.questions.every((q) => typeof q === 'string' && q.trim().length > 0);
}

function buildGenerationPrompt(request: WorkflowGenerateRequest): string {
  const lines: string[] = [];

  lines.push(WORKFLOW_BUILDER_V1_PROMPT, '');

  if (!request.allowCode) {
    lines.push('IMPORTANT: Do NOT use any code nodes. Only prompt and condition nodes.', '');
  }

  lines.push('User prompt:', request.prompt.trim(), '');

  if (request.clarifications?.trim()) {
    lines.push('Clarifications:', request.clarifications.trim(), '');
  }

  return lines.join('\n');
}

function buildRepairPrompt(options: { errors: string[]; lastJson: string }): string {
  return [
    'You previously generated a Spark workflow JSON but it failed validation.',
    'Fix ONLY what the validation errors require.',
    '',
    'Validation errors:',
    ...options.errors.map((e) => `- ${e}`),
    '',
    'Invalid workflow JSON:',
    options.lastJson,
    '',
    'Return a single corrected JSON object only. No commentary, no markdown fences.',
  ].join('\n');
}

function writeResultFile(vaultPath: string, result: WorkflowGenerateResult): void {
  const resultsDir = join(vaultPath, WORKFLOW_GENERATE_RESULTS_DIR);
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }
  const path = join(resultsDir, `${result.requestId}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2));
}

function writeWorkflowFile(vaultPath: string, workflow: WorkflowDefinition): void {
  const workflowsDir = join(vaultPath, WORKFLOWS_DIR);
  if (!existsSync(workflowsDir)) {
    mkdirSync(workflowsDir, { recursive: true });
  }
  const path = join(workflowsDir, `${workflow.id}.json`);
  writeFileSync(path, JSON.stringify(workflow, null, 2));
}

export class WorkflowGenerateHandler {
  private processingFiles: Set<string> = new Set();

  constructor(
    private vaultPath: string,
    private logger: Logger,
    private providerFactory: AIProviderFactory,
    private aiConfig: AIConfig
  ) {}

  isQueueFile(relativePath: string): boolean {
    return relativePath.startsWith(WORKFLOW_GENERATE_QUEUE_DIR) && relativePath.endsWith('.json');
  }

  private getRequestIdFromPath(relativePath: string): string {
    return (
      relativePath
        .split('/')
        .pop()
        ?.replace(/\.json$/, '') ?? relativePath
    );
  }

  private loadRequestOrThrow(fullPath: string): WorkflowGenerateRequest {
    const raw = readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw) as WorkflowGenerateRequest;
  }

  private selectProviderName(): string {
    return this.aiConfig.providers['claude-client']
      ? 'claude-client'
      : this.aiConfig.defaultProvider;
  }

  private createProvider(modelOverride?: string): IAIProvider {
    if (modelOverride) {
      return this.providerFactory.createWithAgentConfig(this.aiConfig, undefined, modelOverride);
    }
    return this.providerFactory.createFromConfig(this.aiConfig, this.selectProviderName());
  }

  private writeProgress(
    requestId: string,
    stage: WorkflowGenerateProgressStage,
    options?: {
      message?: string;
      progress?: number;
      attempt?: number;
      maxAttempts?: number;
    }
  ): void {
    this.logger.debug('[WorkflowGenerate] Stage update', {
      requestId,
      stage,
      progress: options?.progress ?? defaultStageProgress(stage),
      attempt: options?.attempt,
      maxAttempts: options?.maxAttempts,
      message: options?.message,
    });
    writeResultFile(this.vaultPath, {
      requestId,
      status: 'processing',
      stage,
      progress: options?.progress ?? defaultStageProgress(stage),
      message: options?.message,
      attempt: options?.attempt,
      maxAttempts: options?.maxAttempts,
      updatedAt: Date.now(),
    });
  }

  private async parseModelJsonOrThrow(
    prompt: string,
    provider: { complete: (options: { prompt: string }) => Promise<{ content: string }> }
  ): Promise<{ parsed: unknown; rawJson: string }> {
    const result = await provider.complete({ prompt });
    const parsed = safeJsonParse(result.content);
    return { parsed, rawJson: JSON.stringify(parsed, null, 2) };
  }

  private tryWriteClarificationResult(
    requestId: string,
    parsed: unknown
  ): { wrote: true } | { wrote: false } {
    if (!isClarificationResponse(parsed)) return { wrote: false };
    writeResultFile(this.vaultPath, {
      requestId,
      status: 'needs_clarification',
      questions: parsed.questions,
    });
    return { wrote: true };
  }

  private tryValidateAndWriteWorkflow(
    request: WorkflowGenerateRequest,
    parsed: unknown
  ): { ok: true } | { ok: false; errors: string[] } {
    if (!isRecord(parsed)) {
      return { ok: false, errors: ['Workflow JSON must be an object.'] };
    }

    this.writeProgress(request.requestId, 'validating', { message: 'Validating workflow…' });
    const validated = validateAndNormalizeWorkflowDefinition(parsed, {
      allowCode: request.allowCode,
    });
    if (!validated.ok) {
      return { ok: false, errors: validated.errors };
    }

    this.writeProgress(request.requestId, 'layout', { message: 'Organizing nodes…' });
    const laidOut = layoutWorkflow(validated.workflow, { force: true });
    this.writeProgress(request.requestId, 'writing', { message: 'Saving workflow…' });
    writeWorkflowFile(this.vaultPath, laidOut);
    writeResultFile(this.vaultPath, {
      requestId: request.requestId,
      status: 'completed',
      workflowId: laidOut.id,
      workflowName: laidOut.name,
    });
    return { ok: true };
  }

  private writeFailedResult(requestId: string, errors: string[] | string): void {
    const message =
      typeof errors === 'string'
        ? errors
        : `Workflow generation failed validation:\n${errors.map((e) => `- ${e}`).join('\n')}`;
    this.logger.warn('[WorkflowGenerate] Generation failed', {
      requestId,
      errorPreview: message.slice(0, 300),
    });
    writeResultFile(this.vaultPath, { requestId, status: 'failed', error: message });
  }

  private deleteQueueFileBestEffort(fullPath: string, relativePath: string): void {
    try {
      if (existsSync(fullPath)) {
        unlinkSync(fullPath);
      }
    } catch (error) {
      this.logger.warn('Failed to delete workflow generation queue file', {
        path: relativePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
      this.logger.info('[WorkflowGenerate] Processing request', {
        requestId: request.requestId,
        threadId: request.threadId,
        attempt: request.attempt,
        allowCode: request.allowCode,
        promptPreview: request.prompt.slice(0, 120),
      });
      this.writeProgress(request.requestId, 'queued', {
        message: 'Picked up request…',
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
      });

      const provider = this.createProvider(request.modelOverride);

      this.writeProgress(request.requestId, 'generating', {
        message: 'Generating workflow…',
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        attempt: 1,
      });
      const initialPrompt = buildGenerationPrompt(request);
      const initial = await this.parseModelJsonOrThrow(initialPrompt, provider);
      this.logger.debug('[WorkflowGenerate] Initial model response parsed', {
        requestId: request.requestId,
        rawJsonLength: initial.rawJson.length,
      });

      if (this.tryWriteClarificationResult(request.requestId, initial.parsed).wrote) return;

      let parsed = initial.parsed;
      let lastRawJson = initial.rawJson;
      let validationErrors: string[] = [];

      for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt++) {
        const validated = this.tryValidateAndWriteWorkflow(request, parsed);
        if (validated.ok) return;

        validationErrors = validated.errors;
        this.logger.debug('[WorkflowGenerate] Validation failed', {
          requestId: request.requestId,
          attempt,
          errors: validationErrors,
        });
        if (attempt >= DEFAULT_MAX_ATTEMPTS) break;

        this.writeProgress(request.requestId, 'repairing', {
          message: `Fixing validation issues (attempt ${attempt + 1}/${DEFAULT_MAX_ATTEMPTS})…`,
          attempt: attempt + 1,
          maxAttempts: DEFAULT_MAX_ATTEMPTS,
        });
        const repairPrompt = buildRepairPrompt({ errors: validationErrors, lastJson: lastRawJson });
        const repaired = await this.parseModelJsonOrThrow(repairPrompt, provider);
        parsed = repaired.parsed;
        lastRawJson = repaired.rawJson;
        this.logger.debug('[WorkflowGenerate] Repair response parsed', {
          requestId: request.requestId,
          attempt: attempt + 1,
          rawJsonLength: lastRawJson.length,
        });

        if (this.tryWriteClarificationResult(request.requestId, parsed).wrote) return;
      }

      this.writeFailedResult(request.requestId, validationErrors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to process workflow generation queue file', {
        path: relativePath,
        error: message,
      });

      const requestId = this.getRequestIdFromPath(relativePath);
      writeResultFile(this.vaultPath, { requestId, status: 'failed', error: message });
    } finally {
      // Always attempt to delete the queue file so we don't get stuck in a loop.
      this.deleteQueueFileBestEffort(fullPath, relativePath);

      this.processingFiles.delete(relativePath);
    }
  }

  async scanQueue(): Promise<void> {
    const queuePath = join(this.vaultPath, WORKFLOW_GENERATE_QUEUE_DIR);
    if (!existsSync(queuePath)) {
      return;
    }

    const files = readdirSync(queuePath).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const relativePath = `${WORKFLOW_GENERATE_QUEUE_DIR}/${file}`;
      await this.processQueueFile(relativePath);
    }
  }
}
