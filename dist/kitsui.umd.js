(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    define([], factory);
  } else {
    root.Kitsui = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

"use strict";
var __kitsui_factory__ = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    AriaManipulator: () => AriaManipulator,
    AttributeManipulator: () => AttributeManipulator,
    ClassManipulator: () => ClassManipulator,
    Component: () => Component,
    EventManipulator: () => EventManipulator,
    Owner: () => Owner,
    State: () => State,
    Style: () => Style,
    StyleFontFace: () => StyleFontFace,
    StyleImport: () => StyleImport,
    StyleReset: () => StyleReset,
    TextManipulator: () => TextManipulator,
    darkScheme: () => darkScheme,
    elements: () => elements,
    lightScheme: () => lightScheme,
    pseudoAfter: () => pseudoAfter,
    pseudoBefore: () => pseudoBefore,
    whenActive: () => whenActive,
    whenActiveSelf: () => whenActiveSelf,
    whenClosed: () => whenClosed,
    whenEmpty: () => whenEmpty,
    whenEven: () => whenEven,
    whenFirst: () => whenFirst,
    whenFocus: () => whenFocus,
    whenFocusAny: () => whenFocusAny,
    whenFocusAnySelf: () => whenFocusAnySelf,
    whenFocusSelf: () => whenFocusSelf,
    whenFull: () => whenFull,
    whenHover: () => whenHover,
    whenHoverSelf: () => whenHoverSelf,
    whenLast: () => whenLast,
    whenMiddle: () => whenMiddle,
    whenNotFirst: () => whenNotFirst,
    whenNotLast: () => whenNotLast,
    whenOdd: () => whenOdd,
    whenOpen: () => whenOpen,
    whenStuck: () => whenStuck
  });

  // src/state/State.ts
  var noop = () => {
  };
  function createStateGraph() {
    return {
      pendingListeners: /* @__PURE__ */ new Set(),
      scheduled: false
    };
  }
  function scheduleGraphFlush(graph) {
    if (graph.scheduled) {
      return;
    }
    graph.scheduled = true;
    const flush = () => {
      graph.scheduled = false;
      const pendingListeners = [...graph.pendingListeners];
      graph.pendingListeners.clear();
      for (const pendingListener of pendingListeners) {
        pendingListener.pending = false;
        if (!pendingListener.active) {
          continue;
        }
        if (pendingListener.equals(pendingListener.pendingOriginalValue, pendingListener.pendingFinalValue)) {
          continue;
        }
        pendingListener.listener(pendingListener.pendingFinalValue, pendingListener.pendingOriginalValue);
      }
    };
    const schedulerRef = globalThis;
    if (typeof schedulerRef.scheduler?.yield === "function") {
      void schedulerRef.scheduler.yield().then(flush);
      return;
    }
    queueMicrotask(flush);
  }
  var Owner = class {
    /** @hidden */
    constructor() {
      __publicField(this, "cleanupFunctions", /* @__PURE__ */ new Set());
      __publicField(this, "disposedValue", false);
    }
    /**
     * Whether this owner has been disposed.
     * @readonly
     */
    get disposed() {
      return this.disposedValue;
    }
    /**
     * Disposes this owner and invokes all registered cleanup functions.
     * Once disposed, an owner cannot be used again.
     * Subsequent calls to `dispose()` are no-ops.
     */
    dispose() {
      if (this.disposedValue) {
        return;
      }
      this.disposedValue = true;
      this.beforeDispose();
      const cleanupFunctions = [...this.cleanupFunctions];
      this.cleanupFunctions.clear();
      for (const cleanupFunction of cleanupFunctions) {
        cleanupFunction();
      }
      this.afterDispose();
    }
    /**
     * Registers a cleanup function to be invoked when this owner is disposed.
     * If the owner is already disposed, the cleanup function is invoked immediately.
     * @param cleanupFunction Function to invoke during cleanup.
     * @returns A function that unregisters the cleanup function. Calling it prevents the cleanup function from being invoked later.
     */
    onCleanup(cleanupFunction) {
      if (this.disposedValue) {
        cleanupFunction();
        return noop;
      }
      let active = true;
      const registeredCleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        this.cleanupFunctions.delete(registeredCleanup);
        cleanupFunction();
      };
      this.cleanupFunctions.add(registeredCleanup);
      return () => {
        if (!active) {
          return;
        }
        active = false;
        this.cleanupFunctions.delete(registeredCleanup);
      };
    }
    /**
     * Hook invoked before cleanup functions run during disposal.
     * Subclasses may override to perform custom pre-disposal logic.
     * @protected
     */
    beforeDispose() {
    }
    /**
     * Hook invoked after all cleanup functions have run during disposal.
     * Subclasses may override to perform custom post-disposal logic.
     * @protected
     */
    afterDispose() {
    }
  };
  var orphanedStateErrorMessage = "States must have an owner before the next tick.";
  var StateClass = class _StateClass extends Owner {
    constructor(owner, initialValue, options = {}) {
      super();
      __publicField(this, "owner");
      __publicField(this, "releaseOwner", noop);
      __publicField(this, "isImplicitOwner", false);
      __publicField(this, "requiresExplicitOwner", false);
      __publicField(this, "orphanCheckId", null);
      __publicField(this, "currentValue");
      __publicField(this, "equalityFunction");
      __publicField(this, "graph");
      __publicField(this, "immediateListeners", /* @__PURE__ */ new Set());
      __publicField(this, "queuedListeners", /* @__PURE__ */ new Set());
      this.owner = owner;
      this.currentValue = initialValue;
      this.equalityFunction = options.equals ?? Object.is;
      this.graph = options.graph ?? createStateGraph();
      if (owner) {
        this.releaseOwner = owner.onCleanup(() => {
          this.dispose();
        });
      } else {
        this.refreshOrphanCheck();
      }
    }
    /**
     * Returns the owner that manages this state's lifecycle, or null if ownerless.
     */
    getOwner() {
      return this.owner;
    }
    /**
     * The current state value. Changes to this value trigger listeners.
     */
    get value() {
      return this.currentValue;
    }
    /**
     * Returns the internal state graph used for batching queued listeners.
     * This is typically used internally by extensions and should not be accessed directly.
     * @internal
     */
    getGraph() {
      return this.graph;
    }
    /**
     * Updates the state to a new value.
     * If the new value is equal to the current value (by the equality function),
     * the value is unchanged and no listeners are invoked.
     * Immediate listeners are invoked synchronously; queued listeners are batched and called asynchronously.
     * @param nextValue The new value for this state.
     * @returns The new state value.
     * @throws If the state has been disposed.
     */
    set(nextValue) {
      this.ensureActive();
      if (this.equalityFunction(this.currentValue, nextValue)) {
        return this.currentValue;
      }
      const previousValue = this.currentValue;
      this.currentValue = nextValue;
      for (const listenerRecord of [...this.immediateListeners]) {
        if (!listenerRecord.active) {
          continue;
        }
        listenerRecord.listener(this.currentValue, previousValue);
      }
      for (const listenerRecord of this.queuedListeners) {
        if (!listenerRecord.active) {
          continue;
        }
        if (!listenerRecord.pending) {
          listenerRecord.pending = true;
          listenerRecord.pendingOriginalValue = previousValue;
          listenerRecord.pendingFinalValue = this.currentValue;
          listenerRecord.equals = this.equalityFunction;
          listenerRecord.graph.pendingListeners.add(listenerRecord);
          scheduleGraphFlush(listenerRecord.graph);
          continue;
        }
        listenerRecord.pendingFinalValue = this.currentValue;
      }
      return this.currentValue;
    }
    /**
     * Updates the state by applying a function to the current value.
     * @param updater Function that transforms the current value to a new value.
     * @returns The new state value.
     * @throws If the state has been disposed.
     */
    update(updater) {
      this.ensureActive();
      return this.set(updater(this.currentValue));
    }
    /**
     * Sets a new equality function for comparing state values.
     * This affects all subsequent calls to `set()` but does not re-evaluate existing listeners.
     * @param equals Custom equality function.
     * @returns This state instance for method chaining.
     * @throws If the state has been disposed.
     */
    setEquality(equals) {
      this.ensureActive();
      this.equalityFunction = equals;
      return this;
    }
    /**
     * Subscribes to synchronous state changes without binding to an owner.
     * The listener is invoked immediately (synchronously) whenever the state value changes.
     * Use this for quick derivations and computed values. If the state is disposed, returns a no-op unsubscribe function.
     * @param listener Function called with (newValue, previousValue) on each change.
     * @returns Function to unsubscribe the listener.
     */
    subscribeImmediateUnbound(listener) {
      if (this.disposed) {
        return noop;
      }
      const listenerRecord = {
        active: true,
        listener
      };
      this.immediateListeners.add(listenerRecord);
      return () => {
        if (!listenerRecord.active) {
          return;
        }
        listenerRecord.active = false;
        this.immediateListeners.delete(listenerRecord);
      };
    }
    /**
     * Subscribes to asynchronous state changes without binding to an owner.
     * Listeners are batched and invoked together in microtasks, receiving only the original and final values.
     * Multiple state changes between listener invocations are coalesced.
     * Use this for side effects that can tolerate slight delays. If the state is disposed, returns a no-op unsubscribe function.
     * @param listener Function called with (finalValue, originalValue) after batched changes.
     * @returns Function to unsubscribe the listener.
     */
    subscribeUnbound(listener) {
      if (this.disposed) {
        return noop;
      }
      const listenerRecord = {
        active: true,
        equals: this.equalityFunction,
        graph: this.graph,
        listener,
        pending: false,
        pendingFinalValue: this.currentValue,
        pendingOriginalValue: this.currentValue
      };
      this.queuedListeners.add(listenerRecord);
      return () => {
        if (!listenerRecord.active) {
          return;
        }
        listenerRecord.active = false;
        if (listenerRecord.pending) {
          listenerRecord.pending = false;
          this.graph.pendingListeners.delete(listenerRecord);
        }
        this.queuedListeners.delete(listenerRecord);
      };
    }
    /**
     * Subscribes to synchronous state changes with automatic cleanup via an owner.
     * The listener is invoked immediately (synchronously) whenever the state value changes.
     * The subscription is automatically cleaned up when the owner is disposed.
     * @param owner The owner that will manage the subscription lifecycle.
     * @param listener Function called with (newValue, previousValue) on each change.
     * @returns Function to unsubscribe (also triggered automatically when owner is disposed).
     */
    subscribeImmediate(owner, listener) {
      this.setImplicitOwnerCandidate(owner);
      const unsubscribe = this.subscribeImmediateUnbound(listener);
      let active = true;
      const releaseOwner = owner.onCleanup(() => {
        if (!active) {
          return;
        }
        active = false;
        unsubscribe();
      });
      return () => {
        if (!active) {
          return;
        }
        active = false;
        releaseOwner();
        unsubscribe();
      };
    }
    /**
     * Subscribes to asynchronous state changes with automatic cleanup via an owner.
     * Listeners are batched and invoked together in microtasks, receiving only the original and final values.
     * The subscription is automatically cleaned up when the owner is disposed.
     * @param owner The owner that will manage the subscription lifecycle.
     * @param listener Function called with (finalValue, originalValue) after batched changes.
     * @returns Function to unsubscribe (also triggered automatically when owner is disposed).
     */
    subscribe(owner, listener) {
      this.setImplicitOwnerCandidate(owner);
      const unsubscribe = this.subscribeUnbound(listener);
      let active = true;
      const releaseOwner = owner.onCleanup(() => {
        if (!active) {
          return;
        }
        active = false;
        unsubscribe();
      });
      return () => {
        if (!active) {
          return;
        }
        active = false;
        releaseOwner();
        unsubscribe();
      };
    }
    beforeDispose() {
      this.clearOrphanCheck();
      this.releaseOwner();
      this.releaseOwner = noop;
      for (const listenerRecord of this.immediateListeners) {
        listenerRecord.active = false;
      }
      for (const listenerRecord of this.queuedListeners) {
        listenerRecord.active = false;
        if (listenerRecord.pending) {
          listenerRecord.pending = false;
          this.graph.pendingListeners.delete(listenerRecord);
        }
      }
      this.immediateListeners.clear();
      this.queuedListeners.clear();
    }
    clearOrphanCheck() {
      if (this.orphanCheckId === null) {
        return;
      }
      clearTimeout(this.orphanCheckId);
      this.orphanCheckId = null;
    }
    refreshOrphanCheck() {
      if (this.disposed || this.owner !== null) {
        this.clearOrphanCheck();
        return;
      }
      if (this.orphanCheckId !== null) {
        return;
      }
      this.orphanCheckId = setTimeout(() => {
        this.orphanCheckId = null;
        if (this.disposed || this.owner !== null) {
          return;
        }
        throw new Error(orphanedStateErrorMessage);
      }, 0);
    }
    setImplicitOwnerCandidate(candidate) {
      if (candidate instanceof _StateClass) {
        return;
      }
      if (this.requiresExplicitOwner) {
        return;
      }
      if (this.owner !== null && !this.isImplicitOwner) {
        return;
      }
      if (this.owner === candidate) {
        return;
      }
      if (this.isImplicitOwner) {
        this.releaseOwner();
        this.releaseOwner = noop;
        this.owner = null;
        this.isImplicitOwner = false;
        this.requiresExplicitOwner = true;
        this.refreshOrphanCheck();
        return;
      }
      this.owner = candidate;
      this.isImplicitOwner = true;
      this.releaseOwner = candidate.onCleanup(() => {
        this.dispose();
      });
      this.clearOrphanCheck();
    }
    ensureActive() {
      if (this.disposed) {
        throw new Error("Disposed states cannot be modified.");
      }
    }
  };
  var State = function State2(ownerOrValue, valueOrOptions, options) {
    if (ownerOrValue instanceof Owner && arguments.length >= 2) {
      return new StateClass(ownerOrValue, valueOrOptions, options ?? {});
    }
    return new StateClass(null, ownerOrValue, (arguments.length >= 2 ? valueOrOptions : void 0) ?? {});
  };
  State.prototype = StateClass.prototype;
  State.extend = function extend() {
    return StateClass;
  };

  // src/component/AriaManipulator.ts
  var generatedAriaReferenceId = 0;
  function isValueSource(value) {
    return typeof value === "object" && value !== null && "value" in value && "subscribe" in value && typeof value.subscribe === "function";
  }
  function isComponentReference(value) {
    return typeof value === "object" && value !== null && "element" in value && value.element instanceof HTMLElement;
  }
  function isReferenceIterable(value) {
    return typeof value === "object" && value !== null && !(value instanceof HTMLElement) && !isComponentReference(value) && typeof value !== "string" && Symbol.iterator in value;
  }
  function ensureReferenceId(element) {
    if (!element.id) {
      generatedAriaReferenceId += 1;
      element.id = `kitsui-aria-ref-${generatedAriaReferenceId}`;
    }
    return element.id;
  }
  function resolveReferenceToken(value) {
    if (!value) {
      return null;
    }
    if (typeof value === "string") {
      return value || null;
    }
    if (value instanceof HTMLElement) {
      return ensureReferenceId(value);
    }
    if (isComponentReference(value)) {
      return ensureReferenceId(value.element);
    }
    throw new TypeError("Unsupported ARIA reference selection.");
  }
  function resolveReferenceSelection(value) {
    if (!value) {
      return null;
    }
    if (typeof value === "string" || value instanceof HTMLElement || isComponentReference(value)) {
      return resolveReferenceToken(value);
    }
    if (!isReferenceIterable(value)) {
      throw new TypeError("Unsupported ARIA reference selection.");
    }
    const references = /* @__PURE__ */ new Set();
    for (const entry of value) {
      const token = resolveReferenceToken(entry);
      if (!token) {
        continue;
      }
      references.add(token);
    }
    if (references.size === 0) {
      return null;
    }
    return [...references].join(" ");
  }
  function toReferenceValueInput(value) {
    if (!isValueSource(value)) {
      return resolveReferenceSelection(value);
    }
    return {
      get value() {
        return resolveReferenceSelection(value.value);
      },
      subscribe(owner, listener) {
        return value.subscribe(owner, (nextValue) => {
          listener(resolveReferenceSelection(nextValue));
        });
      }
    };
  }
  var AriaManipulator = class {
    constructor(owner, attribute) {
      this.owner = owner;
      this.attribute = attribute;
    }
    /**
     * Set the ARIA role.
     * @param value The role value or reactive source.
     */
    role(value) {
      return this.set("role", value);
    }
    /**
     * Set the ARIA label.
     * @param value The label text or reactive source.
     */
    label(value) {
      return this.set("aria-label", value);
    }
    /**
     * Set the ARIA description.
     * @param value The description text or reactive source.
     */
    description(value) {
      return this.set("aria-description", value);
    }
    /**
     * Set the ARIA role description.
     * @param value The role description text or reactive source.
     */
    roleDescription(value) {
      return this.set("aria-roledescription", value);
    }
    /**
     * Set aria-labelledby: elements that label this element.
     * @param value Element reference(s) or reactive source.
     */
    labelledBy(value) {
      return this.set("aria-labelledby", toReferenceValueInput(value));
    }
    /**
     * Set aria-describedby: elements that describe this element.
     * @param value Element reference(s) or reactive source.
     */
    describedBy(value) {
      return this.set("aria-describedby", toReferenceValueInput(value));
    }
    /**
     * Set aria-controls: elements controlled by this element.
     * @param value Element reference(s) or reactive source.
     */
    controls(value) {
      return this.set("aria-controls", toReferenceValueInput(value));
    }
    /**
     * Set aria-details: elements that provide details for this element.
     * @param value Element reference(s) or reactive source.
     */
    details(value) {
      return this.set("aria-details", toReferenceValueInput(value));
    }
    /**
     * Set aria-owns: elements owned by this element.
     * @param value Element reference(s) or reactive source.
     */
    owns(value) {
      return this.set("aria-owns", toReferenceValueInput(value));
    }
    /**
     * Set aria-flowto: elements that follow this element.
     * @param value Element reference(s) or reactive source.
     */
    flowTo(value) {
      return this.set("aria-flowto", toReferenceValueInput(value));
    }
    /**
     * Set aria-hidden: whether this element is hidden from assistive technology.
     * @param value The boolean value or reactive source.
     */
    hidden(value) {
      return this.set("aria-hidden", value);
    }
    /**
     * Set aria-disabled: whether this element is disabled.
     * @param value The boolean value or reactive source.
     */
    disabled(value) {
      return this.set("aria-disabled", value);
    }
    /**
     * Set aria-expanded: whether this element is expanded.
     * @param value The boolean value or reactive source.
     */
    expanded(value) {
      return this.set("aria-expanded", value);
    }
    /**
     * Set aria-busy: whether this element is busy/loading.
     * @param value The boolean value or reactive source.
     */
    busy(value) {
      return this.set("aria-busy", value);
    }
    /**
     * Set aria-selected: whether this element is selected.
     * @param value The boolean value or reactive source.
     */
    selected(value) {
      return this.set("aria-selected", value);
    }
    /**
     * Set aria-checked: whether this element is checked (true, false, or "mixed").
     * @param value The boolean/mixed value or reactive source.
     */
    checked(value) {
      return this.set("aria-checked", value);
    }
    /**
     * Set aria-pressed: whether this element is pressed (true, false, or "mixed").
     * @param value The boolean/mixed value or reactive source.
     */
    pressed(value) {
      return this.set("aria-pressed", value);
    }
    /**
     * Set aria-current: mark this element or one of its descendants as the current page/step/location.
     * @param value The current value (true, false, or a location type) or reactive source.
     */
    current(value) {
      return this.set("aria-current", value);
    }
    /**
     * Set aria-live: announce dynamic content updates (off, polite, or assertive).
     * @param value The politeness level or reactive source.
     */
    live(value) {
      return this.set("aria-live", value);
    }
    set(name, value) {
      this.attribute.set(name, value);
      return this.owner;
    }
  };

  // src/component/AttributeManipulator.ts
  var noop2 = () => {
  };
  function isStateSource(value) {
    return typeof value === "object" && value !== null && "value" in value && "subscribe" in value && typeof value.subscribe === "function";
  }
  function isAttributeEntry(value) {
    return typeof value === "object" && value !== null && "name" in value && "value" in value && !("subscribe" in value);
  }
  function isIterableAttributeNames(value) {
    return value !== null && value !== void 0 && typeof value === "object" && Symbol.iterator in value && typeof value !== "string";
  }
  function resolveAttributeNames(selection) {
    const names = /* @__PURE__ */ new Set();
    if (!selection) {
      return names;
    }
    if (typeof selection === "string") {
      names.add(selection);
      return names;
    }
    if (!isIterableAttributeNames(selection)) {
      throw new TypeError("Unsupported attribute name selection.");
    }
    for (const entry of selection) {
      if (!entry) {
        continue;
      }
      if (typeof entry !== "string") {
        throw new TypeError("Unsupported attribute name selection item.");
      }
      names.add(entry);
    }
    return names;
  }
  function serializeAttributeValue(value) {
    if (value === null || value === void 0) {
      return null;
    }
    return String(value);
  }
  function toAttributeNameSource(value) {
    if (isStateSource(value)) {
      return value;
    }
    return {
      subscribe: () => noop2,
      value
    };
  }
  function toAttributeValueSource(value) {
    if (isStateSource(value)) {
      return value;
    }
    return {
      subscribe: () => noop2,
      value
    };
  }
  var AttributeManipulator = class {
    /**
     * @param owner The component owner managing this manipulator's cleanup.
     * @param element The DOM element whose attributes are managed.
     */
    constructor(owner, element) {
      this.owner = owner;
      this.element = element;
      __publicField(this, "attributeDeterminers", /* @__PURE__ */ new Map());
    }
    /**
     * Adds valueless attributes to the element. Multiple names can be passed as separate arguments or as an iterable.
     * @param attributes Attribute names to add.
     * @returns The owning component for fluent chaining.
     */
    add(...attributes) {
      this.ensureActive();
      for (const attribute of attributes) {
        this.installAttributePresence(attribute, () => "", isStateSource(attribute));
      }
      return this.owner;
    }
    set(...argumentsList) {
      this.ensureActive();
      const entries = this.resolveSetEntries(argumentsList);
      for (const entry of entries) {
        this.installAttributeValue(entry);
      }
      return this.owner;
    }
    /**
     * Removes attributes from the element. Multiple names can be passed as separate arguments or as an iterable.
     * @param attributes Attribute names to remove.
     * @returns The owning component for fluent chaining.
     */
    remove(...attributes) {
      this.ensureActive();
      for (const attribute of attributes) {
        this.installAttributePresence(attribute, () => null, isStateSource(attribute));
      }
      return this.owner;
    }
    bind(state2, ...inputs) {
      this.ensureActive();
      if (inputs.some(isAttributeEntry)) {
        for (const entry of inputs) {
          this.installAttributeValue(entry, {
            getPresence: () => state2.value,
            logDynamicReplacement: true,
            subscribePresenceChanges: (listener) => state2.subscribe(this.owner, () => {
              listener();
            })
          });
        }
        return this.owner;
      }
      for (const attribute of inputs) {
        this.installAttributePresence(attribute, () => state2.value ? "" : null, true, {
          subscribePresenceChanges: (listener) => state2.subscribe(this.owner, () => {
            listener();
          })
        });
      }
      return this.owner;
    }
    ensureActive() {
      if (this.owner.disposed) {
        throw new Error("Disposed components cannot be modified.");
      }
    }
    resolveSetEntries(argumentsList) {
      if (argumentsList.length === 2 && !isAttributeEntry(argumentsList[0])) {
        const pair = argumentsList;
        return [{
          name: pair[0],
          value: pair[1]
        }];
      }
      return argumentsList;
    }
    installAttributePresence(attribute, getValue, logDynamicReplacement, options = {}) {
      const nameSource = toAttributeNameSource(attribute);
      return this.installAttributeSelection(nameSource, getValue, {
        logDynamicReplacement,
        subscribeValueChanges: options.subscribePresenceChanges
      });
    }
    installAttributeValue(entry, options = {}) {
      const nameSource = toAttributeNameSource(entry.name);
      const valueSource = toAttributeValueSource(entry.value);
      const getPresence = options.getPresence ?? (() => true);
      const logDynamicReplacement = options.logDynamicReplacement || isStateSource(entry.name) || isStateSource(entry.value);
      return this.installAttributeSelection(nameSource, () => {
        if (!getPresence()) {
          return null;
        }
        return serializeAttributeValue(valueSource.value);
      }, {
        logDynamicReplacement,
        subscribeValueChanges: (listener) => {
          const cleanups = [
            valueSource.subscribe(this.owner, () => {
              listener();
            }),
            options.subscribePresenceChanges?.(listener) ?? noop2
          ];
          return () => {
            for (const cleanup of cleanups) {
              cleanup();
            }
          };
        }
      });
    }
    installAttributeSelection(nameSource, getValue, options = {}) {
      let active = true;
      let releaseOwner = noop2;
      const entries = /* @__PURE__ */ new Map();
      const removeEntry = (attributeName) => {
        const entry = entries.get(attributeName);
        if (!entry) {
          return;
        }
        entries.delete(attributeName);
        entry.cleanup();
      };
      const syncSelection = (selection) => {
        if (!active) {
          return;
        }
        const nextNames = resolveAttributeNames(selection);
        for (const attributeName of [...entries.keys()]) {
          if (!nextNames.has(attributeName)) {
            removeEntry(attributeName);
          }
        }
        for (const attributeName of nextNames) {
          const existingEntry = entries.get(attributeName);
          if (existingEntry) {
            existingEntry.apply();
            continue;
          }
          const entry = {
            apply: noop2,
            cleanup: noop2
          };
          const determinerCleanup = this.replaceAttributeDeterminer(attributeName, (applyIfCurrent) => {
            entry.apply = () => {
              applyIfCurrent(getValue());
            };
            entry.apply();
            return () => {
              this.element.removeAttribute(attributeName);
            };
          }, {
            logStateReplacement: options.logDynamicReplacement,
            onCleanup: () => {
              entries.delete(attributeName);
            }
          });
          entry.cleanup = () => {
            entries.delete(attributeName);
            determinerCleanup();
          };
          entries.set(attributeName, entry);
        }
      };
      const selectionCleanup = nameSource.subscribe(this.owner, (selection) => {
        syncSelection(selection);
      });
      const valueCleanup = options.subscribeValueChanges?.(() => {
        for (const entry of entries.values()) {
          entry.apply();
        }
      }) ?? noop2;
      syncSelection(nameSource.value);
      releaseOwner = this.owner.onCleanup(() => {
        cleanup();
      });
      const cleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        releaseOwner();
        valueCleanup();
        selectionCleanup();
        for (const entry of [...entries.values()]) {
          entry.cleanup();
        }
      };
      return cleanup;
    }
    replaceAttributeDeterminer(attributeName, install, options = {}) {
      const token = Symbol(attributeName);
      let releaseCurrentDeterminer = noop2;
      const isCurrent = () => this.attributeDeterminers.get(attributeName)?.token === token;
      const applyIfCurrent = (value) => {
        if (!isCurrent()) {
          return;
        }
        if (value === null) {
          this.element.removeAttribute(attributeName);
          return;
        }
        this.element.setAttribute(attributeName, value);
      };
      const cleanup = () => {
        if (!isCurrent()) {
          return;
        }
        this.attributeDeterminers.delete(attributeName);
        releaseCurrentDeterminer();
        options.onCleanup?.();
      };
      const previousDeterminer = this.attributeDeterminers.get(attributeName);
      if (previousDeterminer && options.logStateReplacement) {
        console.error(`State-driven attribute '${attributeName}' replaced an existing attribute determiner.`);
      }
      this.attributeDeterminers.set(attributeName, { cleanup, token });
      previousDeterminer?.cleanup();
      releaseCurrentDeterminer = install(applyIfCurrent);
      return cleanup;
    }
  };

  // src/component/Style.ts
  var styleRegistry = /* @__PURE__ */ new Map();
  var styleOrder = [];
  var importRules = [];
  var resetRules = [];
  var fontFaceRules = [];
  var styleElement = null;
  function toCssPropertyName(propertyName) {
    if (propertyName.startsWith("--")) {
      return propertyName;
    }
    if (propertyName.startsWith("$")) {
      propertyName = `--${propertyName.slice(1)}`;
    }
    return propertyName.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
  }
  function isNestedDefinition(key, value) {
    return typeof value === "object" && value !== null && key.startsWith("{");
  }
  function serializeRules(selector, definition) {
    const rules = [];
    const ownProperties = [];
    for (const [key, value] of Object.entries(definition)) {
      if (value === void 0 || value === null) {
        continue;
      }
      if (isNestedDefinition(key, value)) {
        const parts = key.slice(1, -1).replaceAll("&", selector).split("} {").reverse();
        let innerRules = serializeRules(parts.shift(), value).join("\n");
        for (const part of parts) {
          innerRules = `${part} {
${innerRules}
}`;
        }
        rules.push(innerRules);
        continue;
      }
      ownProperties.push([key, value]);
    }
    if (ownProperties.length > 0) {
      const body = ownProperties.sort(([left], [right]) => left.localeCompare(right)).map(([propertyName, value]) => `${toCssPropertyName(propertyName)}: ${String(expandVariableAccessShorthand(value))}`).join("; ");
      rules.unshift(`${selector} { ${body} }`);
    }
    return rules;
  }
  function serializeDefinition(className, definition) {
    return serializeRules(`.${className}`, definition).join("\n");
  }
  function isWordCharacter(character) {
    const charCode = character.charCodeAt(0);
    return charCode >= 48 && charCode <= 57 || charCode >= 65 && charCode <= 90 || charCode >= 97 && charCode <= 122 || charCode === 45 || charCode === 95;
  }
  function isWhitespaceCharacter(character) {
    const charCode = character.charCodeAt(0);
    return charCode === 32 || charCode === 9 || charCode === 10 || charCode === 13;
  }
  function expandVariableAccessShorthand(styleValue) {
    if (typeof styleValue === "number") {
      return String(styleValue);
    }
    const src = styleValue;
    let i = 0;
    function consumeChar(expected) {
      if (src[i] === expected) {
        i++;
        return true;
      }
      return false;
    }
    function consumeWord() {
      let j = i;
      for (; i < src.length; i++) {
        const character = src[i];
        if (!isWordCharacter(character)) {
          break;
        }
      }
      return src.slice(j, i);
    }
    function consumeWhitespace() {
      let result = "";
      while (i < src.length && isWhitespaceCharacter(src[i])) {
        result += src[i++];
      }
      return result;
    }
    let awaitingClosingBrace = 0;
    function consumeVariableAccess() {
      const restorePoint = i;
      if (!consumeChar("$")) {
        return void 0;
      }
      if (!consumeChar("{")) {
        const variableName2 = consumeWord();
        if (!variableName2) {
          i = restorePoint;
          return void 0;
        }
        return `var(${toCssPropertyName(`$${variableName2}`)})`;
      }
      consumeWhitespace();
      const variableName = consumeWord();
      if (!variableName) {
        i = restorePoint;
        return void 0;
      }
      consumeWhitespace();
      if (!consumeChar(":")) {
        i = restorePoint;
        return void 0;
      }
      consumeWhitespace();
      awaitingClosingBrace++;
      const fallbackValue = consumeStyleValue();
      consumeWhitespace();
      if (!consumeChar("}")) {
        i = restorePoint;
        return void 0;
      }
      return `var(${toCssPropertyName(`$${variableName}`)}, ${fallbackValue})`;
    }
    function consumeStyleValue() {
      let result = "";
      do {
        if (awaitingClosingBrace && src[i] === "}") {
          awaitingClosingBrace--;
          return result;
        }
        result += consumeWhitespace() || consumeVariableAccess() || src[i++];
      } while (i < src.length);
      return result;
    }
    return consumeStyleValue();
  }
  function getStyleElement() {
    if (typeof document === "undefined") {
      return null;
    }
    if (styleElement?.isConnected) {
      return styleElement;
    }
    styleElement = null;
    styleElement = document.querySelector("style[data-kitsui-styles='true']");
    if (styleElement instanceof HTMLStyleElement) {
      return styleElement;
    }
    styleElement = document.createElement("style");
    styleElement.setAttribute("data-kitsui-styles", "true");
    (document.head ?? document.documentElement).append(styleElement);
    return styleElement;
  }
  var StyleClass = class {
    constructor(className, definition, cssText, afterClassNames) {
      __publicField(this, "className");
      __publicField(this, "afterClassNames");
      __publicField(this, "definition");
      __publicField(this, "cssText");
      this.afterClassNames = [...afterClassNames];
      this.className = className;
      this.definition = Object.freeze({ ...definition });
      this.cssText = cssText;
    }
    toString() {
      return this.className;
    }
  };
  function renderStyleSheet() {
    const styleElement2 = getStyleElement();
    if (!styleElement2) {
      return;
    }
    const parts = [];
    if (importRules.length > 0) {
      parts.push(importRules.join("\n"));
    }
    if (resetRules.length > 0) {
      parts.push(resetRules.join("\n"));
    }
    if (fontFaceRules.length > 0) {
      parts.push(fontFaceRules.join("\n"));
    }
    for (const style of styleOrder) {
      parts.push(style.cssText);
    }
    styleElement2.textContent = parts.join("\n");
    if (parts.length > 0) {
      styleElement2.append(document.createTextNode("\n"));
    }
  }
  function insertStyleInOrder(style) {
    if (style.afterClassNames.length === 0) {
      styleOrder.push(style);
      return;
    }
    let insertionIndex = -1;
    for (const afterClassName of style.afterClassNames) {
      const styleIndex = styleOrder.findIndex((entry) => entry.className === afterClassName);
      if (styleIndex === -1) {
        throw new Error(`Style '${style.className}' cannot be ordered after unknown style '${afterClassName}'.`);
      }
      insertionIndex = Math.max(insertionIndex, styleIndex);
    }
    styleOrder.splice(insertionIndex + 1, 0, style);
  }
  function createStyle(className, definition, afterStyles = []) {
    const cssText = serializeDefinition(className, definition);
    const afterClassNames = afterStyles.map((style2) => style2.className);
    const existingStyle = styleRegistry.get(className);
    if (existingStyle) {
      const sameAfterStyles = existingStyle.afterClassNames.length === afterClassNames.length && existingStyle.afterClassNames.every((value, index) => value === afterClassNames[index]);
      if (existingStyle.cssText !== cssText || !sameAfterStyles) {
        throw new Error(`Style '${className}' is already registered with different rules.`);
      }
      return existingStyle;
    }
    const style = new StyleClass(className, definition, cssText, afterClassNames);
    styleRegistry.set(className, style);
    insertStyleInOrder(style);
    renderStyleSheet();
    return style;
  }
  function Style(definition) {
    return definition;
  }
  ((Style2) => {
    Style2.Class = Object.assign(
      function Class2(className, definition) {
        return createStyle(className, definition);
      },
      { prototype: StyleClass.prototype }
    );
    function after(...classes) {
      return {
        Class(className, definition) {
          return createStyle(className, definition, classes);
        }
      };
    }
    Style2.after = after;
  })(Style || (Style = {}));
  function StyleReset(definition) {
    const rules = serializeRules("*", definition);
    const component = Component("template");
    component.event.owned.on.Mount(() => {
      resetRules.push(...rules);
      renderStyleSheet();
    });
    component.event.owned.on.Dispose(() => {
      for (const rule of rules) {
        const index = resetRules.indexOf(rule);
        if (index !== -1) resetRules.splice(index, 1);
      }
      renderStyleSheet();
    });
    return component;
  }
  function StyleImport(url) {
    const rule = `@import url("${url}");`;
    const component = Component("template");
    component.event.owned.on.Mount(() => {
      importRules.push(rule);
      renderStyleSheet();
    });
    component.event.owned.on.Dispose(() => {
      const index = importRules.indexOf(rule);
      if (index !== -1) importRules.splice(index, 1);
      renderStyleSheet();
    });
    return component;
  }
  function StyleFontFace(definition) {
    const properties = Object.entries(definition).filter((entry) => entry[1] !== void 0 && entry[1] !== null).sort(([left], [right]) => left.localeCompare(right)).map(([propertyName, value]) => `${toCssPropertyName(propertyName)}: ${String(expandVariableAccessShorthand(value))}`).join("; ");
    const rule = `@font-face { ${properties} }`;
    const component = Component("template");
    component.event.owned.on.Mount(() => {
      fontFaceRules.push(rule);
      renderStyleSheet();
    });
    component.event.owned.on.Dispose(() => {
      const index = fontFaceRules.indexOf(rule);
      if (index !== -1) fontFaceRules.splice(index, 1);
      renderStyleSheet();
    });
    return component;
  }
  function spreadableSelector(selector, definition) {
    selector = selector.includes("&") ? selector : `&${selector}`;
    return { [`{${selector}}`]: definition };
  }
  function spreadableQuery(query2, selectorOrDefinition, definition) {
    definition = typeof selectorOrDefinition === "string" ? definition : selectorOrDefinition;
    const selector = typeof selectorOrDefinition === "string" ? selectorOrDefinition : "&";
    query2 = query2.startsWith("@") ? query2.slice(1) : query2;
    return { [`{@${query2}} {${selector}}`]: definition };
  }
  function elements(tagName, definition) {
    return spreadableSelector(`& ${tagName}`, definition);
  }
  function state(selector) {
    selector = selector.startsWith(":") ? selector : `:${selector}`;
    return function(definition) {
      return spreadableSelector(selector, definition);
    };
  }
  var whenFirst = state("first-child");
  var whenNotFirst = state("not(:first-child)");
  var whenLast = state("last-child");
  var whenNotLast = state("not(:last-child)");
  var whenMiddle = state("not(:first-child, :last-child)");
  var whenEmpty = state("empty");
  var whenFull = state("not(:empty)");
  var whenOdd = state("nth-child(odd)");
  var whenEven = state("nth-child(even)");
  var whenHover = state("hover");
  var whenHoverSelf = state("hover:not(:has(:hover))");
  var whenActive = state("active");
  var whenActiveSelf = state("active:not(:has(:active))");
  var whenFocus = state("has(:focus-visible)");
  var whenFocusSelf = state("focus-visible:not(:has(:focus-visible))");
  var whenFocusAny = state("has(:focus)");
  var whenFocusAnySelf = state("focus:not(:has(:focus))");
  function pseudo(name) {
    const selector = name.startsWith("::") ? name : `::${name}`;
    return function(definition) {
      return spreadableSelector(selector, definition);
    };
  }
  var pseudoBefore = pseudo("before");
  var pseudoAfter = pseudo("after");
  function lightScheme(definition) {
    return spreadableQuery(`@media (prefers-color-scheme: light)`, definition);
  }
  function darkScheme(definition) {
    return spreadableQuery(`@media (prefers-color-scheme: dark)`, definition);
  }
  function whenStuck(container, definition) {
    if (!container.definition.containerName) {
      throw new Error(`Class '${container.className}' cannot be used in whenStuck because it does not have a container name defined.`);
    }
    return spreadableQuery(`@container ${container.definition.containerName} scroll-state((stuck: left) or (stuck: right) or (stuck: top) or (stuck: bottom))`, definition);
  }
  function whenOpen(definition) {
    return spreadableSelector(":open", definition);
  }
  function whenClosed(definition) {
    return spreadableSelector(":not(:open)", definition);
  }

  // src/component/ClassManipulator.ts
  var noop3 = () => {
  };
  function isStyleInputState(value) {
    return value instanceof State;
  }
  function isIterableStyleSelection(value) {
    return value !== null && value !== void 0 && typeof value === "object" && Symbol.iterator in value && !(value instanceof Style.Class);
  }
  function resolveStyleSelection(selection) {
    const styles = /* @__PURE__ */ new Map();
    if (!selection) {
      return styles;
    }
    if (selection instanceof Style.Class) {
      styles.set(selection.className, selection);
      return styles;
    }
    if (!isIterableStyleSelection(selection)) {
      throw new TypeError("Unsupported style selection.");
    }
    for (const item of selection) {
      if (!item) {
        continue;
      }
      if (!(item instanceof Style.Class)) {
        throw new TypeError("Unsupported style selection item.");
      }
      styles.set(item.className, item);
    }
    return styles;
  }
  var ClassManipulator = class {
    /**
     * @param owner The owner managing this manipulator's lifecycle.
     * @param element The HTML element to manipulate.
     */
    constructor(owner, element) {
      this.owner = owner;
      this.element = element;
      __publicField(this, "styleDeterminers", /* @__PURE__ */ new Map());
    }
    /**
     * Adds one or more styles to the element. Each style replaces any prior determiner
     * for that class. Falsy values and values in iterables are ignored.
     *
     * @param classes Static or reactive styles to add. Accepts individual styles,
     * falsy values for conditional logic, or reactive style sources (States).
     * @returns The owning component for fluent chaining.
     * @throws If the owner is disposed.
     *
     * @example
     * // Static
     * component.class.add(primaryStyle);
     *
     * // Conditional
     * component.class.add(isPrimary ? primaryStyle : null);
     *
     * // Reactive
     * const selection = State(component, null);
     * component.class.add(selection);
     */
    add(...classes) {
      this.ensureActive();
      for (const style of classes) {
        this.installAddInput(style);
      }
      return this.owner;
    }
    /**
     * Removes one or more styles from the element. Each style replaces any prior determiner
     * for that class. Falsy values and values in iterables are ignored.
     *
     * @param classes Static or reactive styles to remove. Accepts individual styles,
     * falsy values for conditional logic, or reactive style sources (States).
     * @returns The owning component for fluent chaining.
     * @throws If the owner is disposed.
     */
    remove(...classes) {
      this.ensureActive();
      for (const style of classes) {
        this.installRemoveInput(style);
      }
      return this.owner;
    }
    /**
     * Binds one or more styles to a boolean State. The classes are added when the
     * state value is true, and removed when false. Each style replaces any prior
     * determiner for that class. Falsy values are ignored.
     *
     * @param state A boolean State controlling the visibility of the classes.
     * @param classes Styles to bind to the state. Accepts individual styles, falsy
     * values, or reactive style sources.
     * @returns The owning component for fluent chaining.
     * @throws If the owner is disposed.
     *
     * @example
     * const isActive = State(component, false);
     * component.class.bind(isActive, activeStyle);
     * // activeStyle is present iff isActive.value is true
     */
    bind(state2, ...classes) {
      this.ensureActive();
      for (const style of classes.filter((value) => Boolean(value))) {
        if (isStyleInputState(style)) {
          this.installStateDrivenStyles(style, () => state2.value, {
            logStateReplacement: true,
            subscribePresenceChanges: (listener) => state2.subscribe(this.owner, () => {
              listener();
            })
          });
          continue;
        }
        this.replaceDeterminer(style, (applyIfCurrent) => {
          applyIfCurrent(state2.value);
          const cleanup = state2.subscribe(this.owner, (value) => {
            applyIfCurrent(value);
          });
          return () => {
            cleanup();
            this.element.classList.remove(style.className);
          };
        });
      }
      return this.owner;
    }
    /**
     * Adds one or more styles under the ownership of another Owner. The styles are
     * automatically removed when that owner is cleaned up. Falsy values and values
     * in iterables are ignored.
     *
     * @param owner The external owner managing the lifetime of these class additions.
     * @param classes Static or reactive styles to add.
     * @returns The owning component for fluent chaining.
     * @throws If this manipulator's owner is disposed.
     *
     * @example
     * const externalOwner = ComponentOwner(); // some lifecycle manager
     * component.class.addFrom(externalOwner, externalStyle);
     * // externalStyle is removed when externalOwner is cleaned up
     */
    addFrom(owner, ...classes) {
      this.ensureActive();
      for (const style of classes.filter((value) => Boolean(value))) {
        if (isStyleInputState(style)) {
          const cleanup = this.installStateDrivenStyles(style, () => true, {
            logStateReplacement: true
          });
          owner.onCleanup(cleanup);
          continue;
        }
        this.replaceDeterminer(style, (applyIfCurrent) => {
          applyIfCurrent(true);
          const releaseOwner = owner.onCleanup(() => {
            applyIfCurrent(false);
          });
          return () => {
            releaseOwner();
            this.element.classList.remove(style.className);
          };
        });
      }
      return this.owner;
    }
    ensureActive() {
      if (this.owner.disposed) {
        throw new Error("Disposed components cannot be modified.");
      }
    }
    installAddInput(style) {
      if (!style) {
        return;
      }
      if (isStyleInputState(style)) {
        this.installStateDrivenStyles(style, () => true, {
          logStateReplacement: true
        });
        return;
      }
      this.replaceDeterminer(style, () => {
        this.element.classList.add(style.className);
        return noop3;
      });
    }
    installRemoveInput(style) {
      if (!style) {
        return;
      }
      if (isStyleInputState(style)) {
        this.installStateDrivenStyles(style, () => false, {
          logStateReplacement: true
        });
        return;
      }
      this.replaceDeterminer(style, () => {
        this.element.classList.remove(style.className);
        return noop3;
      });
    }
    installStateDrivenStyles(selectionState, getPresent, options = {}) {
      let active = true;
      const entries = /* @__PURE__ */ new Map();
      const removeEntry = (className) => {
        const entry = entries.get(className);
        if (!entry) {
          return;
        }
        entries.delete(className);
        entry.cleanup();
      };
      const syncSelection = (selection) => {
        if (!active) {
          return;
        }
        const nextStyles = resolveStyleSelection(selection);
        for (const className of [...entries.keys()]) {
          if (!nextStyles.has(className)) {
            removeEntry(className);
          }
        }
        for (const [className, style] of nextStyles) {
          const existingEntry = entries.get(className);
          if (existingEntry) {
            existingEntry.apply();
            continue;
          }
          const entry = {
            apply: noop3,
            cleanup: noop3
          };
          const determinerCleanup = this.replaceDeterminer(style, (applyIfCurrent) => {
            entry.apply = () => {
              applyIfCurrent(getPresent());
            };
            entry.apply();
            return () => {
              this.element.classList.remove(style.className);
            };
          }, {
            logStateReplacement: options.logStateReplacement,
            onCleanup: () => {
              entries.delete(className);
            }
          });
          entry.cleanup = () => {
            entries.delete(className);
            determinerCleanup();
          };
          entries.set(className, entry);
        }
      };
      const selectionCleanup = selectionState.subscribe(this.owner, (selection) => {
        syncSelection(selection);
      });
      const presenceCleanup = options.subscribePresenceChanges?.(() => {
        for (const entry of entries.values()) {
          entry.apply();
        }
      }) ?? noop3;
      syncSelection(selectionState.value);
      return () => {
        if (!active) {
          return;
        }
        active = false;
        presenceCleanup();
        selectionCleanup();
        for (const entry of [...entries.values()]) {
          entry.cleanup();
        }
      };
    }
    replaceDeterminer(style, install, options = {}) {
      const token = Symbol(style.className);
      let releaseCurrentDeterminer = () => {
      };
      const isCurrent = () => this.styleDeterminers.get(style.className)?.token === token;
      const applyIfCurrent = (present) => {
        if (!isCurrent()) {
          return;
        }
        this.element.classList.toggle(style.className, present);
      };
      const cleanup = () => {
        if (!isCurrent()) {
          return;
        }
        this.styleDeterminers.delete(style.className);
        releaseCurrentDeterminer();
        options.onCleanup?.();
      };
      const previousDeterminer = this.styleDeterminers.get(style.className);
      if (previousDeterminer && options.logStateReplacement) {
        console.error(`State-driven style '${style.className}' replaced an existing style determiner.`);
      }
      this.styleDeterminers.set(style.className, { cleanup, token });
      previousDeterminer?.cleanup();
      releaseCurrentDeterminer = install(applyIfCurrent);
      return cleanup;
    }
  };

  // src/component/EventManipulator.ts
  var noop4 = () => {
  };
  function isListenerSource(value) {
    return typeof value === "object" && value !== null && "value" in value && "subscribe" in value && typeof value.subscribe === "function";
  }
  function isListenerKey(value) {
    return typeof value === "function" || isListenerSource(value);
  }
  function defineComponentEvent(event, component) {
    Object.defineProperty(event, "component", {
      configurable: true,
      enumerable: false,
      value: component,
      writable: false
    });
    return event;
  }
  var EventManipulator = class {
    constructor(owner, element) {
      this.owner = owner;
      this.element = element;
      __publicField(this, "on");
      __publicField(this, "off");
      __publicField(this, "owned");
      __publicField(this, "listenerRecords", /* @__PURE__ */ new Map());
      this.on = this.createOnProxy(false);
      this.off = this.createOffProxy();
      this.owned = {
        off: this.off,
        on: this.createOwnedOnProxy()
      };
      this.owner.onCleanup(() => {
        this.releaseAllListeners();
      });
    }
    releaseAllListeners() {
      const cleanups = [];
      for (const eventRecords of this.listenerRecords.values()) {
        for (const record of eventRecords.values()) {
          cleanups.push(record.cleanup);
        }
      }
      for (const cleanup of cleanups) {
        cleanup();
      }
    }
    createOnProxy(useOwnedOwner) {
      return new Proxy({}, {
        get: (_, eventName) => {
          if (typeof eventName !== "string") {
            return void 0;
          }
          return (ownerOrListener, maybeListener) => {
            const resolvedOwner = useOwnedOwner ? this.owner : ownerOrListener;
            const listener = useOwnedOwner ? ownerOrListener : maybeListener;
            this.installListener(eventName, resolvedOwner, listener);
            return this.owner;
          };
        }
      });
    }
    createOwnedOnProxy() {
      return new Proxy({}, {
        get: (_, eventName) => {
          if (typeof eventName !== "string") {
            return void 0;
          }
          return (listener) => {
            this.installListener(eventName, this.owner, listener);
            return this.owner;
          };
        }
      });
    }
    createOffProxy() {
      return new Proxy({}, {
        get: (_, eventName) => {
          if (typeof eventName !== "string") {
            return void 0;
          }
          return (listener) => {
            this.removeListener(eventName, listener);
            return this.owner;
          };
        }
      });
    }
    installListener(eventName, owner, listener) {
      this.ensureActive();
      if (!isListenerKey(listener)) {
        return;
      }
      const key = listener;
      this.replaceListener(eventName, key, owner, listener);
    }
    replaceListener(eventName, key, owner, listener) {
      const eventRecords = this.listenerRecords.get(eventName) ?? /* @__PURE__ */ new Map();
      this.listenerRecords.set(eventName, eventRecords);
      eventRecords.get(key)?.cleanup();
      let cleanup = noop4;
      let active = true;
      let releaseDom = noop4;
      let releaseOwner = noop4;
      let releaseSource = noop4;
      const trackedCleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        releaseSource();
        releaseOwner();
        releaseDom();
        eventRecords.delete(key);
        if (eventRecords.size === 0) {
          this.listenerRecords.delete(eventName);
        }
        cleanup();
      };
      const applyResolvedListener = (nextListener) => {
        releaseOwner();
        releaseDom();
        if (!nextListener) {
          releaseOwner = noop4;
          releaseDom = noop4;
          return;
        }
        const handleEvent = (event) => {
          nextListener(defineComponentEvent(event, this.owner));
        };
        this.element.addEventListener(eventName, handleEvent);
        releaseDom = () => {
          this.element.removeEventListener(eventName, handleEvent);
        };
        releaseOwner = owner.onCleanup(trackedCleanup);
      };
      eventRecords.set(key, { cleanup: trackedCleanup });
      if (isListenerSource(listener)) {
        releaseSource = listener.subscribe(owner, applyResolvedListener);
        applyResolvedListener(listener.value);
        return;
      }
      applyResolvedListener(listener);
    }
    removeListener(eventName, listener) {
      if (!isListenerKey(listener)) {
        return;
      }
      this.listenerRecords.get(eventName)?.get(listener)?.cleanup();
    }
    ensureActive() {
      if (this.owner.disposed) {
        throw new Error("Disposed components cannot be modified.");
      }
    }
  };

  // src/component/TextManipulator.ts
  var noop5 = () => {
  };
  function isTextSource(value) {
    return typeof value === "object" && value !== null && "value" in value && "subscribe" in value && typeof value.subscribe === "function";
  }
  function toTextSource(value) {
    if (isTextSource(value)) {
      return value;
    }
    return {
      subscribe: () => noop5,
      value
    };
  }
  function serializeTextSelection(value) {
    if (value === null || value === void 0) {
      return "";
    }
    return String(value);
  }
  var TextManipulator = class {
    constructor(owner, writeText) {
      this.owner = owner;
      this.writeText = writeText;
      __publicField(this, "determiner", null);
    }
    /**
     * Sets the element's text content from a direct value or subscribable source.
     * Nullish values clear the text content.
     * @param value Direct or reactive text input.
     * @returns The owning component for fluent chaining.
     */
    set(value) {
      this.ensureActive();
      const textSource = toTextSource(value);
      this.replaceDeterminer((applyIfCurrent) => {
        applyIfCurrent(textSource.value);
        return textSource.subscribe(this.owner, (nextValue) => {
          applyIfCurrent(nextValue);
        });
      });
      return this.owner;
    }
    /**
     * Shows or clears text content based on a boolean source.
     * When visible, the latest text value is applied; when hidden, the text content is cleared.
     * @param visible Boolean source controlling whether text is shown.
     * @param value Direct or reactive text input.
     * @returns The owning component for fluent chaining.
     */
    bind(visible, value) {
      this.ensureActive();
      const textSource = toTextSource(value);
      this.replaceDeterminer((applyIfCurrent) => {
        const sync = () => {
          applyIfCurrent(visible.value ? textSource.value : null);
        };
        const releaseVisibility = visible.subscribe(this.owner, sync);
        const releaseText = textSource.subscribe(this.owner, sync);
        sync();
        return () => {
          releaseVisibility();
          releaseText();
        };
      });
      return this.owner;
    }
    replaceDeterminer(createCleanup) {
      this.determiner?.cleanup();
      const token = /* @__PURE__ */ Symbol("text");
      let active = true;
      let cleanup = noop5;
      const applyIfCurrent = (value) => {
        if (this.determiner?.token !== token) {
          return;
        }
        this.writeText(serializeTextSelection(value));
      };
      const trackedCleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        if (this.determiner?.token === token) {
          this.determiner = null;
          this.writeText("");
        }
        cleanup();
      };
      this.determiner = { cleanup: trackedCleanup, token };
      cleanup = createCleanup(applyIfCurrent);
      return trackedCleanup;
    }
    ensureActive() {
      if (this.owner.disposed) {
        throw new Error("Disposed components cannot be modified.");
      }
    }
  };

  // src/component/Component.ts
  var noop6 = () => {
  };
  var orphanedComponentErrorMessage = "Components must be connected to the document or have a managed owner before the next tick.";
  var elementComponents = /* @__PURE__ */ new WeakMap();
  var componentOwnerResolvers = /* @__PURE__ */ new Set();
  var componentAccessorInstalled = false;
  function isMoveParent(value) {
    return value !== null && typeof value.insertBefore === "function";
  }
  function moveNode(parent, node, beforeNode) {
    if (typeof parent.moveBefore === "function" && parent.isConnected && node.isConnected) {
      parent.moveBefore(node, beforeNode);
      return;
    }
    parent.insertBefore(node, beforeNode);
  }
  function createStorageElement(documentRef) {
    return documentRef.createElement("kitsui-storage");
  }
  function getLiveComponent(element) {
    const component = elementComponents.get(element)?.deref();
    if (!component) {
      elementComponents.delete(element);
      return void 0;
    }
    return component;
  }
  function installNodeComponentAccessor() {
    if (componentAccessorInstalled) {
      return;
    }
    componentAccessorInstalled = true;
    Object.defineProperty(Node.prototype, "component", {
      configurable: true,
      enumerable: false,
      get() {
        if (!(this instanceof HTMLElement)) {
          return void 0;
        }
        return getLiveComponent(this);
      }
    });
  }
  function isComponentSelectionState(value) {
    return value instanceof State;
  }
  function isChildIterable(value) {
    return typeof value === "object" && value !== null && !(value instanceof Node) && !(value instanceof ComponentClass) && !(value instanceof State) && Symbol.iterator in value;
  }
  function registerComponentOwnerResolver(resolver) {
    componentOwnerResolvers.add(resolver);
    return () => {
      componentOwnerResolvers.delete(resolver);
    };
  }
  function disposeManagedNode(node) {
    if (node instanceof HTMLElement) {
      const component = getLiveComponent(node);
      if (component && !component.disposed) {
        component.remove();
        return;
      }
    }
    for (const childNode of Array.from(node.childNodes)) {
      disposeManagedNode(childNode);
    }
  }
  var ComponentClass = class _ComponentClass extends Owner {
    constructor(tagNameOrElement) {
      super();
      /**
       * The underlying DOM element managed by this component.
       */
      __publicField(this, "element");
      __publicField(this, "explicitOwner", null);
      __publicField(this, "releaseExplicitOwner", noop6);
      __publicField(this, "structuralCleanups", /* @__PURE__ */ new Set());
      __publicField(this, "mounted", false);
      __publicField(this, "onBeforeMove", null);
      __publicField(this, "orphanCheckId", null);
      installNodeComponentAccessor();
      this.element = typeof tagNameOrElement === "string" ? document.createElement(tagNameOrElement) : tagNameOrElement;
      if (getLiveComponent(this.element)) {
        throw new Error("This node already has a component. Use node.component to retrieve it.");
      }
      elementComponents.set(this.element, new WeakRef(this));
      this.refreshOrphanCheck();
    }
    /**
     * Lazily creates and memoizes a ClassManipulator for adding/removing CSS classes.
     */
    get class() {
      this.ensureActive();
      const manipulator = new ClassManipulator(this, this.element);
      Object.defineProperty(this, "class", {
        configurable: true,
        enumerable: true,
        value: manipulator,
        writable: false
      });
      return manipulator;
    }
    /**
     * Lazily creates and memoizes an AttributeManipulator for managing element attributes.
     */
    get attribute() {
      this.ensureActive();
      const manipulator = new AttributeManipulator(this, this.element);
      Object.defineProperty(this, "attribute", {
        configurable: true,
        enumerable: true,
        value: manipulator,
        writable: false
      });
      return manipulator;
    }
    /**
     * Lazily creates and memoizes an AriaManipulator for managing ARIA attributes.
     */
    get aria() {
      this.ensureActive();
      const manipulator = new AriaManipulator(this, this.attribute);
      Object.defineProperty(this, "aria", {
        configurable: true,
        enumerable: true,
        value: manipulator,
        writable: false
      });
      return manipulator;
    }
    /**
     * Lazily creates and memoizes a TextManipulator for managing text content.
     */
    get text() {
      this.ensureActive();
      const manipulator = new TextManipulator(this, (value) => {
        this.releaseStructuralCleanups();
        for (const childNode of Array.from(this.element.childNodes)) {
          disposeManagedNode(childNode);
        }
        this.element.textContent = value;
      });
      Object.defineProperty(this, "text", {
        configurable: true,
        enumerable: true,
        value: manipulator,
        writable: false
      });
      return manipulator;
    }
    /**
     * Lazily creates and memoizes an EventManipulator for managing host event listeners.
     */
    get event() {
      this.ensureActive();
      const manipulator = new EventManipulator(this, this.element);
      Object.defineProperty(this, "event", {
        configurable: true,
        enumerable: true,
        value: manipulator,
        writable: false
      });
      return manipulator;
    }
    /**
     * Appends children to this component's element.
     * Strings are converted to text nodes. Falsy values are ignored.
     * Components are owned by this component and removed when this component is removed.
     * @param children - Nodes, components, strings, iterables, or ComponentSelectionState.
     * @returns This component for chaining.
     */
    append(...children) {
      this.ensureActive();
      for (const child of this.expandChildren(children)) {
        if (isComponentSelectionState(child)) {
          this.attachStatefulChildren(child, {
            getContainer: () => this.element,
            getReferenceNode: () => null
          });
          continue;
        }
        this.element.append(this.resolveNode(child));
        if (child instanceof _ComponentClass) {
          child.refreshOrphanCheck();
          child.dispatchMount();
        }
      }
      return this;
    }
    /**
     * Prepends children to this component's element, before existing content.
     * Strings are converted to text nodes. Falsy values are ignored.
     * Components are owned by this component and removed when this component is removed.
     * @param children - Nodes, components, strings, iterables, or ComponentSelectionState.
     * @returns This component for chaining.
     */
    prepend(...children) {
      this.ensureActive();
      const referenceNode = this.element.firstChild;
      for (const child of this.expandChildren(children)) {
        if (isComponentSelectionState(child)) {
          this.attachStatefulChildren(child, {
            getContainer: () => this.element,
            getReferenceNode: () => referenceNode
          });
          continue;
        }
        this.element.insertBefore(this.resolveNode(child), referenceNode);
        if (child instanceof _ComponentClass) {
          child.refreshOrphanCheck();
          child.dispatchMount();
        }
      }
      return this;
    }
    /**
     * Inserts children before or after this component (relative to its parent).
     * Strings are converted to text nodes. Falsy values are filtered out. Useful for inserting siblings.
     * @param where - "before" to insert before this component, or "after" to insert after.
     * @param nodes - One or more nodes, strings, iterables, or ComponentSelectionState to insert.
     * @returns This component for chaining.
     * @throws If this component has no parent node.
     */
    insert(where, ...nodes) {
      this.ensureActive();
      const insertables = this.expandChildren(nodes);
      if (insertables.length === 0) {
        return this;
      }
      const parentNode = this.element.parentNode;
      if (!isMoveParent(parentNode)) {
        throw new Error("Insert target was not found.");
      }
      const orderedInsertables = where === "before" ? insertables : [...insertables].reverse();
      for (const node of orderedInsertables) {
        if (isComponentSelectionState(node)) {
          this.attachStatefulChildren(node, {
            getContainer: () => this.element.parentNode,
            getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling
          });
          continue;
        }
        moveNode(parentNode, this.resolveNode(node), where === "before" ? this.element : this.element.nextSibling);
        if (node instanceof _ComponentClass) {
          node.refreshOrphanCheck();
          node.dispatchMount();
        }
      }
      return this;
    }
    /**
     * Appends a child conditionally based on state.
     * When the state becomes true, the child is inserted. When false, it's stored but stays in the DOM as a placeholder.
     * @param state - A State<boolean> that controls visibility.
     * @param child - The child to append conditionally.
     * @returns A cleanup function that removes the conditional binding and the child.
     */
    appendWhen(state2, child) {
      this.ensureActive();
      return this.attachConditionalNode(state2, child, {
        getContainer: () => this.element,
        getReferenceNode: () => null
      });
    }
    /**
     * Prepends a child conditionally based on state.
     * When the state becomes true, the child is inserted before existing content.
     * @param state - A State<boolean> that controls visibility.
     * @param child - The child to prepend conditionally.
     * @returns A cleanup function that removes the conditional binding and the child.
     */
    prependWhen(state2, child) {
      this.ensureActive();
      return this.attachConditionalNode(state2, child, {
        getContainer: () => this.element,
        getReferenceNode: () => this.element.firstChild
      });
    }
    /**
     * Inserts children conditionally before or after this component, based on state.
     * When the state becomes true, children are inserted. When false, they're stored but stay in the DOM as a placeholder.
     * @param state - A State<boolean> that controls visibility.
     * @param where - "before" to insert before this component, or "after" to insert after.
     * @param nodes - Nodes or iterables of nodes to insert conditionally.
     * @returns A cleanup function that removes all conditional bindings and children.
     */
    insertWhen(state2, where, ...nodes) {
      this.ensureActive();
      const insertables = this.expandChildren(nodes);
      const orderedInsertables = where === "before" ? insertables : [...insertables].reverse();
      const cleanups = orderedInsertables.map((node) => {
        if (isComponentSelectionState(node)) {
          return noop6;
        }
        return this.attachConditionalNode(state2, node, {
          getContainer: () => this.element.parentNode,
          getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling
        });
      });
      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    }
    clear() {
      this.ensureActive();
      this.releaseStructuralCleanups();
      for (const childNode of Array.from(this.element.childNodes)) {
        disposeManagedNode(childNode);
      }
      this.element.replaceChildren();
      return this;
    }
    /**
     * Sets a single attribute on the element.
     * @param name - The attribute name.
     * @param value - The attribute value.
     * @returns This component for chaining.
     */
    setAttribute(name, value) {
      this.ensureActive();
      this.element.setAttribute(name, value);
      return this;
    }
    use(setupOrState, render) {
      this.ensureActive();
      if (typeof setupOrState === "function") {
        setupOrState(this);
        return this;
      }
      if (!render) {
        throw new Error("Component.use requires a render function when passed a state.");
      }
      render(setupOrState.value, this);
      setupOrState.subscribe(this, (value) => {
        render(value, this);
      });
      return this;
    }
    /**
     * Removes this component from the DOM and disposes its resources.
     * Owned child components are also removed.
     * The component cannot be modified after removal.
     */
    remove() {
      super.dispose();
    }
    /** @internal Dispatches the Mount event if this component has never been mounted. */
    dispatchMount() {
      if (this.mounted) {
        return;
      }
      this.mounted = true;
      this.element.dispatchEvent(new CustomEvent("Mount"));
    }
    /**
     * Sets or clears the explicit owner of this component.
     * When a component has an explicit owner, it is removed when the owner is disposed.
     * This is independent of implicit ownership through DOM ancestry.
     * @param owner - The owner component or state, or null to remove explicit ownership.
     * @returns This component for chaining.
     */
    setOwner(owner) {
      this.ensureActive();
      if (this.explicitOwner === owner) {
        return this;
      }
      this.releaseExplicitOwner();
      this.releaseExplicitOwner = noop6;
      this.explicitOwner = owner;
      if (owner) {
        this.releaseExplicitOwner = owner.onCleanup(() => {
          this.remove();
        });
      }
      this.refreshOrphanCheck();
      return this;
    }
    /**
     * Gets the current explicit owner of this component.
     * @returns The owner component/state, or null if no explicit owner is set.
     */
    getOwner() {
      return this.explicitOwner;
    }
    beforeDispose() {
      this.element.dispatchEvent(new CustomEvent("Dispose"));
      this.clearOrphanCheck();
      this.releaseStructuralCleanups();
      this.releaseExplicitOwner();
      this.releaseExplicitOwner = noop6;
      this.explicitOwner = null;
      if (getLiveComponent(this.element) === this) {
        elementComponents.delete(this.element);
      }
    }
    afterDispose() {
      this.element.remove();
      const disposeImplicitChildren = (node) => {
        if (node instanceof HTMLElement) {
          const component = getLiveComponent(node);
          if (component && !component.disposed) {
            if (component.getOwner()) {
              return;
            }
            component.remove();
            return;
          }
        }
        for (const childNode of Array.from(node.childNodes)) {
          disposeImplicitChildren(childNode);
        }
      };
      for (const childNode of Array.from(this.element.childNodes)) {
        disposeImplicitChildren(childNode);
      }
    }
    ensureActive() {
      if (this.disposed) {
        throw new Error("Disposed components cannot be modified.");
      }
    }
    clearOrphanCheck() {
      if (this.orphanCheckId === null) {
        return;
      }
      clearTimeout(this.orphanCheckId);
      this.orphanCheckId = null;
    }
    refreshOrphanCheck() {
      if (this.disposed || this.isManaged()) {
        this.clearOrphanCheck();
        return;
      }
      if (this.orphanCheckId !== null) {
        return;
      }
      this.orphanCheckId = setTimeout(() => {
        this.orphanCheckId = null;
        if (this.disposed) {
          return;
        }
        if (this.isManaged()) {
          this.dispatchMount();
          return;
        }
        throw new Error(orphanedComponentErrorMessage);
      }, 0);
    }
    isManaged() {
      if (this.element.isConnected) {
        return true;
      }
      if (this.ownerResolves(this.explicitOwner)) {
        return true;
      }
      for (const resolver of componentOwnerResolvers) {
        if (this.ownerResolves(resolver(this))) {
          return true;
        }
      }
      return false;
    }
    ownerResolves(owner) {
      if (!owner || owner.disposed) {
        return false;
      }
      if (owner instanceof _ComponentClass) {
        return owner.isManaged();
      }
      return true;
    }
    resolveNode(child) {
      if (!child && child !== "") {
        throw new Error("Cannot resolve a falsy value to a DOM node.");
      }
      if (typeof child === "string") {
        return this.element.ownerDocument.createTextNode(child);
      }
      if (child instanceof _ComponentClass) {
        child.ensureActive();
        child.onBeforeMove?.();
        return child.element;
      }
      return child;
    }
    expandChildren(children) {
      const expanded = [];
      for (const child of children) {
        if (!child && child !== "") {
          continue;
        }
        if (isComponentSelectionState(child)) {
          expanded.push(child);
          continue;
        }
        if (isChildIterable(child)) {
          for (const entry of child) {
            if (!entry && entry !== "") {
              continue;
            }
            expanded.push(entry);
          }
          continue;
        }
        expanded.push(child);
      }
      return expanded;
    }
    trackStructuralCleanup(cleanup) {
      let active = true;
      let releaseOwnerCleanup = noop6;
      const trackedCleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        this.structuralCleanups.delete(trackedCleanup);
        releaseOwnerCleanup();
        cleanup();
      };
      this.structuralCleanups.add(trackedCleanup);
      releaseOwnerCleanup = this.onCleanup(trackedCleanup);
      return trackedCleanup;
    }
    releaseStructuralCleanups() {
      const structuralCleanups = [...this.structuralCleanups];
      for (const structuralCleanup of structuralCleanups) {
        structuralCleanup();
      }
    }
    attachConditionalNode(state2, node, options) {
      if (!node && node !== "") {
        return noop6;
      }
      const resolvedNode = this.resolveNode(node);
      const placeholder = this.element.ownerDocument.createComment("kitsui:conditional");
      const storage = createStorageElement(this.element.ownerDocument);
      const childComponent = node instanceof _ComponentClass ? node : null;
      let active = true;
      let releaseChildCleanup = noop6;
      let placeholderWasInserted = false;
      const removeOwnerForMissingMarker = () => {
        if (!active) {
          return;
        }
        this.remove();
      };
      const placeVisible = () => {
        if (!active) {
          return;
        }
        const container = options.getContainer();
        if (!isMoveParent(container)) {
          if (placeholderWasInserted) {
            removeOwnerForMissingMarker();
            return;
          }
          moveNode(storage, resolvedNode, null);
          return;
        }
        if (placeholderWasInserted && resolvedNode.parentNode === storage && placeholder.parentNode !== container) {
          removeOwnerForMissingMarker();
          return;
        }
        if (placeholder.parentNode === container) {
          moveNode(container, resolvedNode, placeholder);
          placeholder.remove();
        } else {
          moveNode(container, resolvedNode, options.getReferenceNode());
        }
        childComponent?.refreshOrphanCheck();
        childComponent?.dispatchMount();
      };
      const placeHidden = () => {
        if (!active) {
          return;
        }
        const container = options.getContainer();
        if (!isMoveParent(container)) {
          if (placeholderWasInserted) {
            removeOwnerForMissingMarker();
            return;
          }
          if (resolvedNode.parentNode !== storage) {
            moveNode(storage, resolvedNode, null);
          }
          return;
        }
        if (placeholder.parentNode !== container) {
          moveNode(container, placeholder, options.getReferenceNode());
          placeholderWasInserted = true;
        }
        if (resolvedNode.parentNode !== storage) {
          moveNode(storage, resolvedNode, null);
        }
      };
      const cleanup = this.trackStructuralCleanup(() => {
        active = false;
        stateCleanup();
        releaseChildCleanup();
        placeholder.remove();
        storage.remove();
        if (childComponent) {
          childComponent.remove();
          return;
        }
        resolvedNode.parentNode?.removeChild(resolvedNode);
      });
      if (childComponent) {
        releaseChildCleanup = childComponent.onCleanup(cleanup);
      }
      const stateCleanup = state2.subscribe(this, (nextVisible) => {
        if (nextVisible) {
          placeVisible();
          return;
        }
        placeHidden();
      });
      if (state2.value) {
        placeVisible();
      } else {
        placeHidden();
      }
      return cleanup;
    }
    attachStatefulChildren(state2, options) {
      const marker = this.element.ownerDocument.createComment("kitsui:stateful-child");
      const storage = createStorageElement(this.element.ownerDocument);
      let active = true;
      let renderedComponents = [];
      let markerWasInserted = false;
      const cleanupRenderedComponents = (nextComponents = /* @__PURE__ */ new Set()) => {
        for (const component of renderedComponents) {
          if (nextComponents.has(component)) {
            continue;
          }
          component.remove();
        }
        renderedComponents = renderedComponents.filter((component) => nextComponents.has(component));
      };
      const renderSelection = (selection) => {
        if (!active) {
          return;
        }
        const nextComponents = this.resolveComponentSelection(selection);
        const nextComponentSet = new Set(nextComponents);
        const container = options.getContainer();
        if (!isMoveParent(container)) {
          if (markerWasInserted) {
            this.remove();
            return;
          }
          cleanupRenderedComponents();
          return;
        }
        if (markerWasInserted && marker.parentNode !== container) {
          this.remove();
          return;
        }
        if (marker.parentNode !== container) {
          moveNode(container, marker, options.getReferenceNode());
          markerWasInserted = true;
        }
        cleanupRenderedComponents(nextComponentSet);
        for (const component of nextComponents) {
          component.ensureActive();
          component.onBeforeMove?.();
          moveNode(container, component.element, marker);
          component.refreshOrphanCheck();
          component.dispatchMount();
        }
        renderedComponents = nextComponents;
      };
      const cleanup = this.trackStructuralCleanup(() => {
        active = false;
        stateCleanup();
        cleanupRenderedComponents();
        marker.remove();
        storage.remove();
      });
      const stateCleanup = state2.subscribe(this, (selection) => {
        renderSelection(selection);
      });
      renderSelection(state2.value);
      return cleanup;
    }
    resolveComponentSelection(selection) {
      if (!selection) {
        return [];
      }
      if (selection instanceof _ComponentClass) {
        return [selection];
      }
      if (typeof selection !== "object" || !(Symbol.iterator in selection)) {
        throw new TypeError("Unsupported component selection.");
      }
      const components = [];
      const seen = /* @__PURE__ */ new Set();
      for (const item of selection) {
        if (!item) {
          continue;
        }
        if (!(item instanceof _ComponentClass)) {
          throw new TypeError("Unsupported component selection item.");
        }
        if (seen.has(item)) {
          throw new Error("Component selections cannot contain the same component more than once.");
        }
        seen.add(item);
        components.push(item);
      }
      return components;
    }
  };
  var Component = function Component2(tagNameOrElement = "span") {
    return new ComponentClass(tagNameOrElement);
  };
  Component.prototype = ComponentClass.prototype;
  Component.query = function query(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      return null;
    }
    return elementComponents.get(element)?.deref() ?? Component(element);
  };
  Component.fromHTML = function fromHTML(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const element = template.content.firstElementChild;
    if (!element) {
      throw new Error("Invalid HTML string.");
    }
    if (template.content.childElementCount > 1) {
      throw new Error("HTML string contains multiple root elements.");
    }
    return Component(element);
  };
  Component.extend = function extend2() {
    return ComponentClass;
  };

  // src/component/extensions/placeExtension.ts
  var noop7 = () => {
  };
  var PlacementLifecycleOwner = class extends Owner {
    // Uses Owner's default lifecycle hooks.
  };
  var placementControllers = /* @__PURE__ */ new WeakMap();
  var placementOwners = /* @__PURE__ */ new WeakMap();
  var placementLifecycleOwners = /* @__PURE__ */ new WeakMap();
  var componentClass = null;
  var patched = false;
  function getComponentClass() {
    componentClass ?? (componentClass = Component.extend());
    return componentClass;
  }
  function isMoveParent2(value) {
    return value !== null && typeof value.insertBefore === "function";
  }
  function moveNode2(parent, node, beforeNode) {
    if (typeof parent.moveBefore === "function" && parent.isConnected && node.isConnected) {
      parent.moveBefore(node, beforeNode);
      return;
    }
    parent.insertBefore(node, beforeNode);
  }
  function createStorageElement2(documentRef) {
    return documentRef.createElement("kitsui-storage");
  }
  function ensureActive(component) {
    if (component.disposed) {
      throw new Error("Disposed components cannot be modified.");
    }
  }
  function isComponent(value) {
    return value instanceof getComponentClass();
  }
  function clearPlacement(component) {
    placementControllers.get(component)?.();
  }
  function getPlacementLifecycleOwner(component) {
    const existingOwner = placementLifecycleOwners.get(component);
    if (existingOwner) {
      return existingOwner;
    }
    const owner = new PlacementLifecycleOwner();
    placementLifecycleOwners.set(component, owner);
    component.onCleanup(() => {
      placementLifecycleOwners.delete(component);
      owner.dispose();
    });
    return owner;
  }
  function setPlacementController(component, cleanup) {
    clearPlacement(component);
    let active = true;
    let releaseDisposeCleanup = noop7;
    const trackedCleanup = () => {
      if (!active) {
        return;
      }
      active = false;
      if (placementControllers.get(component) === trackedCleanup) {
        placementControllers.delete(component);
      }
      releaseDisposeCleanup();
      placementOwners.delete(component);
      cleanup();
    };
    releaseDisposeCleanup = component.onCleanup(trackedCleanup);
    placementControllers.set(component, trackedCleanup);
    return trackedCleanup;
  }
  var PlaceClass = class {
    constructor(owner, marker) {
      this.owner = owner;
      __publicField(this, "marker");
      this.marker = marker;
    }
    /**
     * Moves this placement marker to the end of the target component or DOM parent.
     * @param target The target component or DOM parent.
     * @returns This place for chaining.
     */
    appendTo(target) {
      moveNode2(resolvePlacementContainer(target), this.marker, null);
      return this;
    }
    /**
     * Moves this placement marker to the start of the target component or DOM parent.
     * @param target The target component or DOM parent.
     * @returns This place for chaining.
     */
    prependTo(target) {
      const container = resolvePlacementContainer(target);
      moveNode2(container, this.marker, container.firstChild);
      return this;
    }
    /**
     * Moves this placement marker before or after a reference node/component/place.
     * @param where "before" or "after" the target.
     * @param target The reference node, component, or place.
     * @returns This place for chaining, or this unchanged if target does not exist.
     * @throws If the target's parent is not a valid insert location.
     */
    insertTo(where, target) {
      const referenceNode = resolvePlacementReferenceNode(target);
      if (!referenceNode) {
        return this;
      }
      const parentNode = referenceNode.parentNode;
      if (!isMoveParent2(parentNode)) {
        throw new Error("Insert target was not found.");
      }
      moveNode2(parentNode, this.marker, where === "before" ? referenceNode : referenceNode.nextSibling);
      return this;
    }
    /**
     * Removes this placement marker from the DOM.
     */
    remove() {
      this.marker.remove();
    }
  };
  function resolvePlacementReferenceNode(target) {
    if (!target) {
      return null;
    }
    if (isComponent(target)) {
      return target.element;
    }
    if (target instanceof PlaceClass) {
      return target.marker;
    }
    return target;
  }
  function resolvePlacementContainer(target) {
    if (isComponent(target)) {
      ensureActive(target);
      return target.element;
    }
    if (isMoveParent2(target)) {
      return target;
    }
    throw new Error("Insert target was not found.");
  }
  function resolveNearestWrappedAncestor(node) {
    let current = node;
    while (current) {
      if (current instanceof HTMLElement) {
        const component = current.component;
        if (component) {
          return component;
        }
      }
      current = current.parentNode;
    }
    return null;
  }
  function resolveOwnPlacementOwner(component) {
    if (!component) {
      return null;
    }
    return component.getOwner() ?? placementOwners.get(component) ?? null;
  }
  function resolvePlacementOwner(target, component) {
    if (!target) {
      return null;
    }
    if (isComponent(target)) {
      return target === component ? resolveOwnPlacementOwner(component) : resolveOwnPlacementOwner(target);
    }
    if (target instanceof PlaceClass) {
      return target.owner;
    }
    const owner = resolveNearestWrappedAncestor(target);
    if (owner === component) {
      return resolveOwnPlacementOwner(component);
    }
    return owner;
  }
  function resolvePlacementContainerOwner(target, component) {
    if (isComponent(target)) {
      return target === component ? resolveOwnPlacementOwner(component) : target;
    }
    return resolvePlacementOwner(target, component);
  }
  function toPlaceSource(state2, place) {
    return {
      get value() {
        return state2.value ? place : null;
      },
      subscribe(owner, listener) {
        return state2.subscribe(owner, (value) => {
          listener(value ? place : null);
        });
      }
    };
  }
  function placeComponent(component, parent, beforeNode) {
    component["onBeforeMove"]?.();
    clearPlacement(component);
    moveNode2(parent, component.element, beforeNode);
    component["refreshOrphanCheck"]();
    component["dispatchMount"]();
  }
  function placeExtension() {
    if (patched) {
      return;
    }
    patched = true;
    registerComponentOwnerResolver((component) => {
      return placementOwners.get(component) ?? null;
    });
    const ComponentClass2 = getComponentClass();
    const prototype = ComponentClass2.prototype;
    prototype.appendTo = function appendTo(target) {
      ensureActive(this);
      const container = resolvePlacementContainer(target);
      placeComponent(this, container, null);
      return this;
    };
    prototype.appendToWhen = function appendToWhen(state2, target) {
      const targetOwner = resolvePlacementContainerOwner(target, this) ?? getPlacementLifecycleOwner(this);
      return this.place(targetOwner, (Place) => {
        const place = Place().appendTo(target);
        return toPlaceSource(state2, place);
      });
    };
    prototype.prependTo = function prependTo(target) {
      ensureActive(this);
      const container = resolvePlacementContainer(target);
      placeComponent(this, container, container.firstChild);
      return this;
    };
    prototype.prependToWhen = function prependToWhen(state2, target) {
      const targetOwner = resolvePlacementContainerOwner(target, this) ?? getPlacementLifecycleOwner(this);
      return this.place(targetOwner, (Place) => {
        const place = Place().prependTo(target);
        return toPlaceSource(state2, place);
      });
    };
    prototype.insertTo = function insertTo(where, target) {
      ensureActive(this);
      const referenceNode = resolvePlacementReferenceNode(target);
      if (!referenceNode) {
        return this;
      }
      const parentNode = referenceNode.parentNode;
      if (!isMoveParent2(parentNode)) {
        throw new Error("Insert target was not found.");
      }
      placeComponent(this, parentNode, where === "before" ? referenceNode : referenceNode.nextSibling);
      return this;
    };
    prototype.insertToWhen = function insertToWhen(state2, where, target) {
      const targetOwner = resolvePlacementOwner(target, this) ?? getPlacementLifecycleOwner(this);
      return this.place(targetOwner, (Place) => {
        const place = Place().insertTo(where, target);
        return toPlaceSource(state2, place);
      });
    };
    prototype.place = function place(owner, placer) {
      ensureActive(this);
      const placementOwner = owner === this ? getPlacementLifecycleOwner(this) : owner;
      this.setOwner(null);
      placementOwners.set(this, placementOwner);
      const documentRef = this.element.ownerDocument;
      const storage = createStorageElement2(documentRef);
      const places = /* @__PURE__ */ new Set();
      const Place = function Place2() {
        const place2 = new PlaceClass(placementOwner, documentRef.createComment("kitsui:place"));
        places.add(place2);
        return place2;
      };
      Place.prototype = PlaceClass.prototype;
      const placeState = placer(Place);
      let releaseOwnerCleanup = noop7;
      let releaseStateCleanup = noop7;
      const cleanup = setPlacementController(this, () => {
        releaseOwnerCleanup();
        releaseStateCleanup();
        this["onBeforeMove"] = null;
        if (isMoveParent2(storage)) {
          moveNode2(storage, this.element, null);
        }
        for (const place2 of places) {
          place2.remove();
        }
        storage.remove();
      });
      this["onBeforeMove"] = () => clearPlacement(this);
      const syncPlace = (place2) => {
        if (!place2) {
          moveNode2(storage, this.element, null);
          return;
        }
        const parentNode = place2.marker.parentNode;
        if (!isMoveParent2(parentNode)) {
          console.error("Placement marker was removed. Treating placement as null.");
          moveNode2(storage, this.element, null);
          return;
        }
        moveNode2(parentNode, this.element, place2.marker);
        this["refreshOrphanCheck"]();
        this["dispatchMount"]();
      };
      releaseStateCleanup = placeState.subscribe(this, (place2) => {
        syncPlace(place2);
      });
      syncPlace(placeState.value);
      releaseOwnerCleanup = placementOwner.onCleanup(cleanup);
      return this;
    };
  }

  // src/state/extensions/mappingExtension.ts
  var truthyStates = /* @__PURE__ */ new WeakMap();
  var falsyStates = /* @__PURE__ */ new WeakMap();
  var patched2 = false;
  function createMappedState(source, owner, mapValue) {
    const graphOption = {
      graph: source.getGraph()
    };
    const mapped = owner ? State(owner, mapValue(source.value), graphOption) : State(mapValue(source.value), graphOption);
    const releaseSourceSubscription = source.subscribeImmediate(mapped, (value, oldValue) => {
      mapped.set(mapValue(value, oldValue));
    });
    const releaseSourceCleanup = source.onCleanup(() => {
      mapped.dispose();
    });
    mapped.onCleanup(() => {
      releaseSourceCleanup();
      releaseSourceSubscription();
    });
    mapped.recompute = () => {
      mapped.set(mapValue(source.value, source.value));
    };
    return mapped;
  }
  function mappingExtension() {
    if (patched2) {
      return;
    }
    patched2 = true;
    const StateClass2 = State.extend();
    const prototype = StateClass2.prototype;
    prototype.map = function map(ownerOrMapValue, maybeMapValue) {
      if (ownerOrMapValue instanceof Owner) {
        return createMappedState(this, ownerOrMapValue, maybeMapValue);
      }
      return createMappedState(this, null, ownerOrMapValue);
    };
    Object.defineProperty(prototype, "truthy", {
      configurable: true,
      enumerable: false,
      get() {
        let mapped = truthyStates.get(this);
        if (!mapped) {
          mapped = createMappedState(this, this, (value) => Boolean(value));
          truthyStates.set(this, mapped);
        }
        return mapped;
      }
    });
    Object.defineProperty(prototype, "falsy", {
      configurable: true,
      enumerable: false,
      get() {
        let mapped = falsyStates.get(this);
        if (!mapped) {
          mapped = createMappedState(this, this, (value) => !value);
          falsyStates.set(this, mapped);
        }
        return mapped;
      }
    });
    prototype.or = function or(getValue) {
      return createMappedState(this, this, (value) => {
        if (value === null || value === void 0) {
          return getValue();
        }
        return value;
      });
    };
    prototype.equals = function equals(compareValue) {
      return createMappedState(this, this, (value) => value === compareValue);
    };
  }

  // src/index.ts
  placeExtension();
  mappingExtension();
  return __toCommonJS(index_exports);
})();


  return __kitsui_factory__;
});
