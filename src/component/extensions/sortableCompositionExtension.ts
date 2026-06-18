import type { State } from "../../state/State";
import type { Component } from "../Component";
import type { Sortable, SortableExtensions, SortableOptions } from "../Sortable";

declare module "../Component" {
	interface ComponentExtensions {
		and<T, TItem extends Component = Component, K extends PropertyKey = number> (
			builder: typeof Sortable,
			input: readonly T[] | State.Readonly<readonly T[]>,
			options: SortableOptions<T, TItem, K>,
		): this & Component & SortableExtensions<T, TItem, K>;
	}
}
