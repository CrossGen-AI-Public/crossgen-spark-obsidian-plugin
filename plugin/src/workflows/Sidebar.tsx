/**
 * Sidebar - Node properties, code editor, and run history
 */

import type { App } from 'obsidian';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ISparkPlugin } from '../types';
import { showConfirmModal } from '../utils/confirmModal';
import type {
	WorkflowNode,
	WorkflowEdge,
	WorkflowRun,
	StepResult,
	SidebarTab,
	PromptNodeData,
	CodeNodeData,
	ConditionNodeData,
} from './types';
import { MentionTextarea, type VariableItem } from './MentionTextarea';

interface SidebarProps {
	app: App;
	plugin: ISparkPlugin;
	node: WorkflowNode;
	nodes: WorkflowNode[];
	edges: WorkflowEdge[];
	runs: WorkflowRun[];
	onUpdateNode: (nodeId: string, data: Partial<WorkflowNode['data']>) => void;
	onTransformNode: (nodeId: string, newType: 'prompt' | 'code' | 'condition', newData: WorkflowNode['data']) => void;
	onDeleteNode: (nodeId: string) => void;
	onClose: () => void;
}

/**
 * Represents an available input variable from an upstream node
 */
interface AvailableInput {
	nodeId: string;
	nodeLabel: string;
	nodeType: string;
	/** For nodes with structured output, the parsed schema fields */
	fields?: { name: string; type: string }[];
	/** Whether this comes through a condition (pass-through) */
	viaCondition?: boolean;
}

/**
 * Parse a JSON schema example to extract field names and types
 * Handles both valid JSON examples and type keyword patterns
 */
function parseSchemaFields(schema: string): { name: string; type: string }[] {
	// First try parsing as valid JSON
	try {
		const parsed = JSON.parse(schema);
		if (typeof parsed !== 'object' || parsed === null) return [];

		return Object.entries(parsed).map(([name, value]) => ({
			name,
			type: typeof value === 'number' ? 'number'
				: typeof value === 'boolean' ? 'boolean'
					: typeof value === 'string' ? 'string'
						: Array.isArray(value) ? 'array'
							: 'object',
		}));
	} catch {
		// Try normalizing type keywords to valid JSON, preserving type info
		const typeMap: Record<string, string> = {};

		// Extract type keywords before normalization
		const typePattern = /"(\w+)":\s*(number|string|boolean|object|array|\[\])/gi;
		let match;
		while ((match = typePattern.exec(schema)) !== null) {
			typeMap[match[1]] = match[2].toLowerCase() === '[]' ? 'array' : match[2].toLowerCase();
		}

		// Normalize and parse
		let normalized = schema;
		normalized = normalized.replace(/:\s*number\b/g, ': 0');
		normalized = normalized.replace(/:\s*string\b/g, ': ""');
		normalized = normalized.replace(/:\s*boolean\b/g, ': true');
		normalized = normalized.replace(/:\s*object\b/g, ': {}');
		normalized = normalized.replace(/:\s*array\b/g, ': []');
		normalized = normalized.replace(/:\s*\[\]/g, ': []');

		try {
			const parsed = JSON.parse(normalized);
			if (typeof parsed !== 'object' || parsed === null) return [];

			return Object.entries(parsed).map(([name]) => ({
				name,
				type: typeMap[name] || 'unknown',
			}));
		} catch {
			return [];
		}
	}
}

/**
 * Find all upstream nodes that provide input to a given node
 */
function findUpstreamInputs(
	nodeId: string,
	nodes: WorkflowNode[],
	edges: WorkflowEdge[]
): AvailableInput[] {
	const inputs: AvailableInput[] = [];
	const visited = new Set<string>();

	function traceBack(currentNodeId: string, viaCondition = false) {
		if (visited.has(currentNodeId)) return;
		visited.add(currentNodeId);

		// Find edges pointing to this node
		const incomingEdges = edges.filter((e) => e.target === currentNodeId);

		for (const edge of incomingEdges) {
			const sourceNode = nodes.find((n) => n.id === edge.source);
			if (!sourceNode) continue;

			if (sourceNode.data.type === 'condition') {
				// Conditions pass through their input, trace further back
				traceBack(sourceNode.id, true);
			} else {
				// Found an actual data source
				const input: AvailableInput = {
					nodeId: sourceNode.id,
					nodeLabel: sourceNode.data.label || sourceNode.id,
					nodeType: sourceNode.data.type,
					viaCondition,
				};

				// If it's a prompt with structured output, parse the schema
				if (sourceNode.data.type === 'prompt') {
					const promptData = sourceNode.data as PromptNodeData;
					if (promptData.structuredOutput && promptData.outputSchema) {
						input.fields = parseSchemaFields(promptData.outputSchema);
					}
				}

				inputs.push(input);
			}
		}
	}

	traceBack(nodeId);
	return inputs;
}

/**
 * Action types available for selection
 */
interface ActionTypeOption {
	type: 'prompt' | 'code' | 'condition';
	label: string;
	description: string;
	icon: React.JSX.Element;
	defaultData: WorkflowNode['data'];
}

const ACTION_TYPES: ActionTypeOption[] = [
	{
		type: 'prompt',
		label: 'Prompt',
		description: 'Send a prompt to an AI agent',
		icon: (
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
			</svg>
		),
		defaultData: { type: 'prompt', label: 'Prompt', prompt: '' },
	},
	{
		type: 'code',
		label: 'Code',
		description: 'Run JavaScript code',
		icon: (
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
				<path d="m18 16 4-4-4-4" />
				<path d="m6 8-4 4 4 4" />
				<path d="m14.5 4-5 16" />
			</svg>
		),
		defaultData: { type: 'code', label: 'Code', code: '// Process input and return output\nreturn { result: input };' },
	},
	{
		type: 'condition',
		label: 'Condition',
		description: 'Branch based on a condition',
		icon: (
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
				<path d="M6 3v12" />
				<circle cx="18" cy="6" r="3" />
				<circle cx="6" cy="18" r="3" />
				<path d="M18 9a9 9 0 0 1-9 9" />
			</svg>
		),
		defaultData: { type: 'condition', label: 'Condition', expression: 'input.success === true', maxCycles: 3 },
	},
];

export function Sidebar({ app, plugin, node, nodes, edges, runs, onUpdateNode, onTransformNode, onDeleteNode, onClose }: SidebarProps) {
	const [activeTab, setActiveTab] = useState<SidebarTab>('properties');
	const [searchQuery, setSearchQuery] = useState('');

	const handleChange = useCallback(
		(field: string, value: unknown) => {
			onUpdateNode(node.id, { [field]: value });
		},
		[node.id, onUpdateNode]
	);

	const handleDelete = useCallback(async () => {
		const confirmed = await showConfirmModal(app, 'Delete this step?', {
			title: 'Delete step',
			confirmText: 'Delete',
			dangerous: true,
		});
		if (confirmed) {
			onDeleteNode(node.id);
		}
	}, [app, node.id, onDeleteNode]);

	const handleSelectActionType = useCallback(
		(option: ActionTypeOption) => {
			onTransformNode(node.id, option.type, option.defaultData);
		},
		[node.id, onTransformNode]
	);

	// Find available inputs from upstream nodes
	const availableInputs = useMemo(
		() => findUpstreamInputs(node.id, nodes, edges),
		[node.id, nodes, edges]
	);

	// Get step results for this node from runs
	const stepResults: StepResult[] = runs.flatMap((run) =>
		run.stepResults.filter((s) => s.nodeId === node.id)
	);

	// Filter action types by search query
	const filteredActionTypes = useMemo(() => {
		if (!searchQuery.trim()) return ACTION_TYPES;
		const query = searchQuery.toLowerCase();
		return ACTION_TYPES.filter(
			(option) =>
				option.label.toLowerCase().includes(query) ||
				option.description.toLowerCase().includes(query)
		);
	}, [searchQuery]);

	// Tabs for typed nodes (must be called before any conditional returns)
	type TabDef = { id: SidebarTab; label: string };
	const tabs: TabDef[] = useMemo(() => {
		// For action nodes, return empty array (won't be used)
		if (node.data.type === 'action') return [];

		const base: TabDef[] = [{ id: 'properties', label: 'Properties' }];

		if (node.data.type === 'prompt') {
			base.push({ id: 'prompt', label: 'Prompt' });
		} else {
			base.push({ id: 'code', label: 'Code' });
		}

		base.push({ id: 'runs', label: 'Runs' });
		return base;
	}, [node.data.type]);

	// Determine if node has meaningful content (beyond defaults)
	const nodeHasContent = useMemo(() => {
		const data = node.data;
		const actionType = ACTION_TYPES.find((a) => a.type === data.type);
		if (!actionType) return false;

		const defaults = actionType.defaultData;
		// Check for non-default label/description
		const hasCustomMeta =
			(data.label && data.label !== defaults.label) ||
			(data.description && data.description.trim() !== '');

		// Check for actual content based on type
		if (data.type === 'prompt' && defaults.type === 'prompt') {
			return hasCustomMeta || (data.prompt && data.prompt !== defaults.prompt);
		}
		if (data.type === 'code' && defaults.type === 'code') {
			return hasCustomMeta || (data.code && data.code !== defaults.code);
		}
		if (data.type === 'condition' && defaults.type === 'condition') {
			return hasCustomMeta || (data.expression && data.expression !== defaults.expression);
		}
		return false;
	}, [node.data]);

	// Set smart initial tab when node changes
	// For nodes with content, open the behavior tab (prompt/code)
	// For new/default nodes, open properties
	const prevNodeIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (node.data.type === 'action') return; // Action nodes don't have tabs
		if (prevNodeIdRef.current === node.id) return; // Same node, don't reset
		prevNodeIdRef.current = node.id;

		if (nodeHasContent) {
			// Node has content - open behavior tab
			setActiveTab(node.data.type === 'prompt' ? 'prompt' : 'code');
		} else {
			// New/default node - open properties
			setActiveTab('properties');
		}
	}, [node.id, node.data.type, nodeHasContent]);

	// Ensure active tab stays valid when switching nodes/types
	useEffect(() => {
		if (tabs.length === 0) return; // Skip for action nodes
		if (tabs.some((t) => t.id === activeTab)) return;
		setActiveTab(tabs[0].id);
	}, [tabs, activeTab]);

	// If node is an action (placeholder), show the action type picker
	if (node.data.type === 'action') {
		return (
			<div className="spark-workflow-sidebar">
				{/* Header */}
				<div className="spark-workflow-sidebar-header">
					<h3>Select Action</h3>
					<button type="button" className="spark-workflow-sidebar-close" onClick={onClose}>
						×
					</button>
				</div>

				{/* Search */}
				<div className="spark-workflow-sidebar-content">
					<div className="spark-workflow-action-search">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="11" cy="11" r="8" />
							<path d="m21 21-4.3-4.3" />
						</svg>
						<input
							type="text"
							placeholder="Search actions..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>

					{/* Action cards grid */}
					<div className="spark-workflow-action-grid">
						{filteredActionTypes.map((option) => (
							<button
								key={option.type}
								type="button"
								className="spark-workflow-action-card"
								onClick={() => handleSelectActionType(option)}
							>
								<div className="spark-workflow-action-card-icon">{option.icon}</div>
								<div className="spark-workflow-action-card-label">{option.label}</div>
							</button>
						))}
					</div>

					{filteredActionTypes.length === 0 && (
						<div className="spark-workflow-action-empty">
							No actions match your search.
						</div>
					)}

					{/* Delete button */}
					<div className="spark-workflow-form-group spark-workflow-form-actions">
						<button
							type="button"
							className="spark-workflow-btn spark-workflow-btn-danger"
							onClick={() => void handleDelete()}
						>
							Delete Step
						</button>
					</div>
				</div>
			</div>
		);
	}

	// Normal sidebar for typed nodes
	return (
		<div className="spark-workflow-sidebar">
			{/* Header */}
			<div className="spark-workflow-sidebar-header">
				<h3>{node.data.label || 'Step'}</h3>
				<button type="button" className="spark-workflow-sidebar-close" onClick={onClose}>
					×
				</button>
			</div>

			{/* Tabs */}
			<div className="spark-settings-tabs">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						className={`spark-tab-button ${activeTab === tab.id ? 'active' : ''}`}
						onClick={() => setActiveTab(tab.id)}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Tab content */}
			<div className="spark-workflow-sidebar-content">
				{activeTab === 'properties' && (
					<PropertiesTab
						node={node}
						onChange={handleChange}
						onDelete={() => void handleDelete()}
					/>
				)}
				{activeTab === 'prompt' && (
					<PromptTab
						app={app}
						plugin={plugin}
						node={node}
						availableInputs={availableInputs}
						onChange={handleChange}
					/>
				)}
				{activeTab === 'code' && <CodeTab node={node} availableInputs={availableInputs} onChange={handleChange} />}
				{activeTab === 'runs' && <RunsTab results={stepResults} />}
			</div>
		</div>
	);
}

/**
 * Properties Tab
 */
interface PropertiesTabProps {
	node: WorkflowNode;
	onChange: (field: string, value: unknown) => void;
	onDelete: () => void;
}

function PropertiesTab({ node, onChange, onDelete }: PropertiesTabProps) {
	const data = node.data;

	return (
		<div className="spark-workflow-sidebar-section">
			{/* Common fields */}
			<div className="spark-workflow-form-group">
				<label>Label</label>
				<input
					type="text"
					value={data.label || ''}
					onChange={(e) => onChange('label', e.target.value)}
					placeholder="Step label"
				/>
			</div>

			<div className="spark-workflow-form-group">
				<label>Description</label>
				<textarea
					value={data.description || ''}
					onChange={(e) => onChange('description', e.target.value)}
					placeholder="Optional description"
					rows={2}
				/>
			</div>

			{/* Delete button */}
			<div className="spark-workflow-form-group spark-workflow-form-actions">
				<button
					type="button"
					className="spark-workflow-btn spark-workflow-btn-danger"
					onClick={onDelete}
				>
					Delete Step
				</button>
			</div>
		</div>
	);
}

/**
 * Prompt Tab (prompt nodes only)
 */
interface PromptTabProps {
	app: App;
	plugin: ISparkPlugin;
	node: WorkflowNode;
	availableInputs: AvailableInput[];
	onChange: (field: string, value: unknown) => void;
}

function PromptTab({ app, plugin, node, availableInputs, onChange }: PromptTabProps) {
	if (node.data.type !== 'prompt') {
		return (
			<div className="spark-workflow-sidebar-section">
				<p className="spark-workflow-sidebar-empty">
					This step type does not have a prompt template.
				</p>
			</div>
		);
	}

	return (
		<div className="spark-workflow-sidebar-section">
			<PromptFields
				app={app}
				plugin={plugin}
				data={node.data}
				availableInputs={availableInputs}
				onChange={onChange}
			/>
		</div>
	);
}

/**
 * Collapsible Available Variables section
 */
function AvailableVariablesSection({ inputs }: { inputs: AvailableInput[] }) {
	const [isExpanded, setIsExpanded] = useState(false);

	// Collect all available variable paths
	const variablePaths: string[] = [];
	for (const input of inputs) {
		if (input.fields && input.fields.length > 0) {
			for (const field of input.fields) {
				variablePaths.push(`input.${field.name}`);
			}
		} else {
			variablePaths.push('input.content');
		}
	}

	return (
		<div className="spark-workflow-vars-section">
			<button
				type="button"
				className="spark-workflow-vars-toggle"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<span className="spark-workflow-vars-toggle-icon">{isExpanded ? '▼' : '▶'}</span>
				<span className="spark-workflow-vars-toggle-label">Available Variables</span>
				<span className="spark-workflow-vars-toggle-count">{variablePaths.length}</span>
			</button>

			{isExpanded && (
				<div className="spark-workflow-vars-content">
					{inputs.map((input) => (
						<div key={input.nodeId} className="spark-workflow-vars-source">
							<div className="spark-workflow-vars-source-header">
								From "{input.nodeLabel}"
								{input.viaCondition && (
									<span className="spark-workflow-vars-via">via condition</span>
								)}
							</div>
							{input.fields && input.fields.length > 0 ? (
								<div className="spark-workflow-vars-fields">
									{input.fields.map((field) => (
										<div key={field.name} className="spark-workflow-vars-field">
											<code>$input.{field.name}</code>
											<span className="spark-workflow-vars-type">{field.type}</span>
										</div>
									))}
								</div>
							) : (
								<div className="spark-workflow-vars-fields">
									<div className="spark-workflow-vars-field">
										<code>$input</code>
										<span className="spark-workflow-vars-type">string</span>
									</div>
								</div>
							)}
						</div>
					))}
					<div className="spark-workflow-vars-hint">
						Use these in your prompt template. Type $ to autocomplete.
					</div>
				</div>
			)}
		</div>
	);
}

/**
 * Prompt-specific fields
 */
interface PromptFieldsProps {
	app: App;
	plugin: ISparkPlugin;
	data: { type: 'prompt' } & PromptNodeData;
	availableInputs: AvailableInput[];
	onChange: (field: string, value: unknown) => void;
}

function PromptFields({ app, plugin, data, availableInputs, onChange }: PromptFieldsProps) {
	// Build example variable for hint
	const exampleVar = availableInputs.length > 0 && availableInputs[0].fields?.[0]
		? `$input.${availableInputs[0].fields[0].name}`
		: '$input';

	// Build available variables for autocomplete
	const variables: VariableItem[] = [
		{ name: 'input', type: 'object', description: 'Full input from previous step' },
		{ name: 'context', type: 'object', description: 'Workflow context' },
	];
	for (const input of availableInputs) {
		if (input.fields && input.fields.length > 0) {
			for (const field of input.fields) {
				variables.push({
					name: `input.${field.name}`,
					type: field.type,
					description: `From "${input.nodeLabel}"`,
				});
			}
		}
	}

	return (
		<>
			{/* Available Variables - above prompt field */}
			{availableInputs.length > 0 && <AvailableVariablesSection inputs={availableInputs} />}

			<div className="spark-workflow-form-group">
				<label>Prompt Template</label>
				<MentionTextarea
					app={app}
					mentionDecorator={plugin.mentionDecorator}
					value={data.prompt || ''}
					onChange={(value) => onChange('prompt', value)}
					placeholder={`@agent do something with ${exampleVar}`}
					rows={6}
					variables={variables}
				/>
				<span className="spark-workflow-form-hint">
					Use @agent to specify which agent. Type $ for variables: $input, $input.field, $context
				</span>
			</div>

			{/* Structured Output Toggle */}
			<div className="spark-workflow-form-group spark-workflow-form-checkbox">
				<label>
					<input
						type="checkbox"
						checked={data.structuredOutput || false}
						onChange={(e) => onChange('structuredOutput', e.target.checked)}
					/>
					Structured Output (JSON)
				</label>
				<span className="spark-workflow-form-hint">
					When enabled, the agent must output valid JSON matching the schema below.
					Useful for conditions and downstream processing.
				</span>
			</div>

			{/* Output Schema (shown when structured output is enabled) */}
			{data.structuredOutput && (
				<OutputSchemaField
					value={data.outputSchema || ''}
					onChange={(value) => onChange('outputSchema', value)}
				/>
			)}
		</>
	);
}

/**
 * Validate and count fields in a schema string
 * Supports both valid JSON and type-keyword format
 */
function validateSchema(value: string): { valid: boolean; fieldCount: number; error?: string } {
	if (!value.trim()) return { valid: true, fieldCount: 0 };

	// Try parsing as valid JSON first
	try {
		const parsed = JSON.parse(value);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return { valid: false, fieldCount: 0, error: 'Schema must be a JSON object' };
		}
		return { valid: true, fieldCount: Object.keys(parsed).length };
	} catch {
		// Not valid JSON - try normalizing type keywords to valid JSON values
		// Replace: number → 0, string → "", boolean → true, object → {}, array/[] → []
		let normalized = value;
		normalized = normalized.replace(/:\s*number\b/g, ': 0');
		normalized = normalized.replace(/:\s*string\b/g, ': ""');
		normalized = normalized.replace(/:\s*boolean\b/g, ': true');
		normalized = normalized.replace(/:\s*object\b/g, ': {}');
		normalized = normalized.replace(/:\s*array\b/g, ': []');
		normalized = normalized.replace(/:\s*\[\]/g, ': []');

		try {
			const parsed = JSON.parse(normalized);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				return { valid: false, fieldCount: 0, error: 'Schema must be a JSON object' };
			}
			// Check for empty keys
			const keys = Object.keys(parsed);
			if (keys.some((k) => !k.trim())) {
				return { valid: false, fieldCount: 0, error: 'Field names cannot be empty' };
			}
			return { valid: true, fieldCount: keys.length };
		} catch {
			return { valid: false, fieldCount: 0, error: 'Invalid JSON syntax' };
		}
	}
}

/**
 * Output Schema field with validation feedback
 */
function OutputSchemaField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	const validation = useMemo(() => {
		const result = validateSchema(value);
		if (!value.trim()) return { valid: true, message: '' };
		if (!result.valid) {
			return { valid: false, message: `✗ ${result.error}` };
		}
		return { valid: true, message: `✓ ${result.fieldCount} field${result.fieldCount !== 1 ? 's' : ''} defined` };
	}, [value]);

	return (
		<div className="spark-workflow-form-group">
			<label>Output Schema</label>
			<textarea
				className={`spark-workflow-code-editor ${!validation.valid ? 'spark-workflow-input-error' : ''}`}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder='{ "score": 0, "reasoning": "" }'
				rows={4}
				spellCheck={false}
			/>
			{validation.message && (
				<span className={`spark-workflow-form-hint ${validation.valid ? '' : 'spark-workflow-hint-error'}`}>
					{validation.message}
				</span>
			)}
			{!validation.message && (
				<span className="spark-workflow-form-hint">
					JSON schema the agent must follow. Use example values or type keywords.
				</span>
			)}
		</div>
	);
}

/**
 * Condition-specific fields
 */
interface ConditionFieldsProps {
	data: { type: 'condition' } & ConditionNodeData;
	onChange: (field: string, value: unknown) => void;
}

function ConditionFields({ data, onChange }: ConditionFieldsProps) {
	return (
		<>
			<div className="spark-workflow-form-group">
				<label>Max Cycles</label>
				<input
					type="number"
					value={data.maxCycles || 3}
					onChange={(e) => onChange('maxCycles', parseInt(e.target.value, 10))}
					min={1}
					max={100}
				/>
				<span className="spark-workflow-form-hint">
					Maximum times this condition can loop back before stopping
				</span>
			</div>
		</>
	);
}

/**
 * Code Tab
 */
interface CodeTabProps {
	node: WorkflowNode;
	availableInputs: AvailableInput[];
	onChange: (field: string, value: unknown) => void;
}

function CodeTab({ node, availableInputs, onChange }: CodeTabProps) {
	const data = node.data;

	// Only show code editor for code nodes and condition expression for condition nodes
	if (data.type === 'code') {
		return (
			<div className="spark-workflow-sidebar-section">
				{availableInputs.length > 0 && <AvailableVariablesSection inputs={availableInputs} />}
				<div className="spark-workflow-form-group">
					<label>JavaScript Code</label>
					<textarea
						className="spark-workflow-code-editor"
						value={(data as CodeNodeData).code || ''}
						onChange={(e) => onChange('code', e.target.value)}
						placeholder="// Access input via 'input' variable
// Return output object
return { result: input };"
						rows={15}
						spellCheck={false}
					/>
					<span className="spark-workflow-form-hint">
						Available: input (previous output), context (workflow state)
					</span>
				</div>
			</div>
		);
	}

	if (data.type === 'condition') {
		return (
			<div className="spark-workflow-sidebar-section">
				{availableInputs.length > 0 && <AvailableVariablesSection inputs={availableInputs} />}
				<div className="spark-workflow-form-group">
					<label>Condition Expression</label>
					<textarea
						className="spark-workflow-code-editor"
						value={(data as ConditionNodeData).expression || ''}
						onChange={(e) => onChange('expression', e.target.value)}
						placeholder="input.score > 5"
						rows={5}
						spellCheck={false}
					/>
					<span className="spark-workflow-form-hint">
						JavaScript expression that evaluates to true or false
					</span>
				</div>
				<ConditionFields data={data} onChange={onChange} />
			</div>
		);
	}

	return (
		<div className="spark-workflow-sidebar-section">
			<p className="spark-workflow-sidebar-empty">
				This step type does not have editable code.
			</p>
		</div>
	);
}

/**
 * Runs Tab
 */
interface RunsTabProps {
	results: StepResult[];
}

function RunsTab({ results }: RunsTabProps) {
	if (results.length === 0) {
		return (
			<div className="spark-workflow-sidebar-section">
				<p className="spark-workflow-sidebar-empty">No runs yet. Execute the workflow to see results.</p>
			</div>
		);
	}

	// Sort newest-first so we don't preserve execution-order within a run.
	const sortedResults = useMemo(() => {
		return [...results].sort((a, b) => b.startTime - a.startTime);
	}, [results]);

	return (
		<div className="spark-workflow-sidebar-section">
			{sortedResults.map((result, index) => (
				<RunResult key={`${result.nodeId}-${result.startTime}`} result={result} index={index} />
			))}
		</div>
	);
}

/**
 * Data block with selectable text
 */
interface DataBlockProps {
	label: string;
	data: unknown;
	className?: string;
}

function DataBlock({ label, data, className = '' }: DataBlockProps) {
	const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

	return (
		<div className={`spark-workflow-run-block ${className}`}>
			<strong className="spark-workflow-run-block-label">{label}</strong>
			<pre className="spark-workflow-run-block-content">{content}</pre>
		</div>
	);
}

/**
 * Single run result display
 */
interface RunResultProps {
	result: StepResult;
	index: number;
}

function RunResult({ result, index }: RunResultProps) {
	const [expanded, setExpanded] = useState(false);

	const duration = result.endTime ? result.endTime - result.startTime : 0;
	const startDate = new Date(result.startTime);
	const now = new Date();
	const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const diffDays = Math.floor((startOfDay(now) - startOfDay(startDate)) / (1000 * 60 * 60 * 24));

	const timeText = startDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	// Month name should not vary by OS locale (keep time local, date month deterministic).
	const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
	const absoluteDateText = `${EN_MONTHS[startDate.getMonth()]} ${String(startDate.getDate()).padStart(2, '0')}${startDate.getFullYear() !== now.getFullYear() ? ` ${startDate.getFullYear()}` : ''
		}`;

	const timestampText =
		diffDays === 0 ? timeText
			: diffDays === 1 ? `Yesterday ${timeText}`
				: diffDays < 7 ? `${diffDays} days ago ${timeText}`
					: `${timeText} ${absoluteDateText}`;
	const statusIcon =
		result.status === 'completed'
			? '✓'
			: result.status === 'failed'
				? '✗'
				: result.status === 'running'
					? '⏳'
					: '○';
	const statusClass = `spark-workflow-run-status-${result.status}`;

	return (
		<div className="spark-workflow-run-item">
			<div className="spark-workflow-run-header" onClick={() => setExpanded(!expanded)}>
				<span className={`spark-workflow-run-status ${statusClass}`}>{statusIcon}</span>
				<span className="spark-workflow-run-time">
					{timestampText}
				</span>
				<span className="spark-workflow-run-duration">{duration}ms</span>
				{result.cycleCount && result.cycleCount > 0 && (
					<span className="spark-workflow-run-cycles">cycle {result.cycleCount}</span>
				)}
				<span className="spark-workflow-run-expand">{expanded ? '▼' : '▶'}</span>
			</div>

			{expanded && (
				<div className="spark-workflow-run-details">
					{result.input !== undefined && (
						<DataBlock
							label="Input"
							data={result.input}
							className="spark-workflow-run-input"
						/>
					)}
					{result.output !== undefined && (
						<DataBlock
							label="Output"
							data={result.output}
							className="spark-workflow-run-output"
						/>
					)}
					{result.error && (
						<DataBlock
							label="Error"
							data={result.error}
							className="spark-workflow-run-error"
						/>
					)}
				</div>
			)}
		</div>
	);
}


