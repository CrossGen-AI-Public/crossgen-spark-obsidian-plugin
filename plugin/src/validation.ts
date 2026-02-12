import { z } from 'zod';

// Agent validation schema
export const AgentConfigSchema = z.object({
	name: z.string().min(1, 'Agent name is required'),
	role: z.string().min(1, 'Agent role is required'),
	expertise: z.array(z.string().min(1)).min(1, 'At least one expertise area is required'),
	context_folders: z.array(z.string()).optional(),
	tools: z.array(z.string()).optional(),
	ai: z.object({
		provider: z.string().optional(),
		model: z.string().min(1, 'Model is required'),
		temperature: z
			.number()
			.min(0, 'Temperature must be at least 0.0')
			.max(1, 'Temperature must be at most 1.0'),
	}),
	instructions: z.string().min(1, 'Instructions are required'),
});

// Config validation schema (for commonly edited fields)
export const SparkConfigSchema = z.object({
	version: z.number().positive(),
	engine: z.object({
		debounce_ms: z.number().min(0, 'Debounce must be non-negative'),
		results: z.object({
			add_blank_lines: z.boolean(),
		}),
	}),
	ai: z.object({
		defaultProvider: z.string().min(1, 'Default provider is required'),
		providers: z.record(
			z.string(),
			z.object({
				type: z.string().min(1, 'Provider type is required'),
				model: z.string().min(1, 'Model is required'),
				maxTokens: z.number().positive('Max tokens must be positive'),
				temperature: z.number().min(0).max(1),
				options: z.record(z.string(), z.unknown()).optional(),
			})
		),
		localOverride: z
			.object({
				enabled: z.boolean(),
				model: z.string(),
			})
			.optional(),
	}),
	logging: z.object({
		level: z.enum(['debug', 'info', 'warn', 'error']),
		console: z.boolean(),
	}),
	features: z.object({
		slash_commands: z.boolean(),
		chat_assistant: z.boolean(),
		trigger_automation: z.boolean(),
	}),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type SparkConfig = z.infer<typeof SparkConfigSchema>;
