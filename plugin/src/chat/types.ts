export interface ChatMessage {
	id: string;
	timestamp: string;
	type: 'user' | 'agent' | 'loading';
	content: string;
	agent?: string;
	filesModified?: string[];
}

export interface ChatConversation {
	id: string;
	created: string;
	updated: string;
	messages: ChatMessage[];
	mentionedAgents?: string[];
	name?: string; // Auto-generated chat name
}

export interface ChatState {
	isVisible: boolean;
	conversationId: string | null;
	messages: ChatMessage[];
	isProcessing: boolean;
	mentionedAgents: Set<string>;
	lastMentionedAgent: string | null; // Most recently mentioned agent (for conversation continuity)
	conversationName: string | null; // Auto-generated name from engine
	selectedModel: string | null; // Model override from dropdown (null = use default)
}
