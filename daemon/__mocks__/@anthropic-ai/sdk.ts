/**
 * Mock for Anthropic SDK
 * Prevents actual API calls during testing
 */

export default class AnthropicMock {
    messages = {
        create: jest.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Mocked AI response for testing' }],
            usage: {
                input_tokens: 100,
                output_tokens: 50,
            },
            stop_reason: 'end_turn',
        }),
    };
}

