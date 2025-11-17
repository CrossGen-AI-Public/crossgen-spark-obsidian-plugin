/**
 * Types for inline chat functionality
 */

import type { EditorPosition } from 'obsidian';

/**
 * Detected agent mention in editor
 */
export interface DetectedAgentMention {
	/** Agent name (without @ prefix) */
	agentName: string;
	/** Position in editor where @agent starts */
	position: EditorPosition;
	/** Line number */
	line: number;
	/** Character position on line */
	ch: number;
}

/**
 * Inline chat widget state
 */
export interface InlineChatWidgetState {
	/** Unique ID for this chat instance */
	id: string;
	/** Agent name */
	agentName: string;
	/** Position where widget should appear */
	position: EditorPosition;
	/** Whether widget is visible */
	visible: boolean;
	/** User's message (as they type) */
	message: string;
}

/**
 * Inline chat marker in document
 */
export interface InlineChatMarker {
	/** Unique ID */
	id: string;
	/** Agent name */
	agentName: string;
	/** Status: pending, processing, complete, error */
	status: 'pending' | 'processing' | 'complete' | 'error';
	/** Line number where marker starts */
	startLine: number;
	/** Line number where marker ends */
	endLine: number;
	/** User message */
	userMessage?: string;
	/** AI response */
	aiResponse?: string;
}

/**
 * Inline chat marker format in document
 * <!-- spark-inline-chat:status:id -->
 */
export interface MarkerFormat {
	opening: string; // <!-- spark-inline-chat:status:id -->
	closing: string; // <!-- /spark-inline-chat -->
}
