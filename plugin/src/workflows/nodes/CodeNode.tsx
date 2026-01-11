/**
 * CodeNode - JavaScript code execution step
 */

import type { CodeNodeData, StepStatus } from '../types';
import { NodeHandles, StatusIcon } from './shared';

interface CodeNodeProps {
	data: { type: 'code'; executionStatus?: StepStatus } & CodeNodeData;
	selected?: boolean;
}

export function CodeNode({ data, selected }: CodeNodeProps) {
	return (
		<div className={`spark-workflow-node spark-workflow-node-code ${selected ? 'selected' : ''}`}>
			<NodeHandles />
			<StatusIcon status={data.executionStatus} />
			<div className="spark-workflow-node-icon">{'</>'}</div>
			<div className="spark-workflow-node-content">
				<div className="spark-workflow-node-label">{data.label}</div>
				{data.description && (
					<div className="spark-workflow-node-description">{data.description}</div>
				)}
				{data.code && (
					<div className="spark-workflow-node-preview spark-workflow-node-code-preview">
						{data.code.substring(0, 50)}
						{data.code.length > 50 ? '...' : ''}
					</div>
				)}
			</div>
		</div>
	);
}


