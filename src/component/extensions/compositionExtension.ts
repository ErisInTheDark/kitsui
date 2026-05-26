import type { Component, ComponentBuilderFunction } from "../Component";
import { Component as ComponentFactory } from "../Component";
import { hasComponentBuilder, markComponentBuilder } from "../ComponentComposition";

declare module "../Component" {
	interface ComponentExtensions {
		/**
		 * Composes this component with a builder function.
		 *
		 * The builder receives this component as its `this` context and must return the same component instance.
		 * Builders that have already been applied are skipped.
		 *
		 * @param builder The component builder function to apply.
		 * @param params Parameters forwarded to the builder.
		 * @returns This component narrowed with the builder's result type.
		 */
		and<PARAMS extends unknown[], RESULT extends Component> (
			builder: ComponentBuilderFunction<PARAMS, RESULT>,
			...params: PARAMS
		): this & RESULT;

		/**
		 * Checks whether this component has been marked with a builder identity.
		 *
		 * @param builder The builder identity to check.
		 * @returns True when the builder has been applied to this component.
		 */
		is<RESULT extends Component> (builder: ComponentBuilderFunction<any[], RESULT>): this is this & RESULT;

		/**
		 * Returns this component narrowed to the builder result type when the builder has been applied.
		 *
		 * @param builder The builder identity to check.
		 * @returns This component when marked with the builder, otherwise undefined.
		 */
		as<RESULT extends Component> (builder: ComponentBuilderFunction<any[], RESULT>): (this & RESULT) | undefined;
	}
}

let patched = false;

function isComponent (value: unknown): value is Component {
	return value instanceof ComponentFactory.extend();
}

function ensureActive (component: Component): void {
	if (component.disposed) {
		throw new Error("Disposed components cannot be modified.");
	}
}

/**
 * Registers component composition extensions.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export default function compositionExtension (): void {
	if (patched) {
		return;
	}

	patched = true;
	const ComponentClass = ComponentFactory.extend();
	const prototype = ComponentClass.prototype as Component;

	prototype.and = function and<PARAMS extends unknown[], RESULT extends Component> (
		this: Component,
		builder: ComponentBuilderFunction<PARAMS, RESULT>,
		...params: PARAMS
	): Component & RESULT {
		ensureActive(this);

		if (typeof builder !== "function") {
			throw new TypeError("Component.and requires a builder function.");
		}

		if (hasComponentBuilder(this, builder)) {
			return this as Component & RESULT;
		}

		const result = builder.call(this, ...params);

		if (!isComponent(result)) {
			throw new TypeError("Component builders must return a Component.");
		}

		if (result !== this) {
			throw new Error("Component.and builders must return the component they were called on.");
		}

		markComponentBuilder(this, builder);
		return this as Component & RESULT;
	};

	prototype.is = function is<RESULT extends Component> (
		this: Component,
		builder: ComponentBuilderFunction<any[], RESULT>,
	): this is Component & RESULT {
		return typeof builder === "function" && hasComponentBuilder(this, builder);
	};

	prototype.as = function as<RESULT extends Component> (
		this: Component,
		builder: ComponentBuilderFunction<any[], RESULT>,
	): (Component & RESULT) | undefined {
		return this.is(builder) ? this as Component & RESULT : undefined;
	};
}
