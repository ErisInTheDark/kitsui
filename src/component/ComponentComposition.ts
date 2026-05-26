const componentBuilders = new WeakMap<object, Set<Function>>();

export function markComponentBuilder (component: object, builder: Function): void {
	let builders = componentBuilders.get(component);

	if (!builders) {
		builders = new Set();
		componentBuilders.set(component, builders);
	}

	builders.add(builder);
}

export function hasComponentBuilder (component: object, builder: Function): boolean {
	return componentBuilders.get(component)?.has(builder) ?? false;
}
