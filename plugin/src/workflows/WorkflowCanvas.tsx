/**
 * WorkflowCanvas - Main React Flow canvas component
 */

import type { App } from 'obsidian';
import { useCallback, useState, useMemo, useRef, useEffect, type MutableRefObject } from 'react';
import {
	ReactFlow,
	Background,
	Controls,
	MiniMap,
	addEdge,
	useNodesState,
	useEdgesState,
	useReactFlow,
	ReactFlowProvider,
	type Connection,
	type NodeTypes,
	type OnConnect,
	Panel,
	MarkerType,
	SelectionMode,
} from '@xyflow/react';

import type { ISparkPlugin } from '../types';
import {
	type WorkflowDefinition,
	type WorkflowNode,
	type WorkflowEdge,
	type WorkflowRun,
	type WorkflowNodeData,
	type StepStatus,
	generateId,
	createEmptyWorkflow,
} from './types';
import { ActionNode } from './nodes/ActionNode';
import { PromptNode } from './nodes/PromptNode';
import { CodeNode } from './nodes/CodeNode';
import { ConditionNode } from './nodes/ConditionNode';
import { Sidebar } from './Sidebar';
import { WorkflowStorage } from './WorkflowStorage';

interface WorkflowCanvasProps {
	app: App;
	plugin: ISparkPlugin;
	workflow: WorkflowDefinition | null;
	onWorkflowChange: (workflow: WorkflowDefinition) => void;
	onNavigateToList?: () => void;
}

const WORKFLOW_SIDEBAR_MIN_WIDTH = 320;
const WORKFLOW_SIDEBAR_MAX_WIDTH = 900;

// Define custom node types - use 'as unknown as NodeTypes' to bypass strict typing
// React Flow's generic typing doesn't play well with discriminated union data types
const nodeTypes = {
	action: ActionNode,
	prompt: PromptNode,
	code: CodeNode,
	condition: ConditionNode,
} as unknown as NodeTypes;

// Auto-save debounce delay in milliseconds
const AUTO_SAVE_DELAY = 1000;

/**
 * Custom hook for debounced auto-save
 */
function useAutoSave(
	workflow: WorkflowDefinition,
	nodes: WorkflowNode[],
	edges: WorkflowEdge[],
	storageRef: MutableRefObject<WorkflowStorage>,
	onWorkflowChange: (workflow: WorkflowDefinition) => void
) {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastSavedRef = useRef<string>('');

	useEffect(() => {
		// Create a snapshot to compare for changes
		const snapshot = JSON.stringify({ nodes, edges, name: workflow.name });

		// Skip if nothing changed since last save
		if (snapshot === lastSavedRef.current) return;

		// Clear existing timeout
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
		}

		// Debounced save
		timeoutRef.current = setTimeout(async () => {
			const workflowToSave: WorkflowDefinition = {
				...workflow,
				nodes,
				edges,
				updated: new Date().toISOString(),
			};
			await storageRef.current.saveWorkflow(workflowToSave);
			lastSavedRef.current = snapshot;
			onWorkflowChange(workflowToSave);
		}, AUTO_SAVE_DELAY);

		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [workflow.id, workflow.name, nodes, edges, storageRef, onWorkflowChange]);
}

// Default edge options - use smoothstep for cleaner routing around nodes
const defaultEdgeOptions = {
	type: 'smoothstep' as const,
	animated: true,
	markerEnd: {
		type: MarkerType.ArrowClosed,
		width: 20,
		height: 20,
	},
	pathOptions: {
		borderRadius: 16, // Rounded corners on turns
		offset: 20, // Distance from node before turning
	},
	labelBgPadding: [6, 4] as [number, number],
	labelBgBorderRadius: 4,
};

/**
 * Ensure edges have className derived from label for styling
 */
function ensureEdgeClassName(edge: WorkflowEdge): WorkflowEdge {
	if (edge.label && !edge.className) {
		return {
			...edge,
			className: `spark-edge-${edge.label}`,
		};
	}
	return edge;
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
	return (
		<ReactFlowProvider>
			<WorkflowCanvasInner {...props} />
		</ReactFlowProvider>
	);
}

function WorkflowCanvasInner({
	app,
	plugin,
	workflow: initialWorkflow,
	onWorkflowChange,
	onNavigateToList,
}: WorkflowCanvasProps) {
	// React Flow instance for viewport control
	const reactFlowInstance = useReactFlow();

	// Ref to track our specific container (avoid DOM selector conflicts with multiple views)
	const containerRef = useRef<HTMLDivElement>(null);

	// Track if React Flow has been properly initialized with non-zero dimensions
	const hasInitializedRef = useRef(false);

	// Detect when container becomes visible (for tabs that weren't initially focused)
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const checkAndFit = () => {
			const { width, height } = container.getBoundingClientRect();
			// If we have proper dimensions and haven't initialized yet, trigger fitView
			if (width > 0 && height > 0 && !hasInitializedRef.current) {
				hasInitializedRef.current = true;
				// Small delay to ensure React Flow is ready
				setTimeout(() => {
					reactFlowInstance.fitView({ duration: 0 });
				}, 50);
			}
		};

		// Check immediately
		checkAndFit();

		// Watch for size changes (tab becomes visible)
		const resizeObserver = new ResizeObserver(checkAndFit);
		resizeObserver.observe(container);

		return () => resizeObserver.disconnect();
	}, [reactFlowInstance]);

	// Initialize workflow state
	const [workflow, setWorkflow] = useState<WorkflowDefinition>(() => {
		return initialWorkflow || createEmptyWorkflow();
	});

	// React Flow state - cast to any to work around React Flow's strict Record<string, unknown> requirement
	// Our WorkflowNodeData uses discriminated unions which don't satisfy the index signature
	// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
	const [nodes, setNodes, onNodesChange] = useNodesState(workflow.nodes as any);
	// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
	const [edges, setEdges, onEdgesChange] = useEdgesState(
		workflow.edges.map(ensureEdgeClassName) as any
	);

	// UI state - store ID only, derive node from nodes array to stay in sync
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);

	// Auto-select initial action node on empty workflow (first load)
	const hasAutoSelectedRef = useRef(false);
	// Skip onPaneClick after creating node via edge drag (they fire in sequence)
	const skipPaneClickRef = useRef(false);
	useEffect(() => {
		if (hasAutoSelectedRef.current) return;
		// Check if this is a fresh workflow with a single action node
		if (nodes.length === 1 && nodes[0].type === 'action' && !selectedNodeId) {
			hasAutoSelectedRef.current = true;
			setSelectedNodeId(nodes[0].id);
			setIsSidebarOpen(true);
			// Center on the initial node
			setTimeout(() => {
				reactFlowInstance.setCenter(nodes[0].position.x + 100, nodes[0].position.y + 40, {
					zoom: 1,
					duration: 300,
				});
			}, 100);
		}
	}, [nodes, selectedNodeId, reactFlowInstance]);
	const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
		return plugin.settings.workflowSidebarWidth ?? 440;
	});
	const sidebarWidthRef = useRef(sidebarWidth);
	useEffect(() => {
		sidebarWidthRef.current = sidebarWidth;
	}, [sidebarWidth]);
	const isResizingRef = useRef(false);
	const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

	// Derive selectedNode from nodes array to always have fresh data
	const selectedNode = selectedNodeId
		? (nodes.find((n) => n.id === selectedNodeId) as WorkflowNode | undefined) ?? null
		: null;

	// Clear selection if selected node was deleted (e.g., via keyboard delete)
	useEffect(() => {
		if (selectedNodeId && !nodes.find((n) => n.id === selectedNodeId)) {
			setSelectedNodeId(null);
			setIsSidebarOpen(false);
		}
	}, [nodes, selectedNodeId]);

	/**
	 * Handle selection changes (box select, shift+click multi-select)
	 * Close sidebar when multiple nodes selected since we can only edit one
	 */
	const onSelectionChange = useCallback(
		({ nodes: selectedNodes }: { nodes: WorkflowNode[] }) => {
			if (selectedNodes.length === 1) {
				// Single node selected - show in sidebar
				setSelectedNodeId(selectedNodes[0].id);
				setIsSidebarOpen(true);
			} else if (selectedNodes.length > 1) {
				// Multiple nodes selected - close sidebar
				setSelectedNodeId(null);
				setIsSidebarOpen(false);
			}
			// Note: when 0 nodes selected, onPaneClick handles it
		},
		[]
	);

	const [runs, setRuns] = useState<WorkflowRun[]>([]);
	const [isRunning, setIsRunning] = useState(false);

	// Storage ref
	const storageRef = useRef<WorkflowStorage>(new WorkflowStorage(app));

	// Auto-save on changes (debounced)
	useAutoSave(
		workflow,
		nodes as unknown as WorkflowNode[],
		edges as unknown as WorkflowEdge[],
		storageRef,
		onWorkflowChange
	);

	// Sync workflow state when nodes/edges change
	useEffect(() => {
		const updatedWorkflow: WorkflowDefinition = {
			...workflow,
			// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
			nodes: nodes as any as WorkflowNode[],
			// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
			edges: edges as any as WorkflowEdge[],
			updated: new Date().toISOString(),
		};
		setWorkflow(updatedWorkflow);
	}, [nodes, edges]);

	// Load runs when workflow changes
	useEffect(() => {
		if (workflow.id) {
			void loadRuns();
		}
	}, [workflow.id]);

	/**
	 * Load workflow runs history
	 */
	const loadRuns = async () => {
		const workflowRuns = await storageRef.current.loadRuns(workflow.id);
		setRuns(workflowRuns);
	};

	/**
	 * Handle new edge connections
	 */
	const onConnect: OnConnect = useCallback(
		(connection: Connection) => {
			// For condition nodes, we need to handle true/false branches
			const sourceNode = nodes.find((n) => n.id === connection.source);
			const isCondition = sourceNode?.type === 'condition';

			setEdges((currentEdges) => {
				let label: string | undefined;

				if (isCondition) {
					// Check existing edges from this condition node using CURRENT state
					const existingEdges = currentEdges.filter((e) => e.source === connection.source);
					const hasTrueEdge = existingEdges.some((e) => e.label === 'true');
					const hasFalseEdge = existingEdges.some((e) => e.label === 'false');

					if (!hasTrueEdge) {
						label = 'true';
					} else if (!hasFalseEdge) {
						label = 'false';
					}
				}

				const newEdge: WorkflowEdge = {
					...connection,
					id: generateId('edge'),
					label,
					className: label ? `spark-edge-${label}` : undefined,
				} as WorkflowEdge;

				return addEdge(newEdge, currentEdges);
			});
		},
		[nodes, setEdges]
	);

	/**
	 * Handle node selection
	 */
	// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
	const onNodeClick = useCallback((_event: React.MouseEvent, node: any) => {
		setSelectedNodeId(node.id);
		setIsSidebarOpen(true);
		// Smoothly pan to center on clicked node (no zoom change)
		// Account for sidebar: center in remaining space (left edge to sidebar)
		const zoom = reactFlowInstance.getZoom();
		const { x: viewX, y: viewY } = reactFlowInstance.getViewport();
		// Use ref instead of document.querySelector to get THIS view's container (not another tab's)
		const container = containerRef.current;
		if (!container) return;
		const { width, height } = container.getBoundingClientRect();
		// Available width is total width minus sidebar
		const availableWidth = width - sidebarWidthRef.current;
		// Calculate target viewport position to center the node in available space
		const targetX = -node.position.x * zoom + availableWidth / 2 - 50 * zoom;
		const targetY = -node.position.y * zoom + height / 2 - 20 * zoom;
		// Only pan if significantly off-center
		if (Math.abs(targetX - viewX) > 50 || Math.abs(targetY - viewY) > 50) {
			reactFlowInstance.setViewport({ x: targetX, y: targetY, zoom }, { duration: 300 });
		}
	}, [reactFlowInstance]);

	/**
	 * Handle background click to deselect
	 */
	const onPaneClick = useCallback(() => {
		// Skip if we just created a node via edge drag
		if (skipPaneClickRef.current) {
			skipPaneClickRef.current = false;
			return;
		}
		setSelectedNodeId(null);
		setIsSidebarOpen(false);
	}, []);

	const handleSidebarResizePointerDown = useCallback(
		(e: React.PointerEvent) => {
			// Only left-click/primary pointer
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();

			isResizingRef.current = true;
			resizeStartRef.current = { startX: e.clientX, startWidth: sidebarWidthRef.current };

			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

			const onMove = (ev: PointerEvent) => {
				if (!isResizingRef.current || !resizeStartRef.current) return;
				const deltaX = ev.clientX - resizeStartRef.current.startX;
				// Sidebar is on the right; dragging right should shrink, dragging left should grow.
				const next = resizeStartRef.current.startWidth - deltaX;
				const clamped = Math.max(WORKFLOW_SIDEBAR_MIN_WIDTH, Math.min(WORKFLOW_SIDEBAR_MAX_WIDTH, next));
				setSidebarWidth(clamped);
			};

			const onUp = async () => {
				if (!isResizingRef.current) return;
				isResizingRef.current = false;
				resizeStartRef.current = null;
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);

				plugin.settings.workflowSidebarWidth = sidebarWidthRef.current;
				await plugin.saveSettings();
			};

			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
		},
		[plugin]
	);

	/**
	 * Update node data
	 */
	const updateNode = useCallback(
		(nodeId: string, data: Partial<WorkflowNode['data']>) => {
			setNodes((nds) =>
				nds.map((node) => {
					if (node.id === nodeId) {
						return {
							...node,
							data: { ...node.data, ...data },
						};
					}
					return node;
				})
			);
		},
		[setNodes]
	);

	/**
	 * Transform a node to a different type (action -> prompt/code/condition)
	 */
	const transformNode = useCallback(
		(nodeId: string, newType: 'prompt' | 'code' | 'condition', newData: WorkflowNode['data']) => {
			setNodes((nds) =>
				// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
				nds.map((node): any => {
					if (node.id === nodeId) {
						return {
							...node,
							type: newType,
							data: newData,
						};
					}
					return node;
				})
			);
		},
		[setNodes]
	);

	/**
	 * Delete a node
	 */
	const deleteNode = useCallback(
		(nodeId: string) => {
			setNodes((nds) => nds.filter((node) => node.id !== nodeId));
			setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
			if (selectedNodeId === nodeId) {
				setSelectedNodeId(null);
				setIsSidebarOpen(false);
			}
		},
		[setNodes, setEdges, selectedNodeId]
	);

	/**
	 * Determine which target handle to use based on relative position
	 * If new node is to the right of source → connect to left
	 * If new node is below source → connect to top
	 * For diagonals, use the dominant direction
	 */
	const getTargetHandleFromPosition = useCallback(
		(sourcePosition: { x: number; y: number }, targetPosition: { x: number; y: number }): string => {
			const dx = targetPosition.x - sourcePosition.x;
			const dy = targetPosition.y - sourcePosition.y;

			// Compare absolute values to find dominant direction
			if (Math.abs(dx) >= Math.abs(dy)) {
				// Horizontal is dominant
				return dx >= 0 ? 'left-in' : 'right-in';
			} else {
				// Vertical is dominant
				return dy >= 0 ? 'top-in' : 'bottom-in';
			}
		},
		[]
	);

	/**
	 * Add a new action node at a specific position (placeholder until type is selected)
	 * Centers viewport on the new node
	 */
	const addNodeAtPosition = useCallback(
		(position: { x: number; y: number }, sourceNodeId?: string, sourceHandleId?: string) => {
			const newNode: WorkflowNode = {
				id: generateId('action'),
				type: 'action',
				position,
				data: {
					type: 'action',
					label: 'Action',
				},
			};

			// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
			setNodes((nds) => [...nds, newNode as any]);

			// If there's a source node, create an edge
			if (sourceNodeId) {
				const sourceNode = nodes.find((n) => n.id === sourceNodeId);
				const isCondition = sourceNode?.type === 'condition';

				// Determine target handle based on relative position
				const targetHandle = sourceNode
					? getTargetHandleFromPosition(sourceNode.position, position)
					: 'left-in';

				setEdges((currentEdges) => {
					let label: string | undefined;

					if (isCondition) {
						const existingEdges = currentEdges.filter((e) => e.source === sourceNodeId);
						const hasTrueEdge = existingEdges.some((e) => e.label === 'true');
						const hasFalseEdge = existingEdges.some((e) => e.label === 'false');

						if (!hasTrueEdge) {
							label = 'true';
						} else if (!hasFalseEdge) {
							label = 'false';
						}
					}

					const newEdge: WorkflowEdge = {
						id: generateId('edge'),
						source: sourceNodeId,
						sourceHandle: sourceHandleId, // Use the handle the user dragged from
						target: newNode.id,
						targetHandle, // Determined by relative position
						label,
						className: label ? `spark-edge-${label}` : undefined,
					};

					return [...currentEdges, newEdge];
				});
			}

			// Select the new node and open sidebar
			setSelectedNodeId(newNode.id);
			setIsSidebarOpen(true);

			// Center viewport on the new node
			setTimeout(() => {
				reactFlowInstance.setCenter(position.x + 100, position.y + 40, {
					zoom: reactFlowInstance.getZoom(),
					duration: 300,
				});
			}, 50);

			return newNode.id;
		},
		[nodes, setNodes, setEdges, reactFlowInstance, getTargetHandleFromPosition]
	);

	/**
	 * Add a new node (from toolbar button)
	 */
	const addNode = useCallback(() => {
		// Calculate position based on existing nodes
		const lastNode = nodes[nodes.length - 1];
		const position = lastNode
			? { x: lastNode.position.x + 250, y: lastNode.position.y }
			: { x: 300, y: 200 };

		addNodeAtPosition(position);
	}, [nodes, addNodeAtPosition]);

	/**
	 * Handle edge connection end - create node if dropped on empty canvas
	 */
	const onConnectEnd = useCallback(
		(
			event: MouseEvent | TouchEvent,
			connectionState: {
				fromNode?: { id: string } | null;
				toNode?: unknown;
				fromHandle?: { id?: string | null; type?: string | null } | null;
			}
		) => {
			// Only create node if the connection was started but didn't connect to an existing node
			if (!connectionState.fromNode) return;

			// If connection ended on an existing node, React Flow handles it via onConnect
			if (connectionState.toNode) return;

			// Also check DOM in case the above check doesn't work in all React Flow versions
			const target = event.target as HTMLElement;
			if (target.closest('.react-flow__node') || target.closest('.react-flow__handle')) return;

			// Get the canvas wrapper to calculate position
			const reactFlowBounds = document.querySelector('.react-flow')?.getBoundingClientRect();
			if (!reactFlowBounds) return;

			// Get client coordinates from mouse or touch event
			let clientX: number;
			let clientY: number;
			if ('changedTouches' in event) {
				clientX = event.changedTouches[0].clientX;
				clientY = event.changedTouches[0].clientY;
			} else {
				clientX = event.clientX;
				clientY = event.clientY;
			}

			// Convert screen coordinates to flow coordinates
			const position = reactFlowInstance.screenToFlowPosition({
				x: clientX,
				y: clientY,
			});

			// Offset to center the node on the drop point
			position.x -= 75;
			position.y -= 30;

			// Prevent onPaneClick from closing the sidebar (they fire in sequence)
			skipPaneClickRef.current = true;
			addNodeAtPosition(position, connectionState.fromNode.id, connectionState.fromHandle?.id ?? undefined);
		},
		[reactFlowInstance, addNodeAtPosition]
	);

	/**
	 * Save workflow immediately (used before running)
	 */
	const saveWorkflowNow = useCallback(async () => {
		const workflowToSave: WorkflowDefinition = {
			...workflow,
			// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
			nodes: nodes as any as WorkflowNode[],
			// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
			edges: edges as any as WorkflowEdge[],
			updated: new Date().toISOString(),
		};
		await storageRef.current.saveWorkflow(workflowToSave);
		setWorkflow(workflowToSave);
		onWorkflowChange(workflowToSave);
	}, [workflow, nodes, edges, onWorkflowChange]);

	// Track current run for polling
	const [currentRunId, setCurrentRunId] = useState<string | null>(null);

	// Track execution status for each node
	const [nodeExecutionStatus, setNodeExecutionStatus] = useState<Record<string, StepStatus>>({});

	// Poll for run completion when we have an active run
	useEffect(() => {
		if (!currentRunId || !isRunning) return;

		// Mark all nodes as pending when run starts
		const pendingStatus: Record<string, StepStatus> = {};
		nodes.forEach((n) => {
			pendingStatus[n.id] = 'pending';
		});
		setNodeExecutionStatus(pendingStatus);

		const pollInterval = setInterval(async () => {
			const workflowRuns = await storageRef.current.loadRuns(workflow.id);
			const currentRun = workflowRuns.find((r) => r.id === currentRunId);

			if (currentRun) {
				setRuns(workflowRuns);

				// Update node execution status from step results
				const statusMap: Record<string, StepStatus> = { ...pendingStatus };
				for (const step of currentRun.stepResults) {
					statusMap[step.nodeId] = step.status;
				}
				setNodeExecutionStatus(statusMap);

				// Check if run is finished (completed or failed)
				if (currentRun.status === 'completed' || currentRun.status === 'failed') {
					setIsRunning(false);
					setCurrentRunId(null);
				}
			}
		}, 500); // Poll every 500ms

		return () => clearInterval(pollInterval);
	}, [currentRunId, isRunning, workflow.id, nodes]);

	/**
	 * Run workflow
	 */
	const runWorkflow = useCallback(async () => {
		setIsRunning(true);

		// Save immediately before running
		await saveWorkflowNow();

		// Queue for daemon execution
		const runId = generateId('run');
		await storageRef.current.queueWorkflow(workflow.id, runId);

		// Set current run to trigger polling
		setCurrentRunId(runId);
	}, [workflow.id, saveWorkflowNow]);

	/**
	 * Update workflow name
	 */
	const updateWorkflowName = useCallback((name: string) => {
		setWorkflow((w) => ({ ...w, name, updated: new Date().toISOString() }));
	}, []);

	// Memoize proOptions to avoid re-renders
	const proOptions = useMemo(() => ({ hideAttribution: true }), []);

	// Add execution status to nodes for rendering
	const nodesWithStatus = useMemo(() => {
		return nodes.map((node) => ({
			...node,
			data: {
				...node.data,
				executionStatus: nodeExecutionStatus[node.id] as StepStatus | undefined,
			},
		}));
	}, [nodes, nodeExecutionStatus]);

	// Ensure edges have className derived from label AND execution status
	const edgesWithClassName = useMemo(() => {
		return edges.map((edge) => {
			const workflowEdge = edge as WorkflowEdge;
			let className = workflowEdge.className || '';

			// Add label-based class
			if (workflowEdge.label && !className.includes(`spark-edge-${workflowEdge.label}`)) {
				className = `${className} spark-edge-${workflowEdge.label}`.trim();
			}

			// Edge is "executed" only if:
			// - Source is completed AND target is completed/running
			// This ensures we only show the path that was actually taken
			const sourceStatus = nodeExecutionStatus[workflowEdge.source];
			const targetStatus = nodeExecutionStatus[workflowEdge.target];
			const isExecuted =
				sourceStatus === 'completed' &&
				(targetStatus === 'completed' || targetStatus === 'running');

			if (isExecuted) {
				className = `${className} spark-edge-executed`.trim();
			}

			// Animated edges for pending/not-yet-executed paths
			return { ...workflowEdge, className, animated: !isExecuted };
		});
	}, [edges, nodeExecutionStatus]);

	return (
		<div className="spark-workflow-canvas" ref={containerRef}>
			<ReactFlow
				nodes={nodesWithStatus}
				edges={edgesWithClassName}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onConnectEnd={onConnectEnd}
				onNodeClick={onNodeClick}
				onPaneClick={onPaneClick}
				onSelectionChange={onSelectionChange}
				nodeTypes={nodeTypes}
				defaultEdgeOptions={defaultEdgeOptions}
				fitView
				proOptions={proOptions}
				// Multi-select support
				selectionOnDrag
				selectionMode={SelectionMode.Partial}
				deleteKeyCode={['Backspace', 'Delete']}
				multiSelectionKeyCode="Shift"
			>
				{/* Top toolbar - left side: list button + workflow name */}
				<Panel position="top-left" className="spark-workflow-header">
					<button
						type="button"
						className="spark-workflow-icon-btn"
						onClick={onNavigateToList}
						title="All workflows"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M3 6h18" />
							<path d="M3 12h18" />
							<path d="M3 18h18" />
						</svg>
					</button>
					<input
						type="text"
						className="spark-workflow-name-input"
						value={workflow.name}
						onChange={(e) => updateWorkflowName(e.target.value)}
						placeholder="Workflow name"
					/>
				</Panel>

				{/* Top toolbar - right side: add + run buttons */}
				<Panel position="top-right" className="spark-workflow-actions">
					<button
						type="button"
						className="spark-workflow-icon-btn"
						onClick={addNode}
						title="Add Step"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M12 5v14" />
							<path d="M5 12h14" />
						</svg>
					</button>
					<button
						type="button"
						className={`spark-workflow-icon-btn spark-workflow-icon-btn-primary${isRunning ? ' spark-workflow-icon-btn-running' : ''}`}
						onClick={runWorkflow}
						disabled={isRunning}
						title={isRunning ? 'Running...' : 'Run Workflow'}
					>
						{isRunning ? (
							<svg
								className="spark-workflow-spinner"
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M21 12a9 9 0 1 1-6.219-8.56" />
							</svg>
						) : (
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polygon points="6 3 20 12 6 21 6 3" />
							</svg>
						)}
					</button>
				</Panel>

				{/* Use workflow ID as pattern ID to avoid SVG conflicts with multiple instances */}
				<Background id={`bg-${workflow.id}`} />
				<Controls />
				<MiniMap maskColor="rgba(30, 30, 30, 0.85)" />
			</ReactFlow>

			{/* Sidebar */}
			{isSidebarOpen && selectedNode && (
				<div className="spark-workflow-sidebar-wrapper" style={{ width: `${sidebarWidth}px` }}>
					<div
						className="spark-workflow-sidebar-resizer"
						role="separator"
						aria-orientation="vertical"
						aria-label="Resize sidebar"
						onPointerDown={handleSidebarResizePointerDown}
					/>
					<Sidebar
						app={app}
						plugin={plugin}
						node={selectedNode}
						// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
						nodes={nodes as any as WorkflowNode[]}
						// biome-ignore lint/suspicious/noExplicitAny: React Flow typing workaround
						edges={edges as any as WorkflowEdge[]}
						runs={runs.filter((r) =>
							r.stepResults.some((s) => s.nodeId === selectedNode.id)
						)}
						onUpdateNode={updateNode}
						onTransformNode={transformNode}
						onDeleteNode={deleteNode}
						onClose={() => {
							setIsSidebarOpen(false);
							setSelectedNodeId(null);
						}}
					/>
				</div>
			)}
		</div>
	);
}


