/**
 * AI Provider Types
 */
export enum ProviderType {
	ANTHROPIC = 'anthropic',
}

/**
 * Available Anthropic Claude models
 * Updated: November 2024 (only active models)
 * Source: https://docs.claude.com/en/docs/about-claude/model-deprecations
 */
export enum ClaudeModel {
	// Claude 4.5 Family (Latest - Recommended)
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
	[ClaudeModel.SONNET_4_5]: 'Claude Sonnet 4.5 (Latest)',
	[ClaudeModel.HAIKU_4_5]: 'Claude Haiku 4.5',
	[ClaudeModel.OPUS_4_1]: 'Claude Opus 4.1',
	[ClaudeModel.SONNET_4]: 'Claude Sonnet 4',
	[ClaudeModel.OPUS_4]: 'Claude Opus 4',
	[ClaudeModel.HAIKU_3_5]: 'Claude Haiku 3.5',
	[ClaudeModel.HAIKU_3]: 'Claude Haiku 3',
};

// Get all models by provider
export function getModelsByProvider(provider: ProviderType): string[] {
	switch (provider) {
		case ProviderType.ANTHROPIC:
			return Object.values(ClaudeModel);
		default:
			return [];
	}
}

// Get all model values as array
export const ALL_MODELS = Object.values(ClaudeModel);

// Get model label
export function getModelLabel(model: string): string {
	return MODEL_LABELS[model] || model;
}

// Provider labels
export const PROVIDER_LABELS: Record<ProviderType, string> = {
	[ProviderType.ANTHROPIC]: 'Anthropic Claude',
};

export function getProviderLabel(provider: string): string {
	return PROVIDER_LABELS[provider as ProviderType] || provider;
}
