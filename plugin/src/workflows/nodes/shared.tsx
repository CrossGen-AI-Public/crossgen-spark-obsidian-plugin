/**
 * Shared components for workflow nodes
 */

import { Handle, Position } from '@xyflow/react';
import type { StepStatus } from '../types';

/**
 * Spinning loader SVG for running status
 */
function SpinnerIcon() {
	return (
		<svg
			className="spark-workflow-spinner"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<circle
				cx="8"
				cy="8"
				r="6"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeDasharray="28"
				strokeDashoffset="8"
			/>
		</svg>
	);
}

/**
 * Status icon showing execution state
 */
export function StatusIcon({ status }: { status?: StepStatus }) {
	if (!status) return null;

	// Running status gets a special animated spinner
	if (status === 'running') {
		return (
			<div className="spark-workflow-node-status status-running">
				<SpinnerIcon />
			</div>
		);
	}

	const icons: Record<Exclude<StepStatus, 'running'>, { icon: string; className: string }> = {
		pending: { icon: '○', className: 'status-pending' },
		completed: { icon: '✓', className: 'status-completed' },
		failed: { icon: '✗', className: 'status-failed' },
		skipped: { icon: '−', className: 'status-skipped' },
	};

	const { icon, className } = icons[status] || { icon: '', className: '' };
	return <div className={`spark-workflow-node-status ${className}`}>{icon}</div>;
}

/**
 * Multi-directional handles for nodes
 * Each side has both input (target) and output (source) handles
 * allowing full flexibility in connection direction
 */
export function NodeHandles() {
	return (
		<>
			{/* Left side - both input and output */}
			<Handle
				type="target"
				position={Position.Left}
				id="left-in"
				className="spark-workflow-handle"
			/>
			<Handle
				type="source"
				position={Position.Left}
				id="left-out"
				className="spark-workflow-handle"
			/>

			{/* Right side - both input and output */}
			<Handle
				type="target"
				position={Position.Right}
				id="right-in"
				className="spark-workflow-handle"
			/>
			<Handle
				type="source"
				position={Position.Right}
				id="right-out"
				className="spark-workflow-handle"
			/>

			{/* Top side - both input and output */}
			<Handle
				type="target"
				position={Position.Top}
				id="top-in"
				className="spark-workflow-handle spark-workflow-handle-secondary"
			/>
			<Handle
				type="source"
				position={Position.Top}
				id="top-out"
				className="spark-workflow-handle spark-workflow-handle-secondary"
			/>

			{/* Bottom side - both input and output */}
			<Handle
				type="target"
				position={Position.Bottom}
				id="bottom-in"
				className="spark-workflow-handle spark-workflow-handle-secondary"
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				id="bottom-out"
				className="spark-workflow-handle spark-workflow-handle-secondary"
			/>
		</>
	);
}

/**
 * Handles for condition nodes with true/false branches
 * Inputs on left/top/bottom, true/false outputs on right
 */
export function ConditionHandles() {
	return (
		<>
			{/* Input handles (no right - that's for true/false outputs) */}
			<Handle
				type="target"
				position={Position.Left}
				id="left-in"
				className="spark-workflow-handle"
			/>
			<Handle
				type="target"
				position={Position.Top}
				id="top-in"
				className="spark-workflow-handle spark-workflow-handle-secondary"
			/>
			<Handle
				type="target"
				position={Position.Bottom}
				id="bottom-in"
				className="spark-workflow-handle spark-workflow-handle-secondary"
			/>

			{/* True branch output (green) with label */}
			<div className="spark-workflow-handle-label spark-workflow-handle-label-true" style={{ top: '30%' }}>
				T
			</div>
			<Handle
				type="source"
				position={Position.Right}
				id="true"
				className="spark-workflow-handle spark-workflow-handle-true"
				style={{ top: '30%' }}
			/>

			{/* False branch output (red) with label */}
			<div className="spark-workflow-handle-label spark-workflow-handle-label-false" style={{ top: '70%' }}>
				F
			</div>
			<Handle
				type="source"
				position={Position.Right}
				id="false"
				className="spark-workflow-handle spark-workflow-handle-false"
				style={{ top: '70%' }}
			/>
		</>
	);
}
