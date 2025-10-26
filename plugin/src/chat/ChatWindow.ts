import { App, Component } from 'obsidian';
import { ChatMessage, ChatState } from './types';
import SparkPlugin from '../main';
import { ConversationStorage } from './ConversationStorage';
import { ChatMentionHandler } from './ChatMentionHandler';
import { ChatSelector } from './ChatSelector';
import { ChatQueue } from './ChatQueue';
import { ChatResultWatcher, ChatResult } from './ChatResultWatcher';

export class ChatWindow extends Component {
	private app: App;
	private plugin: SparkPlugin;
	private containerEl: HTMLElement;
	private messagesEl: HTMLElement;
	private inputEl: HTMLDivElement;
	private titleEl: HTMLElement;
	private conversationStorage: ConversationStorage;
	private mentionHandler: ChatMentionHandler;
	private chatSelector: ChatSelector;
	private chatQueue: ChatQueue;
	private resultWatcher: ChatResultWatcher;
	private state: ChatState = {
		isVisible: false,
		conversationId: null,
		messages: [],
		isProcessing: false,
		mentionedAgents: new Set(),
		lastMentionedAgent: null,
	};

	constructor(app: App, plugin: SparkPlugin) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.conversationStorage = new ConversationStorage(app);
		this.mentionHandler = new ChatMentionHandler(app);
		this.chatQueue = new ChatQueue(app);
		this.resultWatcher = new ChatResultWatcher(app);
		this.chatSelector = new ChatSelector(
			app,
			this.conversationStorage,
			() => this.createNewChat(),
			(conversationId: string) => this.switchToConversation(conversationId)
		);
	}

	async onload() {
		await this.mentionHandler.initialize();
		this.createChatWindow();
		this.setupEventListeners();
		this.setupResultWatcher();
	}

	onunload() {
		this.resultWatcher.stop();
	}

	private setupResultWatcher() {
		// Listen for results from daemon
		this.resultWatcher.onResult((result: ChatResult) => {
			this.handleDaemonResult(result);
		});

		// Start watching
		void this.resultWatcher.start();
	}

	private createChatWindow() {
		// Create main container
		this.containerEl = document.createElement('div');
		this.containerEl.className = 'spark-chat-window';

		// Create header
		const headerEl = document.createElement('div');
		headerEl.className = 'spark-chat-header';

		// Create left side with title and dropdown
		const headerLeftEl = document.createElement('div');
		headerLeftEl.className = 'spark-chat-header-left';

		this.titleEl = document.createElement('div');
		this.titleEl.textContent = 'Spark Chat';
		this.titleEl.style.fontWeight = '600';
		this.titleEl.className = 'spark-chat-title';

		// Add dropdown button next to title
		this.chatSelector.createTitleSide(headerLeftEl);
		headerLeftEl.appendChild(this.titleEl);

		// Create right side with controls
		const headerRightEl = document.createElement('div');
		headerRightEl.className = 'spark-chat-header-right';

		// Add new chat button
		this.chatSelector.createRightSide(headerRightEl);

		const closeBtn = document.createElement('button');
		closeBtn.innerHTML = '×';
		closeBtn.className = 'spark-chat-close-btn';
		closeBtn.onclick = () => this.hide();

		headerRightEl.appendChild(closeBtn);

		headerEl.appendChild(headerLeftEl);
		headerEl.appendChild(headerRightEl);

		// Create messages container
		this.messagesEl = document.createElement('div');
		this.messagesEl.className = 'spark-chat-messages';

		// Create input container
		const inputContainerEl = document.createElement('div');
		inputContainerEl.className = 'spark-chat-input-container';

		const inputWrapperEl = document.createElement('div');
		inputWrapperEl.className = 'spark-chat-input-wrapper';

		this.inputEl = document.createElement('div');
		this.inputEl.className = 'spark-chat-input';
		this.inputEl.contentEditable = 'true';
		this.inputEl.setAttribute(
			'data-placeholder',
			'Type your message... (use @ to mention agents/files)'
		);
		this.inputEl.setAttribute('data-empty', 'true'); // Initially empty

		const sendBtn = document.createElement('button');
		sendBtn.className = 'spark-chat-send-btn';
		sendBtn.innerHTML = '↑';
		sendBtn.setAttribute('aria-label', 'Send message');
		sendBtn.onclick = () => this.sendMessage();

		inputWrapperEl.appendChild(this.inputEl);
		inputWrapperEl.appendChild(sendBtn);
		inputContainerEl.appendChild(inputWrapperEl);

		// Assemble window
		this.containerEl.appendChild(headerEl);
		this.containerEl.appendChild(this.messagesEl);
		this.containerEl.appendChild(inputContainerEl);

		// Add to document
		document.body.appendChild(this.containerEl);
		this.register(() => {
			document.body.removeChild(this.containerEl);
		});
	}

	private setupEventListeners() {
		// Attach mention handler to input with chat container reference
		this.mentionHandler.attachToInput(this.inputEl, this.containerEl);

		// Handle input changes for auto-height and placeholder
		this.inputEl.addEventListener('input', () => {
			// Check if input is truly empty (filter out zero-width spaces, BRs)
			const text = this.inputEl.textContent?.replace(/\u200B/g, '').trim() || '';
			const isEmpty = text.length === 0;

			// If empty, clear the input completely for proper placeholder display
			// This removes leftover BR elements, zero-width spaces, or empty text nodes
			if (isEmpty && this.inputEl.innerHTML !== '') {
				this.inputEl.innerHTML = '';
			}

			this.inputEl.setAttribute('data-empty', isEmpty ? 'true' : 'false');

			// Adjust height
			this.adjustInputHeight();
		});

		// Handle keyboard shortcuts
		this.inputEl.addEventListener('keydown', e => {
			// Let mention handler deal with palette first
			if (e.defaultPrevented) return;

			if (e.key === 'Enter') {
				if (e.shiftKey) {
					// Shift+Enter adds new line
					e.preventDefault();
					const selection = window.getSelection();
					if (selection && selection.rangeCount > 0) {
						const range = selection.getRangeAt(0);
						range.deleteContents();

						// Insert <br>
						const br = document.createElement('br');
						range.insertNode(br);

						// Insert zero-width space after BR to anchor cursor
						const zwsp = document.createTextNode('\u200B');
						if (br.nextSibling) {
							br.parentNode?.insertBefore(zwsp, br.nextSibling);
						} else {
							br.parentNode?.appendChild(zwsp);
						}

						// Position cursor at START of zero-width space (offset 0)
						// This allows typing to appear at correct position
						// When deleting, user deletes content first, then BR (zwsp is filtered in calculations)
						const newRange = document.createRange();
						newRange.setStart(zwsp, 0);
						newRange.setEnd(zwsp, 0);
						selection.removeAllRanges();
						selection.addRange(newRange);

						// Manually adjust height instead of triggering input event
						// (to avoid mention handler reprocessing and losing cursor position)
						this.adjustInputHeight();
					}
				} else {
					// Enter sends message
					e.preventDefault();
					this.sendMessage();
				}
			}
		});

		// Handle paste to strip formatting
		this.inputEl.addEventListener('paste', e => {
			e.preventDefault();
			const text = e.clipboardData?.getData('text/plain') || '';
			document.execCommand('insertText', false, text);
		});

		// Make window draggable
		this.makeDraggable();
	}

	private makeDraggable() {
		const headerEl = this.containerEl.querySelector('.spark-chat-header') as HTMLElement;
		let isDragging = false;
		let startX = 0;
		let startY = 0;
		let initialLeft = 0;
		let initialTop = 0;

		headerEl.addEventListener('mousedown', e => {
			if (e.target === headerEl || headerEl.contains(e.target as Node)) {
				isDragging = true;
				startX = e.clientX;
				startY = e.clientY;
				initialLeft = this.containerEl.offsetLeft;
				initialTop = this.containerEl.offsetTop;
				headerEl.style.cursor = 'grabbing';
			}
		});

		document.addEventListener('mousemove', e => {
			if (isDragging) {
				const deltaX = e.clientX - startX;
				const deltaY = e.clientY - startY;
				const newLeft = initialLeft + deltaX;
				const newTop = initialTop + deltaY;

				this.containerEl.style.left = newLeft + 'px';
				this.containerEl.style.top = newTop + 'px';
				this.containerEl.style.right = 'auto';
				this.containerEl.style.bottom = 'auto';
			}
		});

		document.addEventListener('mouseup', () => {
			if (isDragging) {
				isDragging = false;
				headerEl.style.cursor = 'move';
			}
		});
	}

	show() {
		this.containerEl.style.display = 'flex';
		this.state.isVisible = true;
		this.inputEl.focus();
		// Initialize conversation if needed
		void this.initializeConversation();
		// Preload conversations for instant dropdown response
		void this.chatSelector.loadConversations();
	}

	hide() {
		this.containerEl.style.display = 'none';
		this.state.isVisible = false;
	}

	toggle() {
		if (this.state.isVisible) {
			this.hide();
		} else {
			this.show();
		}
	}

	private async initializeConversation() {
		// Try to find most recent conversation
		const recentConversation = await this.findMostRecentConversation();
		if (recentConversation) {
			console.log('Spark Chat: Found recent conversation:', recentConversation);
			this.state.conversationId = recentConversation;
		} else {
			console.log('Spark Chat: No recent conversation found, creating new one');
			this.state.conversationId = this.generateConversationId();
		}

		// Load the conversation (whether it's existing or new)
		await this.loadConversation();
	}

	private generateConversationId(): string {
		return `chat-${Date.now()}`;
	}

	private async findMostRecentConversation(): Promise<string | null> {
		try {
			// Use ConversationStorage to find most recent conversation
			const recentConversation = await this.conversationStorage.getMostRecentConversation();
			console.log('Spark Chat: Most recent conversation from storage:', recentConversation);
			return recentConversation;
		} catch (error) {
			console.error('Spark Chat: Error finding recent conversation:', error);
			return null;
		}
	}

	private async loadConversation() {
		if (!this.state.conversationId) {
			console.log('Spark Chat: No conversation ID to load');
			return;
		}

		console.log('Spark Chat: Loading conversation:', this.state.conversationId);

		// Clear current messages
		this.messagesEl.innerHTML = '';
		this.state.messages = [];
		this.state.mentionedAgents.clear();
		this.state.lastMentionedAgent = null;

		// Try to load existing conversation using ConversationStorage
		try {
			const conversation = await this.conversationStorage.loadConversation(
				this.state.conversationId
			);
			if (conversation) {
				console.log('Spark Chat: Successfully loaded conversation data');
				this.state.messages = conversation.messages || [];
				this.state.mentionedAgents = new Set(conversation.mentionedAgents || []);

				// Restore lastMentionedAgent from message history
				// Find the most recent agent message (excluding "Spark Assistant")
				for (let i = this.state.messages.length - 1; i >= 0; i--) {
					const msg = this.state.messages[i];
					if (msg.type === 'agent' && msg.agent && msg.agent !== 'Spark Assistant') {
						this.state.lastMentionedAgent = msg.agent;
						break;
					}
				}

				this.renderAllMessages();
				this.updateChatTitle(Array.from(this.state.mentionedAgents));
				console.log(
					'Spark Chat: Loaded',
					this.state.messages.length,
					'messages and',
					this.state.mentionedAgents.size,
					'agents, last agent:',
					this.state.lastMentionedAgent
				);
			} else {
				console.log('Spark Chat: No conversation data found for ID:', this.state.conversationId);
			}
		} catch (error) {
			console.error('Spark Chat: Failed to load conversation:', error);
		}
	}

	private async saveConversation() {
		if (!this.state.conversationId) return;

		// Check if conversation is empty (no real messages, only loading messages)
		const hasRealMessages = this.state.messages.some(msg => msg.type !== 'loading');

		if (!hasRealMessages) {
			// Delete the empty conversation
			try {
				await this.conversationStorage.deleteConversation(this.state.conversationId);
				console.log('Spark Chat: Deleted empty conversation:', this.state.conversationId);
			} catch (error) {
				console.error('Spark Chat: Failed to delete empty conversation:', error);
			}
			return;
		}

		const conversationData = {
			id: this.state.conversationId,
			created: new Date().toISOString(),
			updated: new Date().toISOString(),
			messages: this.state.messages,
			mentionedAgents: Array.from(this.state.mentionedAgents),
		};

		try {
			await this.conversationStorage.saveConversation(conversationData);
			console.log('Spark Chat: Successfully saved conversation:', this.state.conversationId);
		} catch (error) {
			console.error('Spark Chat: Failed to save conversation:', error);
		}
	}

	private renderAllMessages() {
		this.messagesEl.innerHTML = '';
		this.state.messages.forEach(message => this.renderMessage(message));
		this.scrollToBottom();
	}

	private sendMessage() {
		const content = this.getInputText().trim();
		if (!content) return;

		const message: ChatMessage = {
			id: this.generateId(),
			timestamp: new Date().toISOString(),
			type: 'user',
			content,
		};

		this.addMessage(message);
		this.clearInput();

		// Process message through command executor
		void this.processMessage(message);
	}

	private getInputText(): string {
		return this.inputEl.textContent || '';
	}

	private clearInput(): void {
		this.inputEl.innerHTML = '';
		this.inputEl.setAttribute('data-empty', 'true');
		this.adjustInputHeight();
	}

	private adjustInputHeight(): void {
		// Reset height to auto to recalculate
		this.inputEl.style.height = 'auto';

		// Use min-height of 56px (2 lines) for empty or small content
		const minHeight = 56;
		const scrollHeight = Math.max(this.inputEl.scrollHeight, minHeight);

		// Limit height to 120px (like textarea behavior)
		if (scrollHeight > 120) {
			this.inputEl.style.height = '120px';
			this.inputEl.style.maxHeight = '120px';
			this.inputEl.style.overflowY = 'auto';
		} else {
			this.inputEl.style.height = scrollHeight + 'px';
			this.inputEl.style.maxHeight = 'none';
			this.inputEl.style.overflowY = 'hidden';
		}
	}

	addMessage(message: ChatMessage) {
		this.state.messages.push(message);
		this.renderMessage(message);
		this.scrollToBottom();
		// Save conversation after adding message
		void this.saveConversation();
	}

	private renderMessage(message: ChatMessage) {
		const messageEl = document.createElement('div');
		messageEl.className = `spark-chat-message spark-chat-${message.type}`;

		// Add agent name if present
		if (message.agent) {
			const agentEl = document.createElement('div');
			agentEl.className = 'spark-chat-agent-name';
			agentEl.textContent = message.agent;
			messageEl.appendChild(agentEl);
		}

		// Add message content
		const contentEl = document.createElement('div');
		contentEl.className = 'spark-chat-message-content';

		if (message.type === 'loading') {
			// Create jumping dots loader
			contentEl.innerHTML =
				'<span class="spark-chat-loading-dots">Thinking</span><span class="spark-jumping-dots"></span>';
		} else if (message.type === 'agent') {
			// Render agent responses as markdown
			void this.renderMarkdown(message.content, contentEl);
		} else {
			// User messages with mention decoration
			contentEl.innerHTML = this.decorateMentions(message.content);
		}

		messageEl.appendChild(contentEl);

		// Store message reference for removal
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(messageEl as any)._sparkMessage = message;

		this.messagesEl.appendChild(messageEl);
	}

	private async extractAgentNames(content: string): Promise<string[]> {
		const agentNames: string[] = [];
		// Match @mentions including hyphens and folder slashes (same pattern as decorateMentions)
		const mentionMatches = content.match(/@([\w-]+\/?)/g) || [];

		for (const match of mentionMatches) {
			const name = match.substring(1); // Remove @

			// Check if it's a folder (ends with /)
			const isFolder = name.endsWith('/');
			if (isFolder) {
				continue; // Skip folders
			}

			// Check if it's a valid agent (exists in .spark/agents/)
			// Following daemon's pattern: try agent first
			const agentPath = `.spark/agents/${name}.md`;
			const isAgent = await this.app.vault.adapter.exists(agentPath);

			// Only add to chat title if it's an actual agent
			if (isAgent) {
				agentNames.push(name);
			}
		}

		return agentNames;
	}

	private decorateMentions(content: string): string {
		// Escape HTML
		let html = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

		// Decorate @mentions
		html = html.replace(/@([\w-]+\/?)/g, (match, name) => {
			const isFolder = name.endsWith('/');
			const basename = isFolder ? name.slice(0, -1) : name;

			// Determine mention type
			let type = '';
			if (isFolder) {
				type = 'folder';
			} else {
				// Check if it's a file
				const isFile = this.app.vault.getMarkdownFiles().some(f => f.basename === basename);
				type = isFile ? 'file' : 'agent';
			}

			return `<span class="spark-token spark-token-${type}">${match}</span>`;
		});

		// Decorate /commands
		html = html.replace(/(?:^|\s)(\/[\w-]+)/g, (match, command) => {
			return match.replace(
				command,
				`<span class="spark-token spark-token-command">${command}</span>`
			);
		});

		return html;
	}

	private async renderMarkdown(content: string, containerEl: HTMLElement): Promise<void> {
		// Fallback to simple markdown-like rendering
		containerEl.innerHTML = this.simpleMarkdownToHtml(content);
	}

	private simpleMarkdownToHtml(markdown: string): string {
		// Simple markdown conversion for basic formatting
		let html = markdown
			// Escape HTML first
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			// Code blocks (```)
			.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
				return `<pre><code class="language-${lang || 'plaintext'}">${code.trim()}</code></pre>`;
			})
			// Inline code (`)
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			// Bold (**text** or __text__)
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/__([^_]+)__/g, '<strong>$1</strong>')
			// Italic (*text* or _text_)
			.replace(/\*([^*]+)\*/g, '<em>$1</em>')
			.replace(/_([^_]+)_/g, '<em>$1</em>')
			// Lists (- item or * item)
			.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
			// Newlines
			.replace(/\n/g, '<br>');

		// Wrap list items in ul
		html = html.replace(/(<li>.*<\/li>(?:<br>)?)+/g, match => {
			return '<ul>' + match.replace(/<br>/g, '') + '</ul>';
		});

		return html;
	}

	private scrollToBottom() {
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}

	private removeMessage(messageId: string) {
		// Remove from state
		this.state.messages = this.state.messages.filter(msg => msg.id !== messageId);

		// Remove from DOM
		const messageElements = this.messagesEl.querySelectorAll('.spark-chat-message');
		messageElements.forEach(el => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const message = (el as any)._sparkMessage;
			if (message && message.id === messageId) {
				this.messagesEl.removeChild(el);
			}
		});
	}

	// Chat selector methods
	createNewChat(): void {
		console.log('Spark Chat: Creating new chat');
		// Save current conversation if it has messages
		if (this.state.messages.length > 0) {
			void this.saveConversation();
		}

		// Reset state for new conversation
		this.state.messages = [];
		this.state.mentionedAgents.clear();
		this.state.conversationId = this.generateConversationId();
		this.messagesEl.innerHTML = '';
		this.updateChatTitle();
		this.chatSelector.update(this.state.conversationId);

		// Save the new empty conversation
		void this.saveConversation();

		// Invalidate cache so next dropdown shows updated list
		this.chatSelector.invalidateCache();
	}

	async switchToConversation(conversationId: string): Promise<void> {
		console.log('Spark Chat: Switching to conversation:', conversationId);

		// Save current conversation if it has messages and is different
		if (this.state.messages.length > 0 && this.state.conversationId !== conversationId) {
			await this.saveConversation();
		}

		// Load the selected conversation
		this.state.conversationId = conversationId;
		await this.loadConversation();
		this.chatSelector.update(conversationId);

		// Invalidate cache so next dropdown shows updated list
		this.chatSelector.invalidateCache();
	}

	// Public methods for ChatManager access
	getMessages(): ChatMessage[] {
		return [...this.state.messages]; // Return copy
	}

	getConversationId(): string | null {
		return this.state.conversationId;
	}

	isProcessing(): boolean {
		return this.state.isProcessing;
	}

	clearConversation() {
		this.state.messages = [];
		this.state.mentionedAgents.clear();
		this.state.lastMentionedAgent = null;
		this.state.conversationId = this.generateConversationId();
		this.messagesEl.innerHTML = '';
		this.updateChatTitle();
		this.chatSelector.update(this.state.conversationId);
		// Save the cleared conversation state
		void this.saveConversation();
	}

	private updateChatTitle(agentNames?: string[]) {
		if (!agentNames || agentNames.length === 0) {
			this.titleEl.textContent = 'Spark Chat';
			return;
		}

		// Filter out "Spark Assistant" and get unique real agents
		const realAgents = [...new Set(agentNames.filter(name => name !== 'Spark Assistant'))];

		if (realAgents.length === 0) {
			// No real agents, show default title
			this.titleEl.textContent = 'Spark Chat';
		} else if (realAgents.length === 1) {
			this.titleEl.textContent = `Chat with ${realAgents[0]}`;
		} else if (realAgents.length === 2) {
			this.titleEl.textContent = `Chat with ${realAgents[0]} and ${realAgents[1]}`;
		} else if (realAgents.length === 3) {
			this.titleEl.textContent = `Chat with ${realAgents[0]}, ${realAgents[1]} and ${realAgents[2]}`;
		} else {
			this.titleEl.textContent = `Chat with ${realAgents[0]}, ${realAgents[1]} and ${realAgents.length - 2} others`;
		}
	}

	private async processMessage(message: ChatMessage) {
		// Extract agent names (not files) from message
		const agentNames = await this.extractAgentNames(message.content);

		// Check if this is the first message with no agents in the conversation
		const hasAgentsInConversation = this.state.mentionedAgents.size > 0;
		const hasAgentsInMessage = agentNames.length > 0;

		// If no agents mentioned at all and no agents in conversation, show suggestion
		if (!hasAgentsInConversation && !hasAgentsInMessage) {
			// Show suggestion to mention an agent
			const suggestionMessage: ChatMessage = {
				id: this.generateId(),
				timestamp: new Date().toISOString(),
				type: 'agent',
				content:
					'💡 Tip: Mention an agent using @agent_name to get better responses. For example: @betty help me with this task.',
				agent: 'Spark Assistant',
			};
			this.addMessage(suggestionMessage);
			return; // Don't process the message further
		}

		// Track mentioned agents in state (only real agents, not files)
		agentNames.forEach(agentName => {
			this.state.mentionedAgents.add(agentName);
			// Update last mentioned agent (most recent one)
			this.state.lastMentionedAgent = agentName;
		});

		// Update chat title (excluding Spark Assistant if real agents are mentioned)
		this.updateChatTitle(Array.from(this.state.mentionedAgents));

		// Show loading message
		const loadingMessage: ChatMessage = {
			id: this.generateId(),
			timestamp: new Date().toISOString(),
			type: 'loading',
			content: 'Thinking',
		};
		this.addMessage(loadingMessage);
		this.state.isProcessing = true;

		try {
			// Build conversation history for context
			const history = this.state.messages
				.filter(msg => msg.type !== 'loading')
				.slice(-10) // Last 10 messages for context
				.map(msg => ({
					role: msg.type === 'user' ? 'user' : 'assistant',
					content: msg.content,
				}));

			// Enqueue message for daemon processing
			if (this.state.conversationId) {
				// Get currently active file for vault context
				const activeFile = this.app.workspace.getActiveFile();
				const activeFilePath = activeFile?.path;

				await this.chatQueue.enqueue(
					this.state.conversationId,
					message.content,
					history,
					activeFilePath,
					this.state.lastMentionedAgent || undefined
				);
				console.log('ChatWindow: Message enqueued for processing', {
					activeFilePath,
					primaryAgent: this.state.lastMentionedAgent,
				});
			}
		} catch (error) {
			console.error('ChatWindow: Failed to enqueue message:', error);
			// Remove loading message and show error
			this.removeMessage(loadingMessage.id);
			const errorMessage: ChatMessage = {
				id: this.generateId(),
				timestamp: new Date().toISOString(),
				type: 'agent',
				content: '❌ Failed to send message. Please try again.',
				agent: 'Spark Assistant',
			};
			this.addMessage(errorMessage);
			this.state.isProcessing = false;
		}
	}

	/**
	 * Handle result from daemon
	 */
	private handleDaemonResult(result: ChatResult): void {
		// Only process results for current conversation
		if (result.conversationId !== this.state.conversationId) {
			return;
		}

		console.log('ChatWindow: Received daemon result:', result);

		// Remove loading message
		const loadingMessages = this.state.messages.filter(msg => msg.type === 'loading');
		loadingMessages.forEach(msg => this.removeMessage(msg.id));

		// Add agent response
		if (result.error) {
			const errorMessage: ChatMessage = {
				id: this.generateId(),
				timestamp: new Date(result.timestamp).toISOString(),
				type: 'agent',
				content: `❌ Error: ${result.error}`,
				agent: result.agent || 'Spark Assistant',
			};
			this.addMessage(errorMessage);
		} else {
			const response: ChatMessage = {
				id: this.generateId(),
				timestamp: new Date(result.timestamp).toISOString(),
				type: 'agent',
				content: result.content,
				agent: result.agent,
				filesModified: result.filesModified,
			};
			this.addMessage(response);

			// Show file modification notification if any
			if (result.filesModified && result.filesModified.length > 0) {
				const notificationMessage: ChatMessage = {
					id: this.generateId(),
					timestamp: new Date(result.timestamp).toISOString(),
					type: 'agent',
					content: `📝 Modified ${result.filesModified.length} file(s):\n${result.filesModified.map(f => `  • ${f}`).join('\n')}`,
					agent: 'Spark Assistant',
				};
				this.addMessage(notificationMessage);
			}
		}

		this.state.isProcessing = false;

		// Clean up queue file
		void this.chatQueue.dequeue(result.queueId);
	}
}
