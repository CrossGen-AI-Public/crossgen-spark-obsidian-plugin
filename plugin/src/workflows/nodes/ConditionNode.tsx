/**
 * ConditionNode - Conditional branching step
 */

import type { ConditionNodeData, StepStatus } from '../types';
import { ConditionHandles, StatusIcon } from './shared';

interface ConditionNodeProps {
	data: { type: 'condition'; executionStatus?: StepStatus } & ConditionNodeData;
	selected?: boolean;
}

export function ConditionNode({ data, selected }: ConditionNodeProps) {
	return (
		<div className={`spark-workflow-node spark-workflow-node-condition ${selected ? 'selected' : ''}`}>
			<ConditionHandles />
			<StatusIcon status={data.executionStatus} />
			<div className="spark-workflow-node-icon">◇</div>
			<div className="spark-workflow-node-content">
				<div className="spark-workflow-node-label">{data.label}</div>
				{data.description && (
					<div className="spark-workflow-node-description">{data.description}</div>
				)}
				{data.expression && (
					<div className="spark-workflow-node-preview spark-workflow-node-code-preview">
						{data.expression.substring(0, 40)}
						{data.expression.length > 40 ? '...' : ''}
					</div>
				)}
				{data.maxCycles > 0 && (
					<div className="spark-workflow-node-badge spark-workflow-node-badge-info">max {data.maxCycles} cycles</div>
				)}
			</div>
		</div>
	);
}


