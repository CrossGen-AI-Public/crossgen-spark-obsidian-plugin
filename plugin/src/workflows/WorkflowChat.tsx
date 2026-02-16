/**
 * WorkflowChat - Chat panel for editing workflows with AI
 */

import type { App } from 'obsidian';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MarkdownContent } from '../components/MarkdownContent';
import { ModelSelectorWidget } from '../components/ModelSelectorReact';
import { useModelSelector } from '../hooks/useModelSelector';
import { getLocalOverride } from '../models';
import type { ISparkPlugin } from '../types';
import { WorkflowChatStorage } from './WorkflowChatStorage';
import { WorkflowStorage } from './WorkflowStorage';
import type {
	WorkflowDefinition,
	WorkflowChatMessage,
	WorkflowEditRequest,
	WorkflowEditResult,
	WorkflowRun,
	WorkflowRunSummary,
	StepResultSummary,
} from './types';
import { generateId } from './types';

interface WorkflowChatProps {
	app: App;
	plugin: ISparkPlugin;
	workflow: WorkflowDefinition;
	selectedNodeId: string | null;
	runs: WorkflowRun[];
	onWorkflowUpdate: (workflow: WorkflowDefinition) => void;
	onClose: () => void;
}

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 180_000; // 3 minutes max

/**
 * Convert WorkflowRun to WorkflowRunSummary for the edit request
 */
function toRunSummary(run: WorkflowRun, nodes: WorkflowDefinition['nodes']): WorkflowRunSummary {
	const nodeMap = new Map(nodes.map((n) => [n.id, n.data.label || n.id]));

	return {
		id: run.id,
		status: run.status === 'running' || run.status === 'idle' ? 'completed' : run.status,
		startTime: run.startTime,
		endTime: run.endTime,
		error: run.error,
		stepResults: run.stepResults.map((step): StepResultSummary => ({
			nodeId: step.nodeId,
			nodeLabel: nodeMap.get(step.nodeId) || step.nodeId,
			status: step.status === 'pending' || step.status === 'running' ? 'completed' : step.status,
			input: step.input,
			output: step.output,
			error: step.error,
			cycleCount: step.cycleCount,
		})),
	};
}

export function WorkflowChat({
	app,
	plugin,
	workflow,
	selectedNodeId,
	runs,
	onWorkflowUpdate,
	onClose,
}: Readonly<WorkflowChatProps>) {
	const [messages, setMessages] = useState<WorkflowChatMessage[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [clarificationQuestions, setClarificationQuestions] = useState<string[] | null>(null);

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const pollAbortRef = useRef<{ aborted: boolean } | null>(null);
	const threadIdRef = useRef<string | null>(null);

	const storage = useMemo(() => new WorkflowStorage(app), [app]);
	const chatStorage = useMemo(() => new WorkflowChatStorage(app), [app]);
	const localOverride = useMemo(() => getLocalOverride(), []);
	const {
		models,
		selected: selectedModel,
		setSelected: setSelectedModel,
		defaultModel,
		activeProvider,
		setActiveProvider,
	} = useModelSelector(localOverride);

	// Load chat history on mount
	useEffect(() => {
		void (async () => {
			const history = await chatStorage.loadChatHistory(workflow.id);
			if (history) {
				setMessages(history.messages);
			}
		})();
	}, [workflow.id, chatStorage]);

	// Save chat history when messages change
	useEffect(() => {
		if (messages.length > 0) {
			void chatStorage.saveChatHistory(workflow.id, messages);
		}
	}, [workflow.id, messages, chatStorage]);

	// Scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const pollForResult = useCallback(
		async (requestId: string, abortSignal: { aborted: boolean }): Promise<WorkflowEditResult> => {
			const deadline = Date.now() + POLL_TIMEOUT_MS;

			while (!abortSignal.aborted) {
				if (Date.now() > deadline) {
					throw new Error('Timed out waiting for response.');
				}

				const result = await storage.loadWorkflowEditResult(requestId);
				if (result) {
					if (result.status === 'processing') {
						// Still processing, continue polling
						await new Promise((resolve) => globalThis.setTimeout(resolve, POLL_INTERVAL_MS));
						continue;
					}
					return result;
				}

				await new Promise((resolve) => globalThis.setTimeout(resolve, POLL_INTERVAL_MS));
			}

			throw new Error('Request cancelled.');
		},
		[storage]
	);

	const sendMessage = useCallback(
		async (content: string, clarificationAnswers?: string) => {
			if (!content.trim() && !clarificationAnswers) return;

			setError(null);
			setIsProcessing(true);

			// Add user message to chat
			const userMessage: WorkflowChatMessage = {
				id: generateId('msg'),
				role: 'user',
				content: clarificationAnswers || content,
				timestamp: Date.now(),
			};
			setMessages((prev) => [...prev, userMessage]);
			setInputValue('');
			setClarificationQuestions(null);

			// Abort any previous poll
			if (pollAbortRef.current) {
				pollAbortRef.current.aborted = true;
			}
			const abortSignal = { aborted: false };
			pollAbortRef.current = abortSignal;

			const requestId = generateId('wfedit');
			const threadId = threadIdRef.current ?? requestId;
			threadIdRef.current = threadId;

			try {
				// Build recent runs summary (last 5)
				const recentRuns = runs
					.slice(0, 5)
					.map((run) => toRunSummary(run, workflow.nodes));

				// Build conversation history (last 10 messages)
				const conversationHistory = messages.slice(-10);

				const request: WorkflowEditRequest = {
					requestId,
					workflowId: workflow.id,
					timestamp: Date.now(),
					source: 'workflow-chat',
					workflow,
					selectedNodeId: selectedNodeId ?? undefined,
					recentRuns,
					message: clarificationAnswers || content,
					conversationHistory,
					threadId,
					modelOverride: selectedModel ?? undefined,
				};

				await storage.queueWorkflowEdit(request);
				const result = await pollForResult(requestId, abortSignal);

				if (result.status === 'needs_clarification') {
					setClarificationQuestions(result.questions);
					setIsProcessing(false);
					return;
				}

				if (result.status === 'failed') {
					setError(result.error);
					setIsProcessing(false);
					return;
				}

				if (result.status === 'completed') {
					// Add assistant response
					const assistantMessage: WorkflowChatMessage = {
						id: generateId('msg'),
						role: 'assistant',
						content: result.responseMessage,
						timestamp: Date.now(),
					};
					setMessages((prev) => [...prev, assistantMessage]);

					// Apply workflow changes if any
					if (result.updatedWorkflow) {
						onWorkflowUpdate(result.updatedWorkflow);
					}
				}

				setIsProcessing(false);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setIsProcessing(false);
			}
		},
		[workflow, selectedNodeId, runs, messages, storage, pollForResult, onWorkflowUpdate]
	);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			if (clarificationQuestions) {
				void sendMessage('', inputValue);
			} else {
				void sendMessage(inputValue);
			}
		},
		[inputValue, clarificationQuestions, sendMessage]
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				if (clarificationQuestions) {
					void sendMessage('', inputValue);
				} else {
					void sendMessage(inputValue);
				}
			}
		},
		[inputValue, clarificationQuestions, sendMessage]
	);

	const handleClearHistory = useCallback(() => {
		setMessages([]);
		threadIdRef.current = null;
		void chatStorage.clearChatHistory(workflow.id);
	}, [workflow.id, chatStorage]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (pollAbortRef.current) {
				pollAbortRef.current.aborted = true;
			}
		};
	}, []);

	return (
		<div className="spark-workflow-chat">
			{/* Header */}
			<div className="spark-workflow-sidebar-header">
				<h3>Workflow Chat</h3>
				<div className="spark-workflow-chat-header-actions">
					<button
						type="button"
						className="spark-workflow-chat-clear-btn"
						onClick={handleClearHistory}
						title="Clear chat history"
						disabled={isProcessing || messages.length === 0}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M3 6h18" />
							<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
							<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
						</svg>
					</button>
					<button type="button" className="spark-workflow-sidebar-close" onClick={onClose}>
						×
					</button>
				</div>
			</div>

			{/* Context indicator */}
			{selectedNodeId && (
				<div className="spark-workflow-chat-context">
					Selected: {workflow.nodes.find((n) => n.id === selectedNodeId)?.data.label || selectedNodeId}
				</div>
			)}

			{/* Messages */}
			<div className="spark-workflow-chat-messages">
				{messages.length === 0 && !isProcessing && (
					<div className="spark-workflow-chat-empty">
						<p>Ask me to help with your workflow.</p>
						<p className="spark-workflow-chat-empty-hint">
							I can add nodes, modify prompts, debug issues, or explain how things work.
						</p>
					</div>
				)}

				{messages.map((msg) => (
					<div
						key={msg.id}
						className={`spark-workflow-chat-message spark-workflow-chat-${msg.role}`}
					>
						{msg.role === 'assistant' ? (
							<MarkdownContent
								app={app}
								content={msg.content}
								className="spark-workflow-chat-message-content"
							/>
						) : (
							<div className="spark-workflow-chat-message-content">{msg.content}</div>
						)}
					</div>
				))}

				{isProcessing && (
					<div className="spark-workflow-chat-message spark-workflow-chat-assistant">
						<div className="spark-workflow-chat-loading">
							<span className="spark-workflow-chat-loading-dot" />
							<span className="spark-workflow-chat-loading-dot" />
							<span className="spark-workflow-chat-loading-dot" />
						</div>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Clarification questions */}
			{clarificationQuestions && (
				<div className="spark-workflow-chat-clarifications">
					<div className="spark-workflow-chat-clarifications-title">Clarifications needed:</div>
					<ul>
						{clarificationQuestions.map((q, i) => (
							<li key={i}>{q}</li>
						))}
					</ul>
				</div>
			)}

			{/* Error display */}
			{error && (
				<div className="spark-workflow-chat-error">
					{error}
				</div>
			)}

			{/* Input */}
			<form className="spark-workflow-chat-input-container" onSubmit={handleSubmit}>
				<textarea
					ref={inputRef}
					className="spark-workflow-chat-input"
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={clarificationQuestions ? 'Answer the questions...' : 'Ask about or modify your workflow...'}
					disabled={isProcessing}
					rows={2}
				/>
				<div className="spark-chat-toolbar-row">
					<ModelSelectorWidget
						models={models}
						defaultModel={defaultModel}
						dropdownDirection="up"
						initialProvider={activeProvider}
						onChange={setSelectedModel}
						onProviderChange={setActiveProvider}
					/>
					<button
						type="submit"
						className={`spark-workflow-chat-send${isProcessing ? ' spark-workflow-chat-send-loading' : ''}`}
						disabled={isProcessing || (!inputValue.trim() && !clarificationQuestions)}
					>
						{isProcessing ? (
							<svg
								className="spark-workflow-spinner"
								xmlns="http://www.w3.org/2000/svg"
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
							'↑'
						)}
					</button>
				</div>
			</form>
		</div>
	);
}
