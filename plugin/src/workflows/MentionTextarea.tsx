/**
 * MentionTextarea - React wrapper for MentionInput
 * Provides mention autocomplete (@agent, /command, $variable) in a textarea-like component
 */

import type { App } from 'obsidian';
import { useRef, useEffect } from 'react';
import type { MentionDecorator } from '../mention/MentionDecorator';
import { MentionInput } from '../mention/MentionInput';

/**
 * Variable item for autocomplete
 */
export interface VariableItem {
	name: string;
	type: string;
	description?: string;
}

interface MentionTextareaProps {
	app: App;
	mentionDecorator: MentionDecorator;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	rows?: number;
	/** Available variables for $ autocomplete */
	variables?: VariableItem[];
}

/**
 * React wrapper for the MentionInput class component
 * Provides a contenteditable div with @agent, /command, and $variable autocomplete
 */
export function MentionTextarea({
	app,
	mentionDecorator,
	value,
	onChange,
	placeholder = '',
	rows = 4,
	variables = [],
}: MentionTextareaProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mentionInputRef = useRef<MentionInput | null>(null);
	const isInternalChange = useRef(false);

	// Store onChange in a ref so MentionInput always calls latest version
	const onChangeRef = useRef(onChange);
	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	// Store variables in a ref to update without recreating
	const variablesRef = useRef(variables);
	useEffect(() => {
		variablesRef.current = variables;
		// Update MentionInput's variables if it exists
		if (mentionInputRef.current) {
			mentionInputRef.current.setVariables(variables);
		}
	}, [variables]);

	// Initialize MentionInput on mount
	useEffect(() => {
		if (!containerRef.current) return;

		// Create MentionInput instance
		// Don't pass paletteContainer - let palette use cursor-based fixed positioning
		// This opens the palette at the caret position like a code editor autocomplete
		const mentionInput = new MentionInput(app, mentionDecorator, {
			placeholder,
			multiLine: true,
			initialContent: value,
			onChange: () => {
				// Notify React of changes
				const text = mentionInput.getText();
				isInternalChange.current = true;
				onChangeRef.current(text); // Use ref to always call latest onChange
			},
			// Don't submit on Enter - just add newline
			onSubmit: undefined,
			onEscape: undefined,
			variables: variablesRef.current,
		});

		// Create the input element and append to container
		const inputEl = mentionInput.create();
		containerRef.current.appendChild(inputEl);

		mentionInputRef.current = mentionInput;

		// Cleanup on unmount
		return () => {
			mentionInput.destroy();
			if (inputEl.parentNode) {
				inputEl.parentNode.removeChild(inputEl);
			}
		};
	}, [app, mentionDecorator, placeholder]); // Don't include onChange to avoid re-creating

	// Sync external value changes to MentionInput
	useEffect(() => {
		if (!mentionInputRef.current) return;

		// Skip if this was our own change
		if (isInternalChange.current) {
			isInternalChange.current = false;
			return;
		}

		// Only update if value actually differs
		const currentText = mentionInputRef.current.getText();
		if (currentText !== value) {
			mentionInputRef.current.setText(value);
		}
	}, [value]);

	// Calculate min-height based on rows
	const minHeight = rows * 24; // ~24px per line

	return (
		<div
			ref={containerRef}
			className="spark-mention-textarea-container"
			style={{ minHeight: `${minHeight}px` }}
		/>
	);
}
