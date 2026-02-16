/**
 * AI Provider Types
 */
export enum ProviderType {
	ANTHROPIC = 'anthropic',
	LOCAL = 'local',
}

/**
 * Available Anthropic Claude models
 * Updated: November 2024 (only active models)
 * Source: https://docs.claude.com/en/docs/about-claude/model-deprecations
 */
export enum ClaudeModel {
	// Claude 4.6 Family (Latest)
	OPUS_4_6 = 'claude-opus-4-6',

	// Claude 4.5 Family
	OPUS_4_5 = 'claude-opus-4-5-20251101',
	SONNET_4_5 = 'claude-sonnet-4-5-20250929',
	HAIKU_4_5 = 'claude-haiku-4-5-20251001',

	// Claude 4.1 Family
	OPUS_4_1 = 'claude-opus-4-1-20250805',

	// Claude 4 Family
	SONNET_4 = 'claude-sonnet-4-20250514',
	OPUS_4 = 'claude-opus-4-20250514',

	// Claude 3.5 Family (Active)
	HAIKU_3_5 = 'claude-3-5-haiku-20241022',

	// Claude 3 Family (Active)
	HAIKU_3 = 'claude-3-haiku-20240307',
}

// Human-readable labels for models
export const MODEL_LABELS: Record<string, string> = {
	[ClaudeModel.OPUS_4_6]: 'Claude Opus 4.6 (Latest)',
	[ClaudeModel.OPUS_4_5]: 'Claude Opus 4.5',
	[ClaudeModel.SONNET_4_5]: 'Claude Sonnet 4.5',
	[ClaudeModel.HAIKU_4_5]: 'Claude Haiku 4.5',
	[ClaudeModel.OPUS_4_1]: 'Claude Opus 4.1',
	[ClaudeModel.SONNET_4]: 'Claude Sonnet 4',
	[ClaudeModel.OPUS_4]: 'Claude Opus 4',
	[ClaudeModel.HAIKU_3_5]: 'Claude Haiku 3.5',
	[ClaudeModel.HAIKU_3]: 'Claude Haiku 3',
};

/**
 * Local model info from engine's .spark/local-models.json
 */
interface LocalModelsFile {
	connected: boolean;
	models: Array<{
		path: string;
		displayName: string;
		paramsString?: string;
		sizeBytes?: number;
		trainedForToolUse?: boolean;
		maxContextLength?: number;
	}>;
	timestamp: number;
}

// Cached local models from engine-written file
let cachedLocalModels: string[] = [];
let lmStudioConnected = false;

const LOCAL_MODELS_PATH = '.spark/local-models.json';

/**
 * Fetch local models by reading .spark/local-models.json written by the engine.
 * The engine handles LM Studio communication (no CORS issues in Node.js).
 * @param readFile - async function to read a vault file (e.g. adapter.read)
 */
export async function fetchLocalModels(
	readFile: (path: string) => Promise<string>
): Promise<string[]> {
	try {
		const content = await readFile(LOCAL_MODELS_PATH);
		const data = JSON.parse(content) as LocalModelsFile;
		lmStudioConnected = data.connected;
		cachedLocalModels = data.models.map(m => m.path);
		return cachedLocalModels;
	} catch {
		lmStudioConnected = false;
		return cachedLocalModels;
	}
}

// Get cached local models (sync)
export function getLocalModels(): string[] {
	return cachedLocalModels;
}

// Whether LM Studio server was reachable (based on engine's last check)
export function isLMStudioConnected(): boolean {
	return lmStudioConnected;
}

// Extract display name from model path (e.g. "lmstudio-community/Qwen2.5-3B-Instruct" → "Qwen2.5-3B-Instruct")
export function getLocalModelLabel(modelPath: string): string {
	const parts = modelPath.split('/');
	return parts.length > 1 ? parts[parts.length - 1] : modelPath;
}

// Get all models by provider
export function getModelsByProvider(provider: string): string[] {
	if (provider === 'anthropic') return Object.values(ClaudeModel);
	if (provider === 'local') return getLocalModels();
	return [];
}

// Get all model values as array
export const ALL_MODELS = Object.values(ClaudeModel);

// Get model label
export function getModelLabel(model: string): string {
	return MODEL_LABELS[model] || getLocalModelLabel(model);
}

// Get short model label (strips "Claude " prefix and " (Latest)" suffix)
export function getShortModelLabel(model: string): string {
	const label = getModelLabel(model);
	return label.replace(/^Claude\s+/, '').replace(/\s*\(Latest\)$/, '');
}

// Provider labels
export const PROVIDER_LABELS: Record<string, string> = {
	[ProviderType.ANTHROPIC]: 'Anthropic Claude',
	[ProviderType.LOCAL]: 'Local (LM Studio)',
};

export function getProviderLabel(provider: string): string {
	return PROVIDER_LABELS[provider] || provider;
}

/**
 * Local override state from config.yaml
 */
export interface LocalOverrideState {
	enabled: boolean;
	model: string;
}

// Cached local override state
let cachedLocalOverride: LocalOverrideState = { enabled: false, model: '' };

/**
 * Fetch local override state from .spark/config.yaml
 */
export async function fetchLocalOverride(
	readFile: (path: string) => Promise<string>
): Promise<LocalOverrideState> {
	try {
		const content = await readFile('.spark/config.yaml');
		// Simple YAML parsing for localOverride — avoid pulling in js-yaml dependency
		const enabledMatch = content.match(/localOverride:[\s\S]*?enabled:\s*(true|false)/);
		const modelMatch = content.match(/localOverride:[\s\S]*?model:\s*(.+)/);
		cachedLocalOverride = {
			enabled: enabledMatch?.[1] === 'true',
			model: modelMatch?.[1]?.trim() ?? '',
		};
	} catch {
		// Config not found or parse error — keep defaults
	}
	return cachedLocalOverride;
}

/**
 * Get cached local override state (sync)
 */
export function getLocalOverride(): LocalOverrideState {
	return cachedLocalOverride;
}

/**
 * Model option for the model selector dropdown
 */
export interface ModelOption {
	id: string;
	provider: string;
	label: string;
	group: string;
	disabled: boolean;
}

/**
 * Build list of available models for the model selector dropdown.
 * When localOverrideEnabled, cloud models are disabled (greyed out).
 */
export function getAvailableModels(localOverrideEnabled: boolean): ModelOption[] {
	const options: ModelOption[] = [];

	// Anthropic models
	for (const model of Object.values(ClaudeModel)) {
		options.push({
			id: model,
			provider: 'anthropic',
			label: MODEL_LABELS[model] || model,
			group: PROVIDER_LABELS[ProviderType.ANTHROPIC],
			disabled: localOverrideEnabled,
		});
	}

	// Local models
	for (const model of getLocalModels()) {
		options.push({
			id: model,
			provider: 'local',
			label: getLocalModelLabel(model),
			group: PROVIDER_LABELS[ProviderType.LOCAL],
			disabled: false,
		});
	}

	return options;
}

/**
 * Resolve which model should be pre-selected in the dropdown.
 * Priority: localOverride model > agent model > global default
 */
export function resolveDefaultModel(
	agentModel?: string,
	globalDefault?: string,
	localOverride?: { enabled: boolean; model: string }
): string {
	if (localOverride?.enabled && localOverride.model) {
		return localOverride.model;
	}
	return agentModel || globalDefault || ClaudeModel.SONNET_4_5;
}
