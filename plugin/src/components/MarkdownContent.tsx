/**
 * MarkdownContent - React component for rendering markdown using Obsidian's renderer
 */

import { Component, MarkdownRenderer, type App } from 'obsidian';
import { useEffect, useRef } from 'react';

interface MarkdownContentProps {
	app: App;
	content: string;
	className?: string;
}

export function MarkdownContent({ app, content, className }: Readonly<MarkdownContentProps>) {
	const containerRef = useRef<HTMLDivElement>(null);
	const componentRef = useRef<Component | null>(null);

	useEffect(() => {
		// Create a new Obsidian Component for lifecycle management
		componentRef.current = new Component();
		componentRef.current.load();

		return () => {
			// Cleanup on unmount
			componentRef.current?.unload();
			componentRef.current = null;
		};
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		const component = componentRef.current;
		if (!container || !component) return;

		// Clear previous content
		container.empty();

		// Render markdown
		void MarkdownRenderer.render(app, content, container, '', component);
	}, [app, content]);

	return <div ref={containerRef} className={className} />;
}
