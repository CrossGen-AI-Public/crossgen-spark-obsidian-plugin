/**
 * ActionNode - Placeholder node before type is selected
 */

import type { ActionNodeData, StepStatus } from '../types';
import { NodeHandles, StatusIcon } from './shared';

interface ActionNodeProps {
	data: { type: 'action'; executionStatus?: StepStatus } & ActionNodeData;
	selected?: boolean;
}

export function ActionNode({ data, selected }: ActionNodeProps) {
	return (
		<div className={`spark-workflow-node spark-workflow-node-action ${selected ? 'selected' : ''}`}>
			<NodeHandles />
			<StatusIcon status={data.executionStatus} />
			<div className="spark-workflow-node-icon">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
				</svg>
			</div>
			<div className="spark-workflow-node-content">
				<div className="spark-workflow-node-label">{data.label || 'Action'}</div>
				<div className="spark-workflow-node-subtitle">Select an action</div>
			</div>
		</div>
	);
}
