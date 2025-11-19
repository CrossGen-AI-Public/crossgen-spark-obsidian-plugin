// Mock Obsidian API for testing
// This provides minimal stubs for Obsidian types used in the plugin

export class Plugin {
	app: any;
	manifest: any;
	constructor(app: any, manifest: any) {
		this.app = app;
		this.manifest = manifest;
	}
	async loadData(): Promise<any> {
		return {};
	}
	async saveData(_data: any): Promise<void> { }
	addCommand(_command: any): void { }
	addRibbonIcon(_icon: string, _title: string, _callback: () => void): void { }
	registerDomEvent(_el: HTMLElement, _type: string, _callback: () => void): void { }
	registerInterval(_intervalID: number): void { }
}

export class Modal {
	app: any;
	containerEl: HTMLElement;
	constructor(app: any) {
		this.app = app;
		this.containerEl = document.createElement('div');
	}
	open(): void { }
	close(): void { }
	onOpen(): void { }
	onClose(): void { }
}

export abstract class SuggestModal<T> extends Modal {
	getSuggestions(_query: string): T[] | Promise<T[]> {
		return [];
	}
	renderSuggestion(_value: T, _el: HTMLElement): void { }
	onChooseSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent): void { }
}

// Notice class - uses globalThis mock if available (for testing)
export class Notice {
	constructor(message: string, timeout?: number) {
		// Use globalThis.Notice if it exists (from tests)
		if ((globalThis as any).Notice && (globalThis as any).Notice !== Notice) {
			return new (globalThis as any).Notice(message, timeout);
		}
	}
}

export class ItemView {
	app: any;
	containerEl: HTMLElement;
	constructor(_leaf: any) {
		this.app = null;
		this.containerEl = document.createElement('div');
	}
	getViewType(): string {
		return 'view';
	}
	getDisplayText(): string {
		return 'View';
	}
	async onOpen(): Promise<void> { }
	async onClose(): Promise<void> { }
}

export class MarkdownView {
	app: any;
	file: any;
	editor: any;
	constructor() {
		this.app = null;
		this.file = null;
		this.editor = null;
	}
}

export class TFile {
	path: string;
	name: string;
	basename: string;
	extension: string;
	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() || '';
		this.extension = this.name.split('.').pop() || '';
		this.basename = this.name.replace(`.${this.extension}`, '');
	}
}

export class TFolder {
	path: string;
	name: string;
	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() || '';
	}
}

export const Platform = {
	isMobile: false,
	isDesktop: true,
	isMacOS: true,
	isWin: false,
	isLinux: false,
};

export const Workspace = {
	getActiveFile: () => null,
	getActiveViewOfType: () => null,
	on: () => { },
	off: () => { },
};

export const Vault = {
	read: () => Promise.resolve(''),
	modify: () => Promise.resolve(),
	create: () => Promise.resolve({} as any),
	delete: () => Promise.resolve(),
	getFiles: () => [],
	getAbstractFileByPath: () => null,
};

export const MetadataCache = {
	getFileCache: () => null,
	on: () => { },
	off: () => { },
};
