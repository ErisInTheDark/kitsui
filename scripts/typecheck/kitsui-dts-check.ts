import type { CleanupFunction, ComponentChild, StyleValue } from "kitsui";
import { Component, State, Style } from "kitsui";

const host = Component("div");
const state = State(host, 0);
const publicTypes: {
	child: ComponentChild;
	cleanup: CleanupFunction;
	style: StyleValue;
} = {
	child: host,
	cleanup: () => undefined,
	style: "red",
};

void state;
void Style;
void publicTypes;