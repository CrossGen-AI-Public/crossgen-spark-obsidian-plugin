/**
 * PromptNode - AI prompt step with optional @agent mention
 */

import type { PromptNodeData, StepStatus } from '../types';
import { NodeHandles, StatusIcon } from './shared';

interface PromptNodeProps {
	data: { type: 'prompt'; executionStatus?: StepStatus } & PromptNodeData;
	selected?: boolean;
}

/**
 * Extract @agent mention from prompt text
 */
function extractAgent(prompt: string): string | null {
	const match = prompt.match(/(?:^|\s)@([\w-]+)(?!\.\w)/);
	return match ? match[1] : null;
}

export function PromptNode({ data, selected }: PromptNodeProps) {
	const agentId = extractAgent(data.prompt || '');
	const hasAgent = !!agentId;

	return (
		<div className={`spark-workflow-node spark-workflow-node-prompt ${selected ? 'selected' : ''}`}>
			<NodeHandles />
			<StatusIcon status={data.executionStatus} />
			<div className="spark-workflow-node-icon">{hasAgent ? '🤖' : '💬'}</div>
			<div className="spark-workflow-node-content">
				<div className="spark-workflow-node-label">{data.label}</div>
				<div className="spark-workflow-node-badges">
					{hasAgent && (
						<div className="spark-workflow-node-badge spark-workflow-node-badge-agent">@{agentId}</div>
					)}
					{data.structuredOutput && (
						<div className="spark-workflow-node-badge spark-workflow-node-badge-format">JSON</div>
					)}
				</div>
				{data.description && (
					<div className="spark-workflow-node-description">{data.description}</div>
				)}
				{data.prompt && (
					<div className="spark-workflow-node-preview">
						{data.prompt.substring(0, 50)}
						{data.prompt.length > 50 ? '...' : ''}
					</div>
				)}
			</div>
		</div>
	);
}


