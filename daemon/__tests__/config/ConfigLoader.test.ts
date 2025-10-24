import { ConfigLoader } from '../../src/config/ConfigLoader.js';
import { DEFAULT_SPARK_CONFIG } from '../../src/config/ConfigDefaults.js';
import { TestVault } from '../utils/TestVault.js';

describe('ConfigLoader', () => {
    let vault: TestVault;
    let loader: ConfigLoader;

    beforeEach(async () => {
        vault = new TestVault();
        await vault.create();
        loader = new ConfigLoader();
    });

    afterEach(async () => {
        await vault.cleanup();
    });

    describe('constructor', () => {
        it('should create instance', () => {
            expect(loader).toBeInstanceOf(ConfigLoader);
        });
    });

    describe('load', () => {
        it('should return default config when no config file exists', async () => {
            const config = await loader.load(vault.root);

            expect(config).toEqual(DEFAULT_SPARK_CONFIG);
        });

        it('should merge user config with defaults', async () => {
            const userConfig = {
                daemon: {
                    debounce_ms: 500,
                },
                logging: {
                    level: 'debug',
                },
            };

            await vault.writeConfig(userConfig);
            const config = await loader.load(vault.root);

            // User overrides
            expect(config.daemon.debounce_ms).toBe(500);
            expect(config.logging.level).toBe('debug');

            // Defaults preserved
            expect(config.daemon.watch.patterns).toEqual(DEFAULT_SPARK_CONFIG.daemon.watch.patterns);
            expect(config.features.slash_commands).toBe(true);
        });

        it('should completely replace arrays', async () => {
            const userConfig = {
                daemon: {
                    watch: {
                        patterns: ['custom/*.md'],
                    },
                },
            };

            await vault.writeConfig(userConfig);
            const config = await loader.load(vault.root);

            expect(config.daemon.watch.patterns).toEqual(['custom/*.md']);
            expect(config.daemon.watch.patterns).not.toContain('**/*.md');
        });

        it('should handle nested config overrides', async () => {
            const userConfig = {
                ai: {
                    providers: {
                        'claude-client': {
                            model: 'claude-3-opus-20240229',
                            maxTokens: 8192,
                        },
                    },
                },
            };

            await vault.writeConfig(userConfig);
            const config = await loader.load(vault.root);

            expect(config.ai.providers['claude-client']!.model).toBe('claude-3-opus-20240229');
            expect(config.ai.providers['claude-client']!.maxTokens).toBe(8192);
            // Default preserved
            expect(config.ai.providers['claude-client']!.apiKeyEnv).toBe('ANTHROPIC_API_KEY');
        });

        it('should handle empty config file', async () => {
            await vault.writeFile('.spark/config.yaml', '');
            const config = await loader.load(vault.root);

            expect(config).toEqual(DEFAULT_SPARK_CONFIG);
        });

        it('should handle config with only comments', async () => {
            await vault.writeFile('.spark/config.yaml', '# This is a comment\n# Another comment');
            const config = await loader.load(vault.root);

            expect(config).toEqual(DEFAULT_SPARK_CONFIG);
        });

        it('should throw on invalid YAML', async () => {
            await vault.writeFile('.spark/config.yaml', 'invalid: yaml: content: [');

            await expect(loader.load(vault.root)).rejects.toThrow();
        });

        it('should throw on config validation failure', async () => {
            const invalidConfig = {
                daemon: {
                    watch: {
                        patterns: 'not-an-array', // Should be array
                        ignore: [],
                    },
                    debounce_ms: 300,
                },
            };

            await vault.writeConfig(invalidConfig);

            await expect(loader.load(vault.root)).rejects.toThrow();
        });

        it('should handle boolean overrides', async () => {
            const userConfig = {
                features: {
                    slash_commands: false,
                    trigger_automation: false,
                },
            };

            await vault.writeConfig(userConfig);
            const config = await loader.load(vault.root);

            expect(config.features.slash_commands).toBe(false);
            expect(config.features.trigger_automation).toBe(false);
            // Default preserved
            expect(config.features.chat_assistant).toBe(true);
        });

        it('should handle string overrides', async () => {
            const userConfig = {
                ai: {
                    claude: {
                        api_key_env: 'CUSTOM_KEY',
                    },
                },
            };

            await vault.writeConfig(userConfig);
            const config = await loader.load(vault.root);

            expect(config.ai.claude!.api_key_env).toBe('CUSTOM_KEY');
        });

        it('should handle number overrides', async () => {
            const userConfig = {
                ai: {
                    claude: {
                        max_tokens: 16000,
                        temperature: 0.9,
                    },
                },
            };

            await vault.writeConfig(userConfig);
            const config = await loader.load(vault.root);

            expect(config.ai.claude!.max_tokens).toBe(16000);
            expect(config.ai.claude!.temperature).toBe(0.9);
        });

        it('should handle null values', async () => {
            const userConfig = {
                logging: {
                    file: null,
                },
            };

            await vault.writeConfig(userConfig);
            const config = await loader.load(vault.root);

            expect(config.logging.file).toBeNull();
        });

        it('should load complete custom config', async () => {
            const userConfig = {
                daemon: {
                    watch: {
                        patterns: ['notes/**/*.md', 'docs/**/*.md'],
                        ignore: ['.git/**', 'node_modules/**'],
                    },
                    debounce_ms: 1000,
                },
                ai: {
                    provider: 'claude',
                    claude: {
                        model: 'claude-3-opus-20240229',
                        api_key_env: 'MY_KEY',
                        max_tokens: 8192,
                        temperature: 0.7,
                    },
                },
                logging: {
                    level: 'debug',
                    file: '/var/log/spark.log',
                    console: true,
                },
                features: {
                    slash_commands: true,
                    chat_assistant: false,
                    trigger_automation: true,
                },
            };

            await vault.writeConfig(userConfig);
            const config = await loader.load(vault.root);

            expect(config).toMatchObject(userConfig);
        });
    });

    describe('getConfigPath', () => {
        it('should return correct config path', () => {
            const expectedPath = `${vault.root}/.spark/config.yaml`;
            expect(loader.getConfigPath(vault.root)).toBe(expectedPath);
        });
    });

    describe('loadWithRetry', () => {
        it('should succeed on first attempt', async () => {
            const userConfig = {
                daemon: {
                    debounce_ms: 500,
                },
            };

            await vault.writeConfig(userConfig);
            const config = await loader.loadWithRetry(vault.root);

            expect(config.daemon.debounce_ms).toBe(500);
        });

        it('should return defaults when no config file exists', async () => {
            const config = await loader.loadWithRetry(vault.root);
            expect(config).toEqual(DEFAULT_SPARK_CONFIG);
        });

        it('should eventually fail after all retries', async () => {
            // Write invalid YAML that will consistently fail
            await vault.writeFile('.spark/config.yaml', 'invalid: yaml: [content');

            await expect(loader.loadWithRetry(vault.root, 1, 2)).rejects.toThrow();
        });

        it('should use exponential backoff between retries', async () => {
            // Write invalid config
            await vault.writeFile('.spark/config.yaml', 'invalid: [yaml');

            const startTime = Date.now();

            try {
                await loader.loadWithRetry(vault.root, 1, 3);
            } catch {
                // Expected to fail
            }

            const elapsed = Date.now() - startTime;
            // Should have delays: 200ms + 400ms = 600ms minimum
            expect(elapsed).toBeGreaterThanOrEqual(500);
        });
    });
});

