/**
 * React hook for model selection in workflow chats
 */

import { useCallback, useMemo, useState } from 'react';
import { getAvailableModels, type ModelOption, resolveDefaultModel } from '../models';

interface LocalOverrideState {
	enabled: boolean;
	model: string;
}

export interface UseModelSelectorResult {
	models: ModelOption[];
	selected: string | null;
	setSelected: (id: string | null) => void;
	defaultModel: string;
	reset: () => void;
	activeProvider: 'cloud' | 'local';
	setActiveProvider: (p: 'cloud' | 'local') => void;
}

export function useModelSelector(localOverride?: LocalOverrideState): UseModelSelectorResult {
	const [selected, setSelected] = useState<string | null>(null);
	const initialProvider = localOverride?.enabled ? 'local' : 'cloud';
	const [activeProvider, setActiveProvider] = useState<'cloud' | 'local'>(initialProvider);

	const localOverrideEnabled = localOverride?.enabled ?? false;

	const models = useMemo(() => getAvailableModels(localOverrideEnabled), [localOverrideEnabled]);

	const defaultModel = useMemo(
		() => resolveDefaultModel(undefined, undefined, localOverride),
		[localOverride]
	);

	const reset = useCallback(() => {
		setSelected(null);
	}, []);

	return {
		models,
		selected,
		setSelected,
		defaultModel,
		reset,
		activeProvider,
		setActiveProvider,
	};
}
