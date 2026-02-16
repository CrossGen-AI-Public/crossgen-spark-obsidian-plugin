/**
 * React wrapper around the vanilla ModelSelector class.
 * Mounts the DOM-based selector into a React ref container.
 */

import { useEffect, useRef } from 'react';
import type { ModelOption } from '../models';
import { ModelSelector } from './ModelSelector';

interface ModelSelectorWidgetProps {
	models: ModelOption[];
	defaultModel: string;
	dropdownDirection?: 'up' | 'down';
	initialProvider?: 'cloud' | 'local';
	/** Pre-select this model on creation (e.g. persisted from node data) */
	initialSelection?: string;
	onChange: (modelId: string | null) => void;
	onProviderChange?: (provider: 'cloud' | 'local') => void;
}

export function ModelSelectorWidget({
	models,
	defaultModel,
	dropdownDirection,
	initialProvider,
	initialSelection,
	onChange,
	onProviderChange,
}: ModelSelectorWidgetProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const selectorRef = useRef<ModelSelector | null>(null);

	// Stable refs for callbacks to avoid re-creating the selector
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const onProviderChangeRef = useRef(onProviderChange);
	onProviderChangeRef.current = onProviderChange;

	useEffect(() => {
		if (!containerRef.current) return;

		const sel = new ModelSelector({
			models,
			defaultModel,
			dropdownDirection,
			initialProvider,
			initialSelection,
			onChange: (id) => onChangeRef.current(id),
			onProviderChange: (p) => onProviderChangeRef.current?.(p),
		});

		containerRef.current.appendChild(sel.create());
		selectorRef.current = sel;

		return () => {
			sel.destroy();
			selectorRef.current = null;
		};
	}, []); // Mount-only: updates handled via refresh()

	// Refresh when models or defaultModel change
	useEffect(() => {
		selectorRef.current?.refresh(models, defaultModel);
	}, [models, defaultModel]);

	return <div ref={containerRef} />;
}
