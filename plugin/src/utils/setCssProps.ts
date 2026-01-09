type CssPropValue = string | number | null | undefined;

function toKebabCase(prop: string): string {
	// If it's already kebab-case, keep it.
	if (prop.includes('-')) return prop;
	return prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
}

/**
 * Set multiple CSS properties on an element using CSS variables / theme-friendly values.
 *
 * Prefer this over direct `element.style.foo = ...` assignments so style changes are centralized
 * and easier to audit.
 */
export function setCssProps(el: HTMLElement, props: Record<string, CssPropValue>): void {
	for (const [rawProp, value] of Object.entries(props)) {
		const prop = toKebabCase(rawProp);

		if (value === null || value === undefined || value === '') {
			el.style.removeProperty(prop);
			continue;
		}

		el.style.setProperty(prop, typeof value === 'number' ? `${value}px` : value);
	}
}
