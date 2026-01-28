/**
 * FileNode - File node that can read from or write to files
 * - Read mode (source): Provides file content to connected downstream nodes
 * - Write mode (target): Receives output from upstream nodes and writes to file
 */

import type { FileNodeData, StepStatus } from '../types';
import { BidirectionalHandles, StatusIcon } from './shared';

interface FileNodeProps {
	data: {
		type: 'file';
		executionStatus?: StepStatus;
		fileExists?: boolean;
		hasIncoming?: boolean; // True when node has incoming edges (write mode)
	} & FileNodeData;
	selected?: boolean;
}

/**
 * Extract filename and folder path from full path
 */
function parsePath(path: string): { filename: string; folder: string } {
	const parts = path.split('/');
	const filename = parts.pop() || path;
	const folder = parts.join('/');
	return { filename, folder };
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileNode({ data, selected }: FileNodeProps) {
	const { filename, folder } = parsePath(data.path);
	const fileExists = data.fileExists !== false; // Default to true if not set
	const isWriteMode = data.hasIncoming === true;

	return (
		<div
			className={`spark-workflow-node spark-workflow-node-file ${selected ? 'selected' : ''} ${!fileExists && !isWriteMode ? 'spark-workflow-node-error' : ''} ${isWriteMode ? 'spark-workflow-node-file-write' : ''}`}
		>
			<BidirectionalHandles />
			<StatusIcon status={data.executionStatus} />
			<div className="spark-workflow-node-icon">{isWriteMode ? '📝' : '📄'}</div>
			<div className="spark-workflow-node-content">
				<div className="spark-workflow-node-label" title={data.path}>
					{filename}
				</div>
				{folder && (
					<div className="spark-workflow-node-path" title={folder}>
						{folder}
					</div>
				)}
				{!fileExists && !isWriteMode && (
					<div className="spark-workflow-node-error-text">File not found</div>
				)}
				{isWriteMode && (
					<div className="spark-workflow-node-badges">
						<span className="spark-workflow-node-badge spark-workflow-node-badge-write">
							Write
						</span>
					</div>
				)}
				{!isWriteMode && fileExists && data.fileSize !== undefined && (
					<div className="spark-workflow-node-subtitle">{formatFileSize(data.fileSize)}</div>
				)}
			</div>
		</div>
	);
}
