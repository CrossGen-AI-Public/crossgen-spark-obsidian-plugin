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
	private validAgents: Set<string> = new Set();
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
		this.mentionHandler = new ChatMentionHandler(app, plugin);
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
		await this.loadValidAgents();
		this.createChatWindow();
		this.setupEventListeners();
		this.setupResultWatcher();
	}

	/**
	 * Load list of valid agents for validation
	 */
	private async loadValidAgents(): Promise<void> {
		try {
			this.validAgents.clear();
			const agentsFolderExists = await this.app.vault.adapter.exists('.spark/agents');
			if (!agentsFolderExists) {
				console.error('[ChatWindow] .spark/agents folder does not exist');
				return;
			}

			const agentsFolder = await this.app.vault.adapter.list('.spark/agents');
			for (const file of agentsFolder.files) {
				const basename = file.replace('.spark/agents/', '').replace('.md', '');
				// Skip README files
				if (basename.toLowerCase() === 'readme') {
					continue;
				}
				this.validAgents.add(basename);
			}
		} catch (error) {
			console.error('[ChatWindow] Failed to load agents:', error);
		}
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

	/**
	 * Add agent mention to chat - either opens new chat or appends to existing
	 */
	addAgentMention(agentName: string): void {
		if (this.state.isVisible) {
			// Chat is open - append mention to existing input
			this.insertAgentMention(agentName);
		} else {
			// Chat is closed - open new chat with agent
			this.openWithAgent(agentName);
		}
	}

	/**
	 * Insert agent mention into current chat input
	 */
	private insertAgentMention(agentName: string): void {
		// Get current content and trim trailing spaces to avoid double spaces
		const currentText = (this.inputEl.textContent || '').trimEnd();

		// Add space before mention only if content exists (since we trimmed, it won't end with space)
		const prefix = currentText.length > 0 ? ' ' : '';

		// Build new content with mention (no trailing space yet - will add after decoration)
		const newContent = `${currentText}${prefix}@${agentName}`;
		this.inputEl.textContent = newContent;

		// Remove placeholder state
		this.inputEl.setAttribute('data-empty', 'false');

		// Focus input first (before processContent, so focus event's processContent runs first)
		this.inputEl.focus();

		// Process content to apply mention decoration
		this.mentionHandler.processContent();

		// Now append a space AFTER decoration (as a non-breaking space to ensure it's visible)
		const spaceText = document.createTextNode('\u00A0'); // Non-breaking space
		this.inputEl.appendChild(spaceText);

		// Set cursor after the space
		const range = document.createRange();
		const selection = window.getSelection();
		range.setStartAfter(spaceText);
		range.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	/**
	 * Open new chat with agent mention
	 */
	private openWithAgent(agentName: string): void {
		// Show window first (but don't initialize conversation yet)
		this.containerEl.style.display = 'flex';
		this.state.isVisible = true;

		// Create NEW conversation (clears everything)
		this.createNewChat();

		// Pre-fill input with agent mention (no trailing space yet - will add after decoration)
		const mention = `@${agentName}`;
		this.inputEl.innerHTML = ''; // Clear any existing content
		this.inputEl.textContent = mention;

		// Remove placeholder state
		this.inputEl.setAttribute('data-empty', 'false');

		// Update state
		this.state.lastMentionedAgent = agentName;
		this.state.mentionedAgents.add(agentName);

		// Update title
		this.updateChatTitle([agentName]);

		// Process content to apply mention decoration
		this.mentionHandler.processContent();

		// Now append a space AFTER decoration (as a non-breaking space to ensure it's visible)
		const spaceText = document.createTextNode('\u00A0'); // Non-breaking space
		this.inputEl.appendChild(spaceText);

		// Wait for next tick to ensure DOM is ready, then focus and position cursor
		window.setTimeout(() => {
			this.inputEl.focus();

			// Position cursor at the very end of the input (after all content)
			const range = document.createRange();
			const selection = window.getSelection();

			// Select the entire content and collapse to end
			range.selectNodeContents(this.inputEl);
			range.collapse(false); // false = collapse to end

			selection?.removeAllRanges();
			selection?.addRange(range);
		}, 50); // 50ms to ensure everything is settled
	}

	private async initializeConversation() {
		// Try to find most recent conversation
		const recentConversation = await this.findMostRecentConversation();
		if (recentConversation) {
			this.state.conversationId = recentConversation;
		} else {
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
			return recentConversation;
		} catch (error) {
			console.error('Spark Chat: Error finding recent conversation:', error);
			return null;
		}
	}

	private async loadConversation() {
		if (!this.state.conversationId) {
			return;
		}

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
			contentEl.innerHTML = `<span class="spark-chat-loading-dots">${message.content}</span><span class="spark-jumping-dots"></span>`;
		} else if (message.type === 'agent') {
			// Render agent responses as markdown
			void this.renderMarkdown(message.content, contentEl);
			// Add click handler for mentions in agent responses
			contentEl.addEventListener('click', (e: MouseEvent) => {
				this.handleMessageClick(e);
			});
		} else {
			// User messages with mention decoration
			contentEl.innerHTML = this.decorateMentions(message.content);
			// Add click handler for mentions in user messages
			contentEl.addEventListener('click', (e: MouseEvent) => {
				this.handleMessageClick(e);
			});
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

		// Decorate @mentions (avoid emails - at start OR not preceded by email chars)
		html = html.replace(/(^|(?<![a-zA-Z0-9._]))(@[\w-]+\/?)/g, (match, prefix, mention) => {
			const type = this.validateMention(mention);
			if (type) {
				return `${prefix}<span class="spark-token spark-token-${type}" data-token="${mention}" data-type="${type}">${mention}</span>`;
			}
			return match; // Not a valid mention, keep as-is
		});

		// Decorate /commands
		html = html.replace(/(?:^|\s)(\/[\w-]+)/g, (match, command) => {
			const type = this.validateCommand(command);
			if (type) {
				return match.replace(
					command,
					`<span class="spark-token spark-token-command" data-token="${command}" data-type="command">${command}</span>`
				);
			}
			return match; // Not a valid command, keep as-is
		});

		return html;
	}

	/**
	 * Validate mention and determine type (agent/file/folder)
	 * Note: Uses adapter for agents since .spark/ is filtered from getMarkdownFiles()
	 */
	private validateMention(mention: string): string | null {
		const isFolder = mention.endsWith('/');
		const basename = mention.substring(1); // Remove @

		if (isFolder) {
			const folderPath = basename;
			const folderExists = this.app.vault
				.getMarkdownFiles()
				.some(f => f.path.startsWith(folderPath));
			return folderExists ? 'folder' : null;
		} else {
			// Check if it's an agent FIRST (using cached list)
			if (this.validAgents.has(basename)) {
				return 'agent';
			}

			// Then check if it's a regular file
			const fileExists = this.app.vault.getMarkdownFiles().some(f => f.basename === basename);

			if (fileExists) {
				return 'file';
			}

			return null;
		}
	}

	/**
	 * Validate command
	 */
	private validateCommand(command: string): string | null {
		const commandName = command.substring(1); // Remove /
		const commandExists = this.app.vault
			.getMarkdownFiles()
			.some(f => f.path === `.spark/commands/${commandName}.md`);
		return commandExists ? 'command' : null;
	}

	/**
	 * Decorate mentions in already-rendered HTML content
	 * Used for agent responses after markdown rendering
	 *
	 * Note: We process the HTML post-render instead of pre-render because:
	 * - Markdown rendering happens first and produces HTML structure
	 * - We need to preserve code blocks and other HTML elements
	 * - TreeWalker allows us to only process text nodes, not HTML tags
	 * - Mentions are decorated even inside code elements for easy navigation
	 */
	private decorateMentionsInElement(element: HTMLElement): void {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
		const nodesToProcess: { node: Text; parent: Node }[] = [];

		// Collect text nodes that might contain mentions
		let currentNode = walker.nextNode();
		while (currentNode) {
			if (currentNode.textContent && currentNode.parentNode) {
				const text = currentNode.textContent;
				// Only process if contains potential mentions/commands
				if (text.includes('@') || text.includes('/')) {
					nodesToProcess.push({
						node: currentNode as Text,
						parent: currentNode.parentNode,
					});
				}
			}
			currentNode = walker.nextNode();
		}

		// Process collected nodes (done separately to avoid modifying while iterating)
		for (const { node, parent } of nodesToProcess) {
			this.decorateTextNode(node, parent);
		}
	}

	/**
	 * Decorate mentions in a single text node
	 */
	private decorateTextNode(textNode: Text, parent: Node): void {
		const text = textNode.textContent || '';

		// Match @mentions at start of string OR not preceded by email characters
		// Handles both emails (client@company.com) and valid mentions (@alice)
		const mentionRegex = /(^|(?<![a-zA-Z0-9._]))(@[\w-]+\/?)/g;
		const commandRegex = /(?:^|\s)(\/[\w-]+)/g;

		// Find all mentions and commands
		const replacements: Array<{
			start: number;
			end: number;
			text: string;
			type: string;
		}> = [];

		let match;
		while ((match = mentionRegex.exec(text)) !== null) {
			// Group 2 is the @mention (group 1 is the prefix or start)
			const mention = match[2];
			const mentionStart = match.index + match[1].length;

			const type = this.validateMention(mention);

			// Only add if it's a valid mention
			if (type) {
				replacements.push({
					start: mentionStart,
					end: mentionStart + mention.length,
					text: mention,
					type,
				});
			}
		}

		// Reset regex
		commandRegex.lastIndex = 0;
		while ((match = commandRegex.exec(text)) !== null) {
			const command = match[1];
			const type = this.validateCommand(command);

			// Only add if it's a valid command
			if (type) {
				replacements.push({
					start: match.index + (match[0].length - command.length),
					end: match.index + match[0].length,
					text: command,
					type,
				});
			}
		}

		if (replacements.length === 0) return;

		// Sort by position
		replacements.sort((a, b) => a.start - b.start);

		// Create fragment with decorated mentions
		const fragment = document.createDocumentFragment();
		let lastIndex = 0;

		for (const replacement of replacements) {
			// Add text before mention
			if (replacement.start > lastIndex) {
				fragment.appendChild(document.createTextNode(text.substring(lastIndex, replacement.start)));
			}

			// Add decorated mention
			const span = document.createElement('span');
			span.className = `spark-token spark-token-${replacement.type}`;
			span.setAttribute('data-token', replacement.text);
			span.setAttribute('data-type', replacement.type);
			span.textContent = replacement.text;
			fragment.appendChild(span);

			lastIndex = replacement.end;
		}

		// Add remaining text
		if (lastIndex < text.length) {
			fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
		}

		// Replace the text node with the fragment
		parent.replaceChild(fragment, textNode);
	}

	/**
	 * Handle clicks on mentions in messages
	 */
	private handleMessageClick(event: MouseEvent): void {
		const target = event.target as HTMLElement;

		if (!target.classList.contains('spark-token')) {
			return;
		}

		const token = target.getAttribute('data-token');
		const type = target.getAttribute('data-type');

		if (!token) return;

		// Handle commands differently
		if (type === 'command') {
			// TODO: Show command documentation or execute command
			return;
		}

		// Check if Cmd (Mac) or Ctrl (Windows/Linux) is pressed
		const newTab = event.metaKey || event.ctrlKey;

		// Remove the @ prefix for mentions
		const path = token.substring(1);

		if (type === 'folder') {
			// For folders, try to open the folder in file explorer
			const folder = this.app.vault.getAbstractFileByPath(path);
			if (folder) {
				// Reveal folder in file explorer
				// @ts-expect-error - Using Obsidian internal API
				this.app.internalPlugins.getPluginById('file-explorer')?.instance?.revealInFolder(folder);
			}
		} else {
			// For file/agent mentions
			// Try to find as file first
			const file = this.app.vault.getMarkdownFiles().find(f => f.basename === path);
			if (file) {
				const leaf = newTab ? this.app.workspace.getLeaf('tab') : this.app.workspace.getLeaf();
				void leaf.openFile(file);
			} else {
				// Check if it's an agent file
				const agentFile = this.app.vault
					.getMarkdownFiles()
					.find(f => f.path === `.spark/agents/${path}.md`);
				if (agentFile) {
					const leaf = newTab ? this.app.workspace.getLeaf('tab') : this.app.workspace.getLeaf();
					void leaf.openFile(agentFile);
				}
			}
		}

		event.preventDefault();
	}

	private async renderMarkdown(content: string, containerEl: HTMLElement): Promise<void> {
		// Fallback to simple markdown-like rendering
		containerEl.innerHTML = this.simpleMarkdownToHtml(content);
		// After rendering, decorate mentions in the HTML
		this.decorateMentionsInElement(containerEl);
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

		// Show loading message with agent name
		const agentName = this.state.lastMentionedAgent || 'Agent';
		const capitalizedAgentName = agentName.charAt(0).toUpperCase() + agentName.slice(1);
		const loadingMessage: ChatMessage = {
			id: this.generateId(),
			timestamp: new Date().toISOString(),
			type: 'loading',
			content: `${capitalizedAgentName} is typing`,
		};
		this.addMessage(loadingMessage);
		this.state.isProcessing = true;

		try {
			// Build conversation history for context (exclude current message)
			const history = this.state.messages
				.filter(msg => msg.type !== 'loading' && msg.id !== message.id)
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
