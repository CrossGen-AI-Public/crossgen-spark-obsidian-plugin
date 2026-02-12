import { AgentConfigSchema, SparkConfigSchema } from '../src/validation';

describe('AgentConfigSchema', () => {
	const validAgent = {
		name: 'Test Agent',
		role: 'Assistant',
		expertise: ['General'],
		ai: {
			model: 'claude-sonnet-4-5-20250929',
			temperature: 0.7,
		},
		instructions: 'You are a test agent.',
	};

	it('validates a standard Claude agent', () => {
		const result = AgentConfigSchema.safeParse(validAgent);
		expect(result.success).toBe(true);
	});

	it('validates agent with local model and provider', () => {
		const localAgent = {
			...validAgent,
			ai: {
				provider: 'local',
				model: 'lmstudio-community/Qwen2.5-3B-Instruct',
				temperature: 0.8,
			},
		};
		const result = AgentConfigSchema.safeParse(localAgent);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.ai.provider).toBe('local');
			expect(result.data.ai.model).toBe('lmstudio-community/Qwen2.5-3B-Instruct');
		}
	});

	it('validates agent without provider (optional field)', () => {
		const result = AgentConfigSchema.safeParse(validAgent);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.ai.provider).toBeUndefined();
		}
	});

	it('accepts any model string', () => {
		const agent = {
			...validAgent,
			ai: { model: 'some-custom-model-name', temperature: 0.5 },
		};
		const result = AgentConfigSchema.safeParse(agent);
		expect(result.success).toBe(true);
	});

	it('rejects empty model string', () => {
		const agent = {
			...validAgent,
			ai: { model: '', temperature: 0.5 },
		};
		const result = AgentConfigSchema.safeParse(agent);
		expect(result.success).toBe(false);
	});

	it('rejects temperature out of range', () => {
		const agent = {
			...validAgent,
			ai: { model: 'test', temperature: 1.5 },
		};
		const result = AgentConfigSchema.safeParse(agent);
		expect(result.success).toBe(false);
	});

	it('rejects missing required fields', () => {
		expect(AgentConfigSchema.safeParse({}).success).toBe(false);
		expect(AgentConfigSchema.safeParse({ name: 'A' }).success).toBe(false);
	});
});

describe('SparkConfigSchema', () => {
	const baseConfig = {
		version: 1,
		engine: { debounce_ms: 300, results: { add_blank_lines: true } },
		ai: {
			defaultProvider: 'claude-agent',
			providers: {},
		},
		logging: { level: 'info' as const, console: true },
		features: {
			slash_commands: true,
			chat_assistant: true,
			trigger_automation: true,
		},
	};

	it('validates config with anthropic provider', () => {
		const config = {
			...baseConfig,
			ai: {
				...baseConfig.ai,
				providers: {
					'claude-agent': {
						type: 'anthropic',
						model: 'claude-sonnet-4-5-20250929',
						maxTokens: 4096,
						temperature: 0.7,
					},
				},
			},
		};
		const result = SparkConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it('validates config with local provider', () => {
		const config = {
			...baseConfig,
			ai: {
				...baseConfig.ai,
				providers: {
					local: {
						type: 'local',
						model: 'lmstudio-community/Qwen2.5-3B-Instruct',
						maxTokens: 2048,
						temperature: 0.7,
						options: {
							backend: 'lmstudio',
							enableTools: false,
						},
					},
				},
			},
		};
		const result = SparkConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
		if (result.success) {
			const provider = result.data.ai.providers['local'];
			expect(provider.type).toBe('local');
			expect(provider.options).toEqual({ backend: 'lmstudio', enableTools: false });
		}
	});

	it('validates config with mixed providers', () => {
		const config = {
			...baseConfig,
			ai: {
				defaultProvider: 'claude-agent',
				providers: {
					'claude-agent': {
						type: 'anthropic',
						model: 'claude-sonnet-4-5-20250929',
						maxTokens: 4096,
						temperature: 0.7,
					},
					local: {
						type: 'local',
						model: 'smollm2-360m-instruct',
						maxTokens: 512,
						temperature: 0.7,
						options: { backend: 'lmstudio', enableTools: false },
					},
				},
			},
		};
		const result = SparkConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it('validates provider without options (optional)', () => {
		const config = {
			...baseConfig,
			ai: {
				...baseConfig.ai,
				providers: {
					test: {
						type: 'anthropic',
						model: 'claude-sonnet-4-5-20250929',
						maxTokens: 4096,
						temperature: 0.7,
					},
				},
			},
		};
		const result = SparkConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it('accepts any string for provider type', () => {
		const config = {
			...baseConfig,
			ai: {
				...baseConfig.ai,
				providers: {
					custom: {
						type: 'some-future-type',
						model: 'custom-model',
						maxTokens: 1024,
						temperature: 0.5,
					},
				},
			},
		};
		const result = SparkConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it('rejects empty provider type', () => {
		const config = {
			...baseConfig,
			ai: {
				...baseConfig.ai,
				providers: {
					bad: {
						type: '',
						model: 'test',
						maxTokens: 1024,
						temperature: 0.5,
					},
				},
			},
		};
		const result = SparkConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it('rejects empty model string', () => {
		const config = {
			...baseConfig,
			ai: {
				...baseConfig.ai,
				providers: {
					bad: {
						type: 'local',
						model: '',
						maxTokens: 1024,
						temperature: 0.5,
					},
				},
			},
		};
		const result = SparkConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	describe('localOverride', () => {
		const configWithProvider = {
			...baseConfig,
			ai: {
				defaultProvider: 'claude-agent',
				providers: {
					'claude-agent': {
						type: 'anthropic',
						model: 'claude-sonnet-4-5-20250929',
						maxTokens: 4096,
						temperature: 0.7,
					},
				},
			},
		};

		it('accepts config without localOverride (optional)', () => {
			const result = SparkConfigSchema.safeParse(configWithProvider);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.ai.localOverride).toBeUndefined();
			}
		});

		it('accepts config with enabled localOverride', () => {
			const config = {
				...configWithProvider,
				ai: {
					...configWithProvider.ai,
					localOverride: { enabled: true, model: 'test-model' },
				},
			};
			const result = SparkConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.ai.localOverride).toEqual({ enabled: true, model: 'test-model' });
			}
		});

		it('accepts config with disabled localOverride', () => {
			const config = {
				...configWithProvider,
				ai: {
					...configWithProvider.ai,
					localOverride: { enabled: false, model: '' },
				},
			};
			const result = SparkConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.ai.localOverride?.enabled).toBe(false);
			}
		});

		it('rejects localOverride with missing enabled field', () => {
			const config = {
				...configWithProvider,
				ai: {
					...configWithProvider.ai,
					localOverride: { model: 'test' },
				},
			};
			const result = SparkConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('rejects localOverride with missing model field', () => {
			const config = {
				...configWithProvider,
				ai: {
					...configWithProvider.ai,
					localOverride: { enabled: true },
				},
			};
			const result = SparkConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('rejects localOverride with non-boolean enabled', () => {
			const config = {
				...configWithProvider,
				ai: {
					...configWithProvider.ai,
					localOverride: { enabled: 'yes', model: 'test' },
				},
			};
			const result = SparkConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('rejects localOverride with non-string model', () => {
			const config = {
				...configWithProvider,
				ai: {
					...configWithProvider.ai,
					localOverride: { enabled: true, model: 123 },
				},
			};
			const result = SparkConfigSchema.safeParse(config);
			expect(result.success).toBe(false);
		});

		it('preserves localOverride through parse roundtrip', () => {
			const config = {
				...configWithProvider,
				ai: {
					...configWithProvider.ai,
					localOverride: { enabled: true, model: 'lmstudio-community/Qwen2.5-3B' },
				},
			};
			const result = SparkConfigSchema.safeParse(config);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.ai.localOverride?.model).toBe('lmstudio-community/Qwen2.5-3B');
				expect(result.data.ai.localOverride?.enabled).toBe(true);
			}
		});
	});
});
