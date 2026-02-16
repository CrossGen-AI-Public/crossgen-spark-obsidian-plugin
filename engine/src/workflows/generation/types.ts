export type WorkflowGenerateSource = 'workflow-ui';
export type WorkflowGenerateTarget = 'new-workflow';

export interface WorkflowGenerateRequest {
  requestId: string;
  timestamp: number;
  source: WorkflowGenerateSource;
  target: WorkflowGenerateTarget;
  prompt: string;
  allowCode: boolean;
  threadId?: string;
  attempt?: number;
  clarifications?: string;
  modelOverride?: string;
}

export type WorkflowGenerateProgressStage =
  | 'queued'
  | 'generating'
  | 'validating'
  | 'repairing'
  | 'layout'
  | 'writing';

export type WorkflowGenerateResult =
  | {
      requestId: string;
      status: 'processing';
      stage: WorkflowGenerateProgressStage;
      progress?: number; // 0-100
      message?: string;
      attempt?: number;
      maxAttempts?: number;
      updatedAt: number;
    }
  | {
      requestId: string;
      status: 'completed';
      workflowId: string;
      workflowName?: string;
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

export interface WorkflowGenerateClarificationResponse {
  status: 'needs_clarification';
  questions: string[];
}
