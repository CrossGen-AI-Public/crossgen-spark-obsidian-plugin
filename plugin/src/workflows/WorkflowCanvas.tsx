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
	type Node,
	Panel,
	MarkerType,
	SelectionMode,
} from '@xyflow/react';

import type { ISparkPlugin } from '../types';
import {
	type WorkflowDefinition,
	type WorkflowNode,
	type WorkflowNodeData,
	type WorkflowEdge,
	type WorkflowRun,
	type StepStatus,
	generateId,
	createEmptyWorkflow,
} from './types';
import { ActionNode } from './nodes/ActionNode';
import { PromptNode } from './nodes/PromptNode';
import { CodeNode } from './nodes/CodeNode';
import { ConditionNode } from './nodes/ConditionNode';
import { FileNode } from './nodes/FileNode';
import { Sidebar } from './Sidebar';
import { WorkflowRunsSidebar } from './WorkflowRunsSidebar';
import { WorkflowChat } from './WorkflowChat';
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
	file: FileNode,
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
		timeoutRef.current = setTimeout(() => {
			void (async () => {
				const workflowToSave: WorkflowDefinition = {
					...workflow,
					nodes,
					edges,
					updated: new Date().toISOString(),
				};
				await storageRef.current.saveWorkflow(workflowToSave);
				lastSavedRef.current = snapshot;
				onWorkflowChange(workflowToSave);
			})();
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

export function WorkflowCanvas(props: Readonly<WorkflowCanvasProps>) {
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
}: Readonly<WorkflowCanvasProps>) {
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
					void reactFlowInstance.fitView({ duration: 0 });
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

	// React Flow state
	const [nodes, setNodes, onNodesChange] = useNodesState(workflow.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(workflow.edges.map(ensureEdgeClassName));

	// UI state - store ID only, derive node from nodes array to stay in sync
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [sidebarMode, setSidebarMode] = useState<'node' | 'workflowRuns' | 'chat' | null>(null);

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
			setSidebarMode('node');
			// Center on the initial node
			setTimeout(() => {
				void reactFlowInstance.setCenter(nodes[0].position.x + 100, nodes[0].position.y + 40, {
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
		? (nodes.find((n) => n.id === selectedNodeId)) ?? null
		: null;

	// Clear selection if selected node was deleted (e.g., via keyboard delete)
	useEffect(() => {
		if (selectedNodeId && !nodes.some((n) => n.id === selectedNodeId)) {
			setSelectedNodeId(null);
			if (sidebarMode === 'node') {
				setSidebarMode(null);
			}
		}
	}, [nodes, selectedNodeId, sidebarMode]);

	/**
	 * Handle selection changes (box select, shift+click multi-select)
	 * Close sidebar when multiple nodes selected since we can only edit one
	 */
	const onSelectionChange = useCallback(
		({ nodes: selectedNodes }: { nodes: WorkflowNode[] }) => {
			if (selectedNodes.length === 1) {
				// Single node selected - show in sidebar
				setSelectedNodeId(selectedNodes[0].id);
				setSidebarMode('node');
			} else if (selectedNodes.length > 1) {
				// Multiple nodes selected - close sidebar
				setSelectedNodeId(null);
				setSidebarMode(null);
			}
			// Note: when 0 nodes selected, onPaneClick handles it
		},
		[]
	);

	const [runs, setRuns] = useState<WorkflowRun[]>([]);
	const [isRunning, setIsRunning] = useState(false);

	// Storage ref
	const storageRef = useRef<WorkflowStorage>(new WorkflowStorage(app));

	/**
	 * Load workflow runs history
	 */
	const loadRuns = useCallback(async () => {
		const workflowRuns = await storageRef.current.loadRuns(workflow.id);
		setRuns(workflowRuns);
	}, [workflow.id]);

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
			nodes: nodes,
			edges: edges,
			updated: new Date().toISOString(),
		};
		setWorkflow(updatedWorkflow);
	}, [nodes, edges]);

	// Load runs when workflow changes
	useEffect(() => {
		if (workflow.id) {
			loadRuns().catch(() => { });
		}
	}, [workflow.id, loadRuns]);

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
	const onNodeClick = useCallback((_event: React.MouseEvent, node: Node<WorkflowNodeData>) => {
		setSelectedNodeId(node.id);
		setSidebarMode('node');
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
			void reactFlowInstance.setViewport({ x: targetX, y: targetY, zoom }, { duration: 300 });
		}
	}, [reactFlowInstance]);

	const jumpToNode = useCallback(
		(nodeId: string) => {
			const targetNode = (nodes as unknown as WorkflowNode[]).find((n) => n.id === nodeId);
			if (!targetNode) return;

			setSelectedNodeId(nodeId);
			setSidebarMode('node');

			const zoom = reactFlowInstance.getZoom();
			const { x: viewX, y: viewY } = reactFlowInstance.getViewport();
			const container = containerRef.current;
			if (!container) return;
			const { width, height } = container.getBoundingClientRect();
			const availableWidth = width - sidebarWidthRef.current;
			const targetX = -targetNode.position.x * zoom + availableWidth / 2 - 50 * zoom;
			const targetY = -targetNode.position.y * zoom + height / 2 - 20 * zoom;
			if (Math.abs(targetX - viewX) > 50 || Math.abs(targetY - viewY) > 50) {
				void reactFlowInstance.setViewport({ x: targetX, y: targetY, zoom }, { duration: 300 });
			}
		},
		[nodes, reactFlowInstance]
	);

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
		// Keep workflow-level panels (Runs, Chat) open when active.
		if (sidebarMode === 'node') {
			setSidebarMode(null);
		}
	}, [sidebarMode]);

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

			const onUp = () => {
				if (!isResizingRef.current) return;
				isResizingRef.current = false;
				resizeStartRef.current = null;
				globalThis.removeEventListener('pointermove', onMove);
				globalThis.removeEventListener('pointerup', onUp);

				plugin.settings.workflowSidebarWidth = sidebarWidthRef.current;
				void plugin.saveSettings();
			};

			globalThis.addEventListener('pointermove', onMove);
			globalThis.addEventListener('pointerup', onUp);
		},
		[plugin]
	);

	/**
	 * Update node data
	 */
	const updateNode = useCallback(
		(nodeId: string, data: Partial<WorkflowNode['data']>) => {
			setNodes(
				(nds) =>
					nds.map((node) => {
						if (node.id === nodeId) {
							return {
								...node,
								data: { ...node.data, ...data },
							};
						}
						return node;
					}) as WorkflowNode[]
			);
		},
		[setNodes]
	);

	/**
	 * Transform a node to a different type (action -> prompt/code/condition)
	 */
	const transformNode = useCallback(
		(nodeId: string, newType: 'prompt' | 'code' | 'condition', newData: WorkflowNode['data']) => {
			setNodes(
				(nds) =>
					nds.map((node) => {
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
				if (sidebarMode === 'node') {
					setSidebarMode(null);
				}
			}
		},
		[setNodes, setEdges, selectedNodeId, sidebarMode]
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

			setNodes((nds) => [...nds, newNode]);

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
			setSidebarMode('node');

			// Center viewport on the new node
			setTimeout(() => {
				void reactFlowInstance.setCenter(position.x + 100, position.y + 40, {
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
	 * Check if a drag event contains a file from Obsidian's file explorer
	 */
	const isObsidianFileDrag = useCallback((event: React.DragEvent): boolean => {
		// Obsidian sets 'text/plain' with the file path when dragging from file explorer
		return event.dataTransfer.types.includes('text/plain');
	}, []);

	/**
	 * Extract file path from Obsidian drag event
	 */
	const extractFilePath = useCallback((event: React.DragEvent): string | null => {
		const data = event.dataTransfer.getData('text/plain');
		if (!data) return null;

		// Obsidian sends obsidian:// URL scheme
		// Format: obsidian://open?vault=vault-name&file=path%2Fto%2Ffile
		if (data.startsWith('obsidian://')) {
			try {
				const url = new URL(data);
				const filePath = url.searchParams.get('file');
				if (!filePath) return null;
				// URL-decode the path and add .md extension if needed
				const decoded = decodeURIComponent(filePath);
				return decoded.endsWith('.md') ? decoded : `${decoded}.md`;
			} catch {
				return null;
			}
		}

		// Fallback: plain path (must be .md)
		if (!data.endsWith('.md')) return null;
		return data;
	}, []);

	/**
	 * Handle drag over canvas - show drop feedback for valid files
	 */
	const onDragOver = useCallback(
		(event: React.DragEvent) => {
			if (isObsidianFileDrag(event)) {
				event.preventDefault();
				event.dataTransfer.dropEffect = 'copy';
			}
		},
		[isObsidianFileDrag]
	);

	/**
	 * Handle file drop on canvas - create file node
	 */
	const onDrop = useCallback(
		(event: React.DragEvent) => {
			event.preventDefault();

			const path = extractFilePath(event);
			if (!path) return;

			// Convert screen coordinates to flow coordinates
			const position = reactFlowInstance.screenToFlowPosition({
				x: event.clientX,
				y: event.clientY,
			});

			// Offset to center the node on the drop point
			position.x -= 75;
			position.y -= 30;

			// Get file metadata from vault
			const file = app.vault.getAbstractFileByPath(path);
			const stat = file && 'stat' in file ? (file as { stat: { mtime: number; size: number } }).stat : null;

			// Create file node
			const newNode: WorkflowNode = {
				id: generateId('file'),
				type: 'file',
				position,
				data: {
					type: 'file',
					label: path.split('/').pop() || path,
					path,
					lastModified: stat?.mtime || Date.now(),
					fileSize: stat?.size || 0,
				},
			};

			setNodes((nds) => [...nds, newNode]);

			// Select the new node
			setSelectedNodeId(newNode.id);
			setSidebarMode('node');
		},
		[app, extractFilePath, reactFlowInstance, setNodes]
	);

	/**
	 * Handle double-click on file nodes - open file in Obsidian
	 */
	const onNodeDoubleClick = useCallback(
		(_event: React.MouseEvent, node: WorkflowNode) => {
			if (node.type !== 'file') return;

			const fileData = node.data as { path?: string };
			if (!fileData.path) return;

			// Open the file in Obsidian
			const file = app.vault.getAbstractFileByPath(fileData.path);
			if (file && 'extension' in file) {
				// openLinkText will focus existing tab or open new one
				void app.workspace.openLinkText(fileData.path, '', false);
			}
		},
		[app]
	);

	/**
	 * Save workflow immediately (used before running)
	 */
	const saveWorkflowNow = useCallback(async () => {
		const workflowToSave: WorkflowDefinition = {
			...workflow,
			nodes: nodes,
			edges: edges,
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

	/**
	 * Keep runs in sync when a run is queued elsewhere (e.g. workflow list).
	 * We only poll while a sidebar is open and the editor isn't already polling a known run.
	 */
	useEffect(() => {
		if (!workflow.id) return;
		if (sidebarMode === null) return;
		if (currentRunId && isRunning) return;

		const interval = globalThis.setInterval(() => {
			loadRuns().catch(() => { });
		}, 1000);

		return () => globalThis.clearInterval(interval);
	}, [workflow.id, sidebarMode, currentRunId, isRunning, loadRuns]);

	// Poll for run completion when we have an active run
	useEffect(() => {
		if (!currentRunId || !isRunning) return;

		// Mark all nodes as pending when run starts
		const pendingStatus: Record<string, StepStatus> = {};
		nodes.forEach((n) => {
			pendingStatus[n.id] = 'pending';
		});
		setNodeExecutionStatus(pendingStatus);

		const pollInterval = setInterval(() => {
			void (async () => {
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
			})();
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

		// Queue for engine execution
		const runId = generateId('run');
		await storageRef.current.queueWorkflow(workflow.id, runId);

		// Set current run to trigger polling
		setCurrentRunId(runId);
	}, [workflow.id, saveWorkflowNow]);

	const openWorkflowRuns = useCallback(() => {
		setSelectedNodeId(null);
		setSidebarMode((mode) => (mode === 'workflowRuns' ? null : 'workflowRuns'));
	}, []);

	const openChat = useCallback(() => {
		setSidebarMode((mode) => (mode === 'chat' ? null : 'chat'));
	}, []);

	/**
	 * Update workflow name
	 */
	const updateWorkflowName = useCallback((name: string) => {
		setWorkflow((w) => ({ ...w, name, updated: new Date().toISOString() }));
	}, []);

	// Memoize proOptions to avoid re-renders
	const proOptions = useMemo(() => ({ hideAttribution: true }), []);

	// Compute which file nodes have incoming edges (write mode)
	const fileNodesWithIncoming = useMemo(() => {
		const result = new Set<string>();
		for (const edge of edges) {
			const targetNode = nodes.find((n) => n.id === edge.target);
			if (targetNode?.type === 'file') {
				// Check if source is a non-file node (prompt, code, etc.)
				const sourceNode = nodes.find((n) => n.id === edge.source);
				if (sourceNode && sourceNode.type !== 'file') {
					result.add(edge.target);
				}
			}
		}
		return result;
	}, [nodes, edges]);

	// Add execution status and hasIncoming to nodes for rendering
	const nodesWithStatus = useMemo(() => {
		return nodes.map((node) => ({
			...node,
			data: {
				...node.data,
				executionStatus: nodeExecutionStatus[node.id] as StepStatus | undefined,
				// Add hasIncoming for file nodes
				...(node.type === 'file' ? { hasIncoming: fileNodesWithIncoming.has(node.id) } : {}),
			},
		}));
	}, [nodes, nodeExecutionStatus, fileNodesWithIncoming]);

	// Ensure edges have className derived from label AND execution status
	const edgesWithClassName = useMemo(() => {
		return edges.map((edge) => {
			const workflowEdge = edge;
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
			// Explicitly set markerEnd to ensure consistent arrow sizes
			return {
				...workflowEdge,
				className,
				animated: !isExecuted,
				markerEnd: {
					type: MarkerType.ArrowClosed,
					width: 20,
					height: 20,
				},
			};
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
				onNodeDoubleClick={onNodeDoubleClick}
				onPaneClick={onPaneClick}
				onSelectionChange={onSelectionChange}
				onDragOver={onDragOver}
				onDrop={onDrop}
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
						className={`spark-workflow-icon-btn${sidebarMode === 'workflowRuns' ? ' spark-workflow-icon-btn-active' : ''}`}
						onClick={openWorkflowRuns}
						title="Run history"
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
							<path d="M3 3v5h5" />
							<path d="M3.05 13a9 9 0 1 0 .5-4.5L3 8" />
							<path d="M12 7v5l4 2" />
						</svg>
					</button>
					<button
						type="button"
						className={`spark-workflow-icon-btn${sidebarMode === 'chat' ? ' spark-workflow-icon-btn-active' : ''}`}
						onClick={openChat}
						title="Workflow Chat"
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
							<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
						</svg>
					</button>
					<button
						type="button"
						className={`spark-workflow-icon-btn spark-workflow-icon-btn-primary${isRunning ? ' spark-workflow-icon-btn-running' : ''}`}
						onClick={() => void runWorkflow()}
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
			{(sidebarMode === 'workflowRuns' || sidebarMode === 'chat' || (sidebarMode === 'node' && selectedNode)) && (
				<div className="spark-workflow-sidebar-wrapper" style={{ width: `${sidebarWidth}px` }}>
					<hr className="spark-workflow-sidebar-resizer" aria-label="Resize sidebar" onPointerDown={handleSidebarResizePointerDown} />
					{sidebarMode === 'node' && selectedNode && (
						<Sidebar
							app={app}
							plugin={plugin}
							node={selectedNode}
							nodes={nodes}
							edges={edges}
							runs={runs.filter((r) => r.stepResults.some((s) => s.nodeId === selectedNode.id))}
							onUpdateNode={updateNode}
							onTransformNode={transformNode}
							onDeleteNode={deleteNode}
							onClose={() => {
								setSelectedNodeId(null);
								setSidebarMode(null);
							}}
						/>
					)}

					{sidebarMode === 'workflowRuns' && (
						<WorkflowRunsSidebar
							app={app}
							workflow={workflow}
							runs={runs}
							onRerun={runWorkflow}
							onDeleteRun={async (runId) => {
								await storageRef.current.deleteRun(workflow.id, runId);
								await loadRuns();
							}}
							onJumpToNode={jumpToNode}
							onClose={() => setSidebarMode(null)}
						/>
					)}

					{sidebarMode === 'chat' && (
						<WorkflowChat
							app={app}
							plugin={plugin}
							workflow={workflow}
							selectedNodeId={selectedNodeId}
							runs={runs}
							onWorkflowUpdate={(updatedWorkflow) => {
								// Apply the updated workflow from chat
								setNodes(updatedWorkflow.nodes);
								setEdges(updatedWorkflow.edges.map(ensureEdgeClassName));
								setWorkflow(updatedWorkflow);
								onWorkflowChange(updatedWorkflow);
							}}
							onClose={() => setSidebarMode(null)}
						/>
					)}
				</div>
			)}
		</div>
	);
}


