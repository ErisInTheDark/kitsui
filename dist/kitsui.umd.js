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
    Draggable: () => Draggable,
    DropTarget: () => DropTarget,
    EventManipulator: () => EventManipulator,
    GenericClaimManipulator: () => GenericClaimManipulator,
    GenericPropertyManipulator: () => GenericPropertyManipulator,
    Marker: () => Marker,
    Owner: () => Owner,
    OwnerManipulator: () => OwnerManipulator,
    Sortable: () => Sortable,
    State: () => State,
    Style: () => Style,
    StyleAnimation: () => StyleAnimation,
    StyleFontFace: () => StyleFontFace,
    StyleImport: () => StyleImport,
    StyleManipulator: () => StyleManipulator,
    StyleReset: () => StyleReset,
    StyleRoot: () => StyleRoot,
    StyleSelector: () => StyleSelector,
    TextManipulator: () => TextManipulator,
    darkScheme: () => darkScheme,
    elements: () => elements,
    lightScheme: () => lightScheme,
    pseudoAfter: () => pseudoAfter,
    pseudoBefore: () => pseudoBefore,
    whenActive: () => whenActive,
    whenActiveSelf: () => whenActiveSelf,
    whenClosed: () => whenClosed,
    whenDisabled: () => whenDisabled,
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

  // src/utility/timeoutPromise.ts
  function scheduleTimeoutPromise(callback) {
    let active = true;
    let timeoutId = null;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(resolve, 0);
    });
    void timeoutPromise.then(() => {
      timeoutId = null;
      if (!active) {
        return;
      }
      active = false;
      try {
        callback();
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    });
    return {
      cancel() {
        if (!active) {
          return;
        }
        active = false;
        if (timeoutId === null) {
          return;
        }
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  }

  // src/state/State.ts
  var noop = () => {
  };
  var ident = (value) => value;
  function assertDefinedStateValue(value) {
    if (value !== void 0) {
      return;
    }
    throw new TypeError("State values cannot be undefined.");
  }
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
        if (!pendingListener.forcePendingEmit && pendingListener.equals(pendingListener.pendingOriginalValue, pendingListener.pendingFinalValue)) {
          continue;
        }
        pendingListener.forcePendingEmit = false;
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
  function getEqualityFunction(state2) {
    return state2["equalityFunction"];
  }
  function getFixFunction(state2) {
    return state2["fixFunction"];
  }
  function fixStateValue(fix, value) {
    return fix(value) ?? value;
  }
  function getImmediateListeners(state2) {
    return state2["immediateListeners"];
  }
  function getQueuedListeners(state2) {
    return state2["queuedListeners"];
  }
  var StateClass = class _StateClass extends Owner {
    constructor(owner, initialValue, options = {}) {
      super();
      __publicField(this, "owner");
      __publicField(this, "releaseOwner", noop);
      __publicField(this, "isImplicitOwner", false);
      __publicField(this, "mutable", true);
      __publicField(this, "requiresExplicitOwner", false);
      __publicField(this, "implicitOwnerDependents", /* @__PURE__ */ new Set());
      __publicField(this, "orphanCheckId", null);
      __publicField(this, "currentValue");
      /** @deprecated Use getEqualityFunction(this) */
      __publicField(this, "equalityFunction");
      /** @deprecated Use getFixFunction(this) */
      __publicField(this, "fixFunction");
      __publicField(this, "graph");
      /** @deprecated Use getImmediateListeners(this) */
      __publicField(this, "immediateListeners", /* @__PURE__ */ new Set());
      /** @deprecated Use getQueuedListeners(this) */
      __publicField(this, "queuedListeners", /* @__PURE__ */ new Set());
      assertDefinedStateValue(initialValue);
      this.owner = owner;
      this.fixFunction = options.fix ?? ident;
      this.currentValue = fixStateValue(this.fixFunction, initialValue);
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
     * Whether the public state reference can be safely treated as mutable.
     */
    isMutable() {
      return this.mutable;
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
      assertDefinedStateValue(nextValue);
      const fixedValue = fixStateValue(getFixFunction(this), nextValue);
      if (getEqualityFunction(this)(this.currentValue, fixedValue)) {
        return this.currentValue;
      }
      return this.commit(fixedValue, false);
    }
    commit(nextValue, forceNotify) {
      const previousValue = this.currentValue;
      this.currentValue = nextValue;
      for (const listenerRecord of [...getImmediateListeners(this)]) {
        if (!listenerRecord.active) {
          continue;
        }
        listenerRecord.listener(this.currentValue, previousValue);
      }
      for (const listenerRecord of getQueuedListeners(this)) {
        if (!listenerRecord.active) {
          continue;
        }
        if (!listenerRecord.pending) {
          listenerRecord.pending = true;
          listenerRecord.forcePendingEmit = forceNotify;
          listenerRecord.pendingOriginalValue = previousValue;
          listenerRecord.pendingFinalValue = this.currentValue;
          listenerRecord.equals = getEqualityFunction(this);
          listenerRecord.graph.pendingListeners.add(listenerRecord);
          scheduleGraphFlush(listenerRecord.graph);
          continue;
        }
        listenerRecord.forcePendingEmit || (listenerRecord.forcePendingEmit = forceNotify);
        listenerRecord.pendingFinalValue = this.currentValue;
      }
      return this.currentValue;
    }
    /**
     * Replaces the internal state value without checking disposal or notifying listeners.
     * This is intended for silent state resets during disposal and cleanup flows.
     * @param nextValue The new value for this state.
     * @returns The stored state value.
     */
    clear(nextValue) {
      assertDefinedStateValue(nextValue);
      this.currentValue = nextValue;
      return this.currentValue;
    }
    /**
     * Updates the state by applying a function to the current value.
     * Returning `undefined` keeps the current value, which is still passed through `fix()` and emitted to listeners.
     * Unlike {@link set}, `update` always notifies listeners, even when the effective value is unchanged.
     * @param updater Function that transforms the current value to a new value.
     * @returns The stored state value after the update.
     * @throws If the state has been disposed.
     */
    update(updater) {
      this.ensureActive();
      const nextValue = updater(this.currentValue);
      return this.commit(fixStateValue(getFixFunction(this), nextValue === void 0 ? this.currentValue : nextValue), true);
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
      getImmediateListeners(this).add(listenerRecord);
      return () => {
        if (!listenerRecord.active) {
          return;
        }
        listenerRecord.active = false;
        getImmediateListeners(this).delete(listenerRecord);
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
        equals: getEqualityFunction(this),
        forcePendingEmit: false,
        graph: this.graph,
        listener,
        pending: false,
        pendingFinalValue: this.currentValue,
        pendingOriginalValue: this.currentValue
      };
      getQueuedListeners(this).add(listenerRecord);
      return () => {
        if (!listenerRecord.active) {
          return;
        }
        listenerRecord.active = false;
        if (listenerRecord.pending) {
          listenerRecord.pending = false;
          this.graph.pendingListeners.delete(listenerRecord);
        }
        getQueuedListeners(this).delete(listenerRecord);
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
    _registerImplicitOwnerDependent(dependent) {
      const dependentState = dependent;
      if (this.disposed || dependentState.disposed) {
        return noop;
      }
      this.implicitOwnerDependents.add(dependentState);
      if (this.isImplicitOwner && this.owner !== null) {
        dependentState.setImplicitOwnerCandidate(this.owner);
      }
      return () => {
        this.implicitOwnerDependents.delete(dependentState);
      };
    }
    beforeDispose() {
      this.clearOrphanCheck();
      this.releaseOwner();
      this.releaseOwner = noop;
      for (const listenerRecord of getImmediateListeners(this)) {
        listenerRecord.active = false;
      }
      for (const listenerRecord of getQueuedListeners(this)) {
        listenerRecord.active = false;
        if (listenerRecord.pending) {
          listenerRecord.pending = false;
          this.graph.pendingListeners.delete(listenerRecord);
        }
      }
      getImmediateListeners(this).clear();
      getQueuedListeners(this).clear();
      this.implicitOwnerDependents.clear();
    }
    clearOrphanCheck() {
      if (this.orphanCheckId === null) {
        return;
      }
      this.orphanCheckId.cancel();
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
      this.orphanCheckId = scheduleTimeoutPromise(() => {
        this.orphanCheckId = null;
        if (this.disposed || this.owner !== null) {
          return;
        }
        throw new Error(orphanedStateErrorMessage);
      });
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
        this.notifyImplicitOwnerDependents(candidate);
        return;
      }
      this.owner = candidate;
      this.isImplicitOwner = true;
      this.releaseOwner = candidate.onCleanup(() => {
        this.dispose();
      });
      this.clearOrphanCheck();
      this.notifyImplicitOwnerDependents(candidate);
    }
    notifyImplicitOwnerDependents(candidate) {
      for (const dependent of this.implicitOwnerDependents) {
        dependent.setImplicitOwnerCandidate(candidate);
      }
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
  State.Readonly = function Readonly(value) {
    const readonlyState = new StateClass(null, value);
    readonlyState["clearOrphanCheck"]();
    readonlyState["mutable"] = false;
    readonlyState.clear = () => readonlyState.value;
    readonlyState.set = ident;
    readonlyState.update = () => readonlyState.value;
    return readonlyState;
  };

  // src/component/AriaManipulator.ts
  var generatedAriaReferenceId = 0;
  var mappedReferenceStatesByOwner = /* @__PURE__ */ new WeakMap();
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
  function toReferenceValueInput(owner, value) {
    if (owner.disposed) {
      throw new Error("Disposed components cannot be modified.");
    }
    if (!(value instanceof State)) {
      return resolveReferenceSelection(value);
    }
    const cachedBySource = mappedReferenceStatesByOwner.get(owner);
    const cachedMapped = cachedBySource?.get(value);
    if (cachedMapped) {
      return cachedMapped;
    }
    const mappedValue = State(owner, resolveReferenceSelection(value.value));
    const bySource = cachedBySource ?? /* @__PURE__ */ new WeakMap();
    if (!cachedBySource) {
      mappedReferenceStatesByOwner.set(owner, bySource);
      owner.onCleanup(() => {
        mappedReferenceStatesByOwner.delete(owner);
      });
    }
    bySource.set(value, mappedValue);
    value.subscribe(mappedValue, (nextValue) => {
      mappedValue.set(resolveReferenceSelection(nextValue));
    });
    return mappedValue;
  }
  var AriaManipulator = class {
    constructor(owner, attribute) {
      this.owner = owner;
      this.attribute = attribute;
    }
    /**
     * Set the ARIA role.
     * @param value The role value or reactive State.
     */
    role(value) {
      return this.set("role", value);
    }
    /**
     * Set the ARIA label.
     * @param value The label text or reactive State.
     */
    label(value) {
      return this.set("aria-label", value);
    }
    /**
     * Set the ARIA description.
     * @param value The description text or reactive State.
     */
    description(value) {
      return this.set("aria-description", value);
    }
    /**
     * Set the ARIA role description.
     * @param value The role description text or reactive State.
     */
    roleDescription(value) {
      return this.set("aria-roledescription", value);
    }
    /**
     * Set aria-labelledby: elements that label this element.
     * @param value Element reference(s) or reactive State.
     */
    labelledBy(value) {
      return this.set("aria-labelledby", toReferenceValueInput(this.owner, value));
    }
    /**
     * Set aria-describedby: elements that describe this element.
     * @param value Element reference(s) or reactive State.
     */
    describedBy(value) {
      return this.set("aria-describedby", toReferenceValueInput(this.owner, value));
    }
    /**
     * Set aria-controls: elements controlled by this element.
     * @param value Element reference(s) or reactive State.
     */
    controls(value) {
      return this.set("aria-controls", toReferenceValueInput(this.owner, value));
    }
    /**
     * Set aria-details: elements that provide details for this element.
     * @param value Element reference(s) or reactive State.
     */
    details(value) {
      return this.set("aria-details", toReferenceValueInput(this.owner, value));
    }
    /**
     * Set aria-owns: elements owned by this element.
     * @param value Element reference(s) or reactive State.
     */
    owns(value) {
      return this.set("aria-owns", toReferenceValueInput(this.owner, value));
    }
    /**
     * Set aria-flowto: elements that follow this element.
     * @param value Element reference(s) or reactive State.
     */
    flowTo(value) {
      return this.set("aria-flowto", toReferenceValueInput(this.owner, value));
    }
    /**
     * Set aria-hidden: whether this element is hidden from assistive technology.
     * @param value The boolean value or reactive State.
     */
    hidden(value) {
      return this.set("aria-hidden", value);
    }
    /**
     * Set aria-disabled: whether this element is disabled.
     * @param value The boolean value or reactive State.
     */
    disabled(value) {
      return this.set("aria-disabled", value);
    }
    /**
     * Set aria-expanded: whether this element is expanded.
     * @param value The boolean value or reactive State.
     */
    expanded(value) {
      return this.set("aria-expanded", value);
    }
    /**
     * Set aria-busy: whether this element is busy/loading.
     * @param value The boolean value or reactive State.
     */
    busy(value) {
      return this.set("aria-busy", value);
    }
    /**
     * Set aria-selected: whether this element is selected.
     * @param value The boolean value or reactive State.
     */
    selected(value) {
      return this.set("aria-selected", value);
    }
    /**
     * Set aria-checked: whether this element is checked (true, false, or "mixed").
     * @param value The boolean/mixed value or reactive State.
     */
    checked(value) {
      return this.set("aria-checked", value);
    }
    /**
     * Set aria-pressed: whether this element is pressed (true, false, or "mixed").
     * @param value The boolean/mixed value or reactive State.
     */
    pressed(value) {
      return this.set("aria-pressed", value);
    }
    /**
     * Set aria-current: mark this element or one of its descendants as the current page/step/location.
     * @param value The current value (true, false, or a location type) or reactive State.
     */
    current(value) {
      return this.set("aria-current", value);
    }
    /**
     * Set aria-live: announce dynamic content updates (off, polite, or assertive).
     * @param value The politeness level or reactive State.
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
    return value instanceof State;
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
    return State.Readonly(value === void 0 ? null : value);
  }
  function toAttributeValueSource(value) {
    if (isStateSource(value)) {
      return value;
    }
    return State.Readonly(value === void 0 ? null : value);
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
    /**
     * Toggles valueless attributes on the element based on a boolean.
     * @param attribute Attribute name or names to toggle.
     * @param enabled Whether the attributes should be present.
     * @returns The owning component for fluent chaining.
     */
    toggle(attribute, enabled) {
      this.ensureActive();
      this.installAttributePresence(attribute, () => enabled ? "" : null, isStateSource(attribute));
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

  // src/component/EventManipulator.ts
  var noop3 = () => {
  };
  function isListenerSource(value) {
    return value instanceof State;
  }
  function resolveListenerValue(value) {
    if (value === null || value === void 0) {
      return value;
    }
    if (typeof value === "function") {
      return value;
    }
    throw new TypeError("Unsupported listener source value.");
  }
  function isListenerKey(value) {
    return typeof value === "function" || isListenerSource(value);
  }
  function defineHostedEvent(event, host, hostPropertyName) {
    Object.defineProperty(event, hostPropertyName, {
      configurable: true,
      enumerable: false,
      value: host,
      writable: false
    });
    return event;
  }
  var EventManipulator = class {
    constructor(owner, target, hostPropertyName = "component") {
      this.owner = owner;
      this.target = target;
      this.hostPropertyName = hostPropertyName;
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
      let cleanup = noop3;
      let active = true;
      let releaseDom = noop3;
      let releaseOwner = noop3;
      let releaseSource = noop3;
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
          releaseOwner = noop3;
          releaseDom = noop3;
          return;
        }
        const handleEvent = (event) => {
          nextListener(defineHostedEvent(event, this.owner, this.hostPropertyName));
        };
        this.target.addEventListener(eventName, handleEvent);
        releaseDom = () => {
          this.target.removeEventListener(eventName, handleEvent);
        };
        releaseOwner = owner.onCleanup(trackedCleanup);
      };
      eventRecords.set(key, { cleanup: trackedCleanup });
      if (isListenerSource(listener)) {
        releaseSource = listener.subscribe(owner, (nextValue) => {
          applyResolvedListener(resolveListenerValue(nextValue));
        });
        applyResolvedListener(resolveListenerValue(listener.value));
        return;
      }
      applyResolvedListener(resolveListenerValue(listener));
    }
    removeListener(eventName, listener) {
      if (!isListenerKey(listener)) {
        return;
      }
      this.listenerRecords.get(eventName)?.get(listener)?.cleanup();
    }
    ensureActive() {
      if (this.owner.disposed) {
        throw new Error("Disposed owners cannot be modified.");
      }
    }
  };

  // src/component/GenericClaimManipulator.ts
  var noop4 = () => {
  };
  function isBooleanStateClaim(claim) {
    return claim instanceof State;
  }
  var GenericClaimManipulator = class {
    constructor(owner) {
      this.owner = owner;
      __publicField(this, "anonymousClaims", /* @__PURE__ */ new Set());
      __publicField(this, "claimsByClaimant", /* @__PURE__ */ new Map());
      __publicField(this, "keyedClaims", /* @__PURE__ */ new Map());
      __publicField(this, "activeClaimCount", 0);
      /**
       * True while any registered claim is currently active.
       * Subclasses can observe or bind this state through their own public API.
       */
      __publicField(this, "hasClaim");
      this.hasClaim = State(owner, false);
    }
    /**
     * Registers a claim against this manipulator.
     * A non-null id reserves a single slot, so later claims with the same id replace the previous claimant.
     * A null id registers an anonymous claim that overlaps with any number of other anonymous claims.
     * Owner claims stay active until that owner is cleaned up, and State claims stay active while their value is true.
     * @param id Unique claim slot to replace, or null to register an overlapping anonymous claim.
     * @param claim Owner or boolean state contributing the claim.
     */
    registerClaim(id, claim) {
      this.ensureActive();
      if (id === null) {
        const record2 = this.createClaimRecord(id, claim);
        this.anonymousClaims.add(record2);
        this.trackClaimant(record2);
        return;
      }
      const record = this.createClaimRecord(id, claim);
      const previousClaim = this.keyedClaims.get(id);
      this.keyedClaims.set(id, record);
      this.trackClaimant(record);
      previousClaim?.cleanup();
    }
    deregisterClaim(idOrClaimant, claimant) {
      this.ensureActive();
      if (claimant !== void 0) {
        if (idOrClaimant === null) {
          this.cleanupMatchingClaims(this.claimsByClaimant.get(claimant), (record) => record.id === null);
          return;
        }
        const keyedClaim = this.keyedClaims.get(idOrClaimant);
        if (keyedClaim?.claimant === claimant) {
          keyedClaim.cleanup();
        }
        return;
      }
      if (typeof idOrClaimant === "string") {
        this.keyedClaims.get(idOrClaimant)?.cleanup();
        return;
      }
      if (idOrClaimant !== null) {
        this.cleanupMatchingClaims(this.claimsByClaimant.get(idOrClaimant));
      }
    }
    createClaimRecord(id, claim) {
      let record;
      const releaseClaimRecord = () => {
        if (id === null) {
          this.anonymousClaims.delete(record);
        } else if (this.keyedClaims.get(id) === record) {
          this.keyedClaims.delete(id);
        }
        this.untrackClaimant(record);
      };
      record = isBooleanStateClaim(claim) ? this.createStateClaimRecord(id, claim, releaseClaimRecord) : this.createOwnerClaimRecord(id, claim, releaseClaimRecord);
      return record;
    }
    createOwnerClaimRecord(id, claim, onCleanup) {
      const record = {
        id,
        claimant: claim,
        active: false,
        cleanup: noop4
      };
      let active = true;
      let releaseOwner = noop4;
      let releaseClaim = noop4;
      const cleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        this.setClaimActive(record, false);
        onCleanup();
        releaseOwner();
        releaseClaim();
      };
      record.cleanup = cleanup;
      releaseOwner = this.owner.onCleanup(cleanup);
      this.setClaimActive(record, true);
      releaseClaim = claim.onCleanup(cleanup);
      return record;
    }
    createStateClaimRecord(id, claim, onCleanup) {
      const record = {
        id,
        claimant: claim,
        active: false,
        cleanup: noop4
      };
      let active = true;
      let releaseOwner = noop4;
      let releaseClaim = noop4;
      let releaseClaimOwner = noop4;
      const cleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        this.setClaimActive(record, false);
        onCleanup();
        releaseOwner();
        releaseClaim();
        releaseClaimOwner();
      };
      record.cleanup = cleanup;
      releaseOwner = this.owner.onCleanup(cleanup);
      this.setClaimActive(record, claim.value);
      releaseClaimOwner = claim.onCleanup(cleanup);
      releaseClaim = claim.subscribe(this.owner, (value) => {
        if (!active) {
          return;
        }
        this.setClaimActive(record, value);
      });
      return record;
    }
    cleanupMatchingClaims(records, predicate) {
      if (!records) {
        return;
      }
      for (const record of [...records]) {
        if (predicate && !predicate(record)) {
          continue;
        }
        record.cleanup();
      }
    }
    trackClaimant(record) {
      let records = this.claimsByClaimant.get(record.claimant);
      if (!records) {
        records = /* @__PURE__ */ new Set();
        this.claimsByClaimant.set(record.claimant, records);
      }
      records.add(record);
    }
    untrackClaimant(record) {
      const records = this.claimsByClaimant.get(record.claimant);
      if (!records) {
        return;
      }
      records.delete(record);
      if (records.size === 0) {
        this.claimsByClaimant.delete(record.claimant);
      }
    }
    setClaimActive(record, active) {
      if (record.active === active) {
        return;
      }
      record.active = active;
      this.activeClaimCount += active ? 1 : -1;
      this.syncHasClaim();
    }
    syncHasClaim() {
      if (this.hasClaim.disposed) {
        return;
      }
      const nextValue = this.activeClaimCount > 0;
      if (this.hasClaim.value === nextValue) {
        return;
      }
      this.hasClaim.set(nextValue);
    }
    ensureActive() {
      if (this.owner.disposed) {
        throw new Error("Disposed owners cannot be modified.");
      }
    }
  };

  // src/component/OwnerManipulator.ts
  var noop5 = () => {
  };
  var OwnerManipulator = class extends GenericClaimManipulator {
    constructor(owner, refreshManagement) {
      super(owner);
      this.refreshManagement = refreshManagement;
      __publicField(this, "anonymousEntries", /* @__PURE__ */ new Map());
      __publicField(this, "entriesByOwner", /* @__PURE__ */ new Map());
      __publicField(this, "keyedEntries", /* @__PURE__ */ new Map());
      owner.onCleanup(() => {
        this.clearEntries();
      });
    }
    /**
     * Adds an explicit owner claim to the host.
     * A non-null id replaces any previous claim registered in the same slot.
     * Anonymous claims are deduplicated by owner.
     * @param owner Explicit owner to register.
     * @param id Optional keyed claim slot.
     * @returns The owning host for fluent chaining.
     */
    add(owner, id = null) {
      if (id === null) {
        if (this.anonymousEntries.has(owner)) {
          return this.owner;
        }
      } else {
        const existingEntry = this.keyedEntries.get(id);
        if (existingEntry?.owner === owner) {
          return this.owner;
        }
        if (existingEntry) {
          this.unregisterEntry(existingEntry, true);
        }
      }
      const entry = {
        active: true,
        id,
        owner,
        releaseLifecycle: noop5
      };
      entry.releaseLifecycle = owner.onCleanup(() => {
        if (!entry.active) {
          return;
        }
        this.unregisterEntry(entry, true);
        if (this.getAll().length === 0) {
          this.owner.remove();
        }
      });
      this.trackEntry(entry);
      this.registerClaim(id, owner);
      this.refreshManagement();
      return this.owner;
    }
    remove(idOrOwner, owner) {
      if (owner !== void 0) {
        if (idOrOwner === null) {
          const anonymousEntry = this.anonymousEntries.get(owner);
          if (anonymousEntry) {
            this.unregisterEntry(anonymousEntry, true);
          }
          return this.owner;
        }
        const keyedEntry = this.keyedEntries.get(idOrOwner);
        if (keyedEntry?.owner === owner) {
          this.unregisterEntry(keyedEntry, true);
        }
        return this.owner;
      }
      if (typeof idOrOwner === "string") {
        const keyedEntry = this.keyedEntries.get(idOrOwner);
        if (keyedEntry) {
          this.unregisterEntry(keyedEntry, true);
        }
        return this.owner;
      }
      if (idOrOwner !== null) {
        const entries = this.entriesByOwner.get(idOrOwner);
        for (const entry of [...entries ?? []]) {
          this.unregisterEntry(entry, true);
        }
      }
      return this.owner;
    }
    /**
     * Returns one explicit owner if any are registered.
     * When multiple owners are present, which owner is returned is not guaranteed.
     * @returns One explicit owner or null when no owners are registered.
     */
    get() {
      for (const entry of this.keyedEntries.values()) {
        return entry.owner;
      }
      for (const entry of this.anonymousEntries.values()) {
        return entry.owner;
      }
      return null;
    }
    /**
     * Returns every currently registered explicit owner without duplicates.
     * @returns All explicit owners currently managing the host.
     */
    getAll() {
      return [...new Set([
        ...this.keyedEntries.values(),
        ...this.anonymousEntries.values()
      ].map((entry) => entry.owner))];
    }
    clearEntries() {
      for (const entry of [
        ...this.keyedEntries.values(),
        ...this.anonymousEntries.values()
      ]) {
        this.untrackEntry(entry);
        entry.active = false;
        entry.releaseLifecycle();
      }
    }
    trackEntry(entry) {
      if (entry.id === null) {
        this.anonymousEntries.set(entry.owner, entry);
      } else {
        this.keyedEntries.set(entry.id, entry);
      }
      let entries = this.entriesByOwner.get(entry.owner);
      if (!entries) {
        entries = /* @__PURE__ */ new Set();
        this.entriesByOwner.set(entry.owner, entries);
      }
      entries.add(entry);
    }
    untrackEntry(entry) {
      if (entry.id === null) {
        if (this.anonymousEntries.get(entry.owner) === entry) {
          this.anonymousEntries.delete(entry.owner);
        }
      } else if (this.keyedEntries.get(entry.id) === entry) {
        this.keyedEntries.delete(entry.id);
      }
      const ownerEntries = this.entriesByOwner.get(entry.owner);
      if (!ownerEntries) {
        return;
      }
      ownerEntries.delete(entry);
      if (ownerEntries.size === 0) {
        this.entriesByOwner.delete(entry.owner);
      }
    }
    unregisterEntry(entry, deregisterClaim) {
      if (!entry.active) {
        return;
      }
      entry.active = false;
      this.untrackEntry(entry);
      entry.releaseLifecycle();
      if (deregisterClaim) {
        this.deregisterClaim(entry.id, entry.owner);
      }
      this.refreshManagement();
    }
  };

  // src/component/Marker.ts
  var orphanedMarkerErrorMessage = "Markers must be connected to the document or have a managed owner before the next tick.";
  var markers = /* @__PURE__ */ new WeakMap();
  var markerAccessorInstalled = false;
  function getLiveMarker(node) {
    const marker = markers.get(node)?.deref();
    if (!marker) {
      markers.delete(node);
      return void 0;
    }
    return marker;
  }
  function installNodeMarkerAccessor() {
    if (markerAccessorInstalled) {
      return;
    }
    markerAccessorInstalled = true;
    Object.defineProperty(Node.prototype, "marker", {
      configurable: true,
      enumerable: false,
      get() {
        if (!(this instanceof Comment)) {
          return void 0;
        }
        return getLiveMarker(this);
      }
    });
  }
  function getWrappedNodeOwner(node) {
    const maybeMarker = node.marker;
    if (maybeMarker) {
      return maybeMarker;
    }
    const maybeComponent = node.component;
    return maybeComponent ?? null;
  }
  function getOwnerNode(owner) {
    const value = owner;
    if (value.node instanceof Node) {
      return value.node;
    }
    if (value.element instanceof Node) {
      return value.element;
    }
    return null;
  }
  function getExplicitOwners(owner) {
    const value = owner;
    return value.owner && typeof value.owner.getAll === "function" ? value.owner.getAll() : [];
  }
  function isManagedOwner(owner, visitedOwners) {
    if (!owner || owner.disposed) {
      return false;
    }
    if (visitedOwners.has(owner)) {
      return false;
    }
    visitedOwners.add(owner);
    const value = owner;
    const ownerNode = getOwnerNode(owner);
    if (ownerNode && isManagedNode(ownerNode, visitedOwners)) {
      return true;
    }
    const explicitOwners = getExplicitOwners(owner);
    if (explicitOwners.length > 0) {
      return explicitOwners.some((explicitOwner) => isManagedOwner(explicitOwner, visitedOwners));
    }
    if (ownerNode && "element" in value && typeof value.isManaged === "function") {
      return value.isManaged();
    }
    return ownerNode === null;
  }
  function isManagedNode(node, visitedOwners = /* @__PURE__ */ new Set()) {
    if (node.isConnected) {
      return true;
    }
    let current = node;
    while (current) {
      const wrappedOwner = getWrappedNodeOwner(current);
      if (wrappedOwner && isManagedOwner(wrappedOwner, visitedOwners)) {
        return true;
      }
      current = current.parentNode;
    }
    return false;
  }
  var MarkerClass = class extends Owner {
    /**
     * Creates a new marker comment with the given identifier text.
     * @param id The comment text to store in the marker node.
     */
    constructor(id) {
      super();
      /** The underlying DOM comment node that this marker wraps. */
      __publicField(this, "node");
      __publicField(this, "mounted", false);
      __publicField(this, "orphanCheckId", null);
      installNodeMarkerAccessor();
      this.node = document.createComment(id);
      markers.set(this.node, new WeakRef(this));
      this.refreshOrphanCheck();
    }
    /** Lazily creates the marker's event manipulator for mount and dispose lifecycle events. */
    get event() {
      this.ensureActive();
      const manipulator = new EventManipulator(this, this.node, "marker");
      Object.defineProperty(this, "event", {
        configurable: true,
        enumerable: true,
        value: manipulator,
        writable: false
      });
      return manipulator;
    }
    /** Lazily creates and memoizes an OwnerManipulator for managing explicit owners. */
    get owner() {
      this.ensureActive();
      const manipulator = new OwnerManipulator(this, () => {
        this.refreshOrphanCheck();
      });
      Object.defineProperty(this, "owner", {
        configurable: true,
        enumerable: true,
        value: manipulator,
        writable: false
      });
      return manipulator;
    }
    /** Disposes the marker and removes its comment node from the DOM. */
    remove() {
      super.dispose();
    }
    /**
     * Registers mount and optional dispose hooks tied to this marker's lifecycle events.
     * @param onMount Called when the marker mounts. May return a cleanup function.
     * @param onDispose Called after the marker disposes.
     * @returns This marker for chaining.
     */
    use(onMount, onDispose) {
      let disposeCleanup;
      this.event.owned.on.Mount(() => {
        disposeCleanup = onMount();
      });
      this.event.owned.on.Dispose(() => {
        disposeCleanup?.();
        onDispose?.();
        disposeCleanup = void 0;
        onDispose = void 0;
      });
      return this;
    }
    beforeDispose() {
      this.node.dispatchEvent(new CustomEvent("Dispose"));
      this.clearOrphanCheck();
      if (getLiveMarker(this.node) === this) {
        markers.delete(this.node);
      }
    }
    afterDispose() {
      this.node.remove();
    }
    /** @internal */
    dispatchMount() {
      if (this.mounted) {
        return;
      }
      this.mounted = true;
      this.node.dispatchEvent(new CustomEvent("Mount"));
    }
    ensureActive() {
      if (this.disposed) {
        throw new Error("Disposed markers cannot be modified.");
      }
    }
    clearOrphanCheck() {
      if (this.orphanCheckId === null) {
        return;
      }
      this.orphanCheckId.cancel();
      this.orphanCheckId = null;
    }
    /** @internal */
    refreshOrphanCheck() {
      if (this.disposed || this.isManaged()) {
        this.clearOrphanCheck();
        return;
      }
      if (this.orphanCheckId !== null) {
        return;
      }
      this.orphanCheckId = scheduleTimeoutPromise(() => {
        this.orphanCheckId = null;
        if (this.disposed) {
          return;
        }
        if (this.isManaged()) {
          this.dispatchMount();
          return;
        }
        throw new Error(orphanedMarkerErrorMessage);
      });
    }
    isManaged() {
      if (isManagedNode(this.node)) {
        return true;
      }
      return this.owner.getAll().some((owner) => isManagedOwner(owner, /* @__PURE__ */ new Set()));
    }
  };
  var Marker = function Marker2(id) {
    return new MarkerClass(id);
  };
  Marker.prototype = MarkerClass.prototype;
  Marker.extend = function extend2() {
    return MarkerClass;
  };
  Marker.builder = function builder(definition) {
    return (...args) => {
      const id = definition.id(...args);
      const marker = new MarkerClass(id);
      marker.event.owned.on.Mount(() => {
        const cleanup = definition.build(marker, ...args);
        if (cleanup) marker.event.owned.on.Dispose(() => cleanup?.());
      });
      return marker;
    };
  };

  // src/utility/Arrays.ts
  var Arrays;
  ((Arrays2) => {
    function spliceOut(array, item) {
      const index = array.indexOf(item);
      if (index === -1)
        return false;
      array.splice(index, 1);
      return true;
    }
    Arrays2.spliceOut = spliceOut;
    function spliceBy(array, by) {
      const removed = [];
      for (const item of by) {
        const index = array.indexOf(item);
        if (index !== -1) {
          array.splice(index, 1);
          removed.push(item);
        }
      }
      return removed;
    }
    Arrays2.spliceBy = spliceBy;
  })(Arrays || (Arrays = {}));
  var Arrays_default = Arrays;

  // src/component/styleValue.ts
  function isWordCharacter(character) {
    const charCode = character.charCodeAt(0);
    return charCode >= 48 && charCode <= 57 || charCode >= 65 && charCode <= 90 || charCode >= 97 && charCode <= 122 || charCode === 45 || charCode === 95;
  }
  function isWhitespaceCharacter(character) {
    const charCode = character.charCodeAt(0);
    return charCode === 32 || charCode === 9 || charCode === 10 || charCode === 13;
  }
  function toCssPropertyName(propertyName) {
    if (propertyName.startsWith("--")) {
      return propertyName;
    }
    if (propertyName.startsWith("$")) {
      propertyName = `--${propertyName.slice(1)}`;
    }
    return propertyName.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
  }
  function expandVariableAccessShorthand(styleValue) {
    if (typeof styleValue === "number") {
      return String(styleValue);
    }
    const src = styleValue;
    let i = 0;
    function peekPreviousNonWhitespaceChar() {
      for (let j = i - 1; j >= 0; j--) {
        if (!isWhitespaceCharacter(src[j])) {
          return src[j];
        }
      }
      return void 0;
    }
    function consumeChar(expected) {
      if (src[i] === expected) {
        i++;
        return true;
      }
      return false;
    }
    function consumeWord() {
      const start = i;
      for (; i < src.length; i++) {
        if (!isWordCharacter(src[i])) {
          break;
        }
      }
      return src.slice(start, i);
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
    function consumeNegativeVariableAccess() {
      const restorePoint = i;
      const previousChar = peekPreviousNonWhitespaceChar();
      if (previousChar && !"(,:*/%+-".includes(previousChar)) {
        return void 0;
      }
      if (!consumeChar("-")) {
        return void 0;
      }
      const variableAccess = consumeVariableAccess();
      if (!variableAccess) {
        i = restorePoint;
        return void 0;
      }
      return `calc(-1 * ${variableAccess})`;
    }
    function consumeStyleValue() {
      let result = "";
      do {
        if (awaitingClosingBrace && src[i] === "}") {
          awaitingClosingBrace--;
          return result;
        }
        result += consumeWhitespace() || consumeNegativeVariableAccess() || consumeVariableAccess() || src[i++];
      } while (i < src.length);
      return result;
    }
    return consumeStyleValue();
  }

  // src/component/Style.ts
  var styleRegistry = /* @__PURE__ */ new Map();
  var styleOrder = [];
  var importRules = [];
  var fontFaceRules = [];
  var animationRules = /* @__PURE__ */ new Map();
  var animationMarkerData = /* @__PURE__ */ new WeakMap();
  var resetRules = [];
  var rootRules = [];
  var styleElement = null;
  var animationMarkerOwner = new class StyleAnimationOwner extends Owner {
  }();
  function isNestedDefinition(key, value) {
    return typeof value === "object" && value !== null && key.startsWith("{");
  }
  function isAnimationMarker(value) {
    return value instanceof Marker && animationMarkerData.has(value);
  }
  function isAnimationMarkers(value) {
    return Array.isArray(value) && value.length > 0 && value.every(isAnimationMarker);
  }
  function toAnimationMarkersArray(value) {
    if (isAnimationMarker(value)) return [value];
    if (isAnimationMarkers(value)) return value;
    return null;
  }
  function serializeStylePropertyValue(propertyName, value) {
    if (propertyName === "animationName") {
      const markers2 = toAnimationMarkersArray(value);
      if (markers2) return markers2.map((marker) => animationMarkerData.get(marker).name).join(", ");
    }
    return String(expandVariableAccessShorthand(value));
  }
  function serializeDeclarationBody(definition) {
    return Object.entries(definition).filter((entry) => entry[1] !== void 0 && entry[1] !== null && !isNestedDefinition(entry[0], entry[1])).map(([propertyName, value]) => `${toCssPropertyName(propertyName)}: ${serializeStylePropertyValue(propertyName, value)}`).join("; ");
  }
  function serializeKeyframesRule(name, definition) {
    const keyframes = Object.entries(definition).filter((entry) => entry[1] !== void 0 && entry[1] !== null).map(([keyframeName, keyframeDefinition]) => `${keyframeName} { ${serializeDeclarationBody(keyframeDefinition)} }`).join("\n");
    return `@keyframes ${name} {
${keyframes}
}`;
  }
  function ensureAnimationMarkerMounted(marker) {
    if (typeof document === "undefined") {
      return;
    }
    const data = animationMarkerData.get(marker);
    if (!animationRules.has(data.name)) {
      animationRules.set(data.name, serializeKeyframesRule(data.name, data.keyframes));
    }
    if (marker.node.isConnected) {
      return;
    }
    marker.appendTo(document.head ?? document.documentElement);
  }
  function autoMountAnimationMarkers(definition) {
    for (const [key, value] of Object.entries(definition)) {
      if (value === void 0 || value === null) {
        continue;
      }
      if (isNestedDefinition(key, value)) {
        autoMountAnimationMarkers(value);
        continue;
      }
      if (key === "animationName") {
        const markers2 = toAnimationMarkersArray(value);
        if (markers2) {
          for (const marker of markers2) {
            ensureAnimationMarkerMounted(marker);
          }
        }
      }
    }
  }
  function serializeRules(selector, definition) {
    autoMountAnimationMarkers(definition);
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
      const body = ownProperties.map(([propertyName, value]) => `${toCssPropertyName(propertyName)}: ${serializeStylePropertyValue(propertyName, value)}`).join("; ");
      rules.unshift(`${selector} { ${body} }`);
    }
    return rules;
  }
  function serializeDefinition(className, definition) {
    return serializeRules(`.${className}`, definition).join("\n");
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
    if (importRules.length > 0)
      parts.push(importRules.join("\n"));
    if (resetRules.length > 0)
      parts.push(resetRules.join("\n"));
    if (fontFaceRules.length > 0)
      parts.push(fontFaceRules.join("\n"));
    if (animationRules.size > 0)
      parts.push([...animationRules.values()].join("\n"));
    if (rootRules.length > 0)
      parts.push(rootRules.join("\n"));
    for (const style of styleOrder)
      parts.push(style.cssText);
    styleElement2.textContent = parts.join("\n");
    if (parts.length > 0)
      styleElement2.append(document.createTextNode("\n"));
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
  var markerIdCounter = 0;
  var animationIdCounter = 0;
  var styleAnimationBuilder = Marker.builder({
    id(definition) {
      return `kitsui:style-animation-${definition.name}`;
    },
    build(marker, definition) {
      const rule = serializeKeyframesRule(definition.name, definition.keyframes);
      animationRules.set(definition.name, rule);
      renderStyleSheet();
      return () => {
        animationRules.delete(definition.name);
        renderStyleSheet();
      };
    }
  });
  function StyleAnimation(name, keyframes) {
    const suffixedName = `${name}-${++animationIdCounter}`;
    const marker = styleAnimationBuilder({ keyframes, name: suffixedName });
    animationMarkerData.set(marker, { keyframes, name: suffixedName });
    marker.owner.add(animationMarkerOwner);
    Object.defineProperty(marker, "name", {
      configurable: true,
      enumerable: true,
      get: () => suffixedName
    });
    return marker;
  }
  var StyleReset = Marker.builder({
    id(definition) {
      return `kitsui:style-reset-${markerIdCounter++}`;
    },
    build(marker, definition) {
      const rules = serializeRules("*", definition);
      resetRules.push(...rules);
      renderStyleSheet();
      return () => {
        Arrays_default.spliceBy(resetRules, rules);
        renderStyleSheet();
      };
    }
  });
  var StyleRoot = Marker.builder({
    id(definition) {
      return `kitsui:style-root-${markerIdCounter++}`;
    },
    build(marker, definition) {
      const rules = serializeRules(":root", definition);
      rootRules.push(...rules);
      renderStyleSheet();
      return () => {
        Arrays_default.spliceBy(rootRules, rules);
        renderStyleSheet();
      };
    }
  });
  var StyleSelector = Marker.builder({
    id(definition) {
      return `kitsui:style-selector-${markerIdCounter++}`;
    },
    build(marker, selector, definition) {
      const rules = serializeRules(selector, definition);
      rootRules.push(...rules);
      renderStyleSheet();
      return () => {
        Arrays_default.spliceBy(rootRules, rules);
        renderStyleSheet();
      };
    }
  });
  var StyleImport = Marker.builder({
    id(url) {
      return `kitsui:style-import-${markerIdCounter++}`;
    },
    build(marker, url) {
      const rule = `@import url("${url}");`;
      importRules.push(rule);
      renderStyleSheet();
      return () => {
        Arrays_default.spliceOut(importRules, rule);
        renderStyleSheet();
      };
    }
  });
  var StyleFontFace = Marker.builder({
    id(definition) {
      return `kitsui:font-face-${markerIdCounter++}`;
    },
    build(marker, definition) {
      const properties = Object.entries(definition).filter((entry) => entry[1] !== void 0 && entry[1] !== null).map(([propertyName, value]) => `${toCssPropertyName(propertyName)}: ${String(expandVariableAccessShorthand(value))}`).join("; ");
      const rule = `@font-face { ${properties} }`;
      fontFaceRules.push(rule);
      renderStyleSheet();
      return () => {
        Arrays_default.spliceOut(fontFaceRules, rule);
        renderStyleSheet();
      };
    }
  });
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
  var whenDisabled = state("disabled");
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
  var noop6 = () => {
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
        return noop6;
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
        return noop6;
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
            apply: noop6,
            cleanup: noop6
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
      }) ?? noop6;
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

  // src/component/StyleManipulator.ts
  var noop7 = () => {
  };
  function isStateSource2(value) {
    return value instanceof State;
  }
  function toStyleAttributeSource(value) {
    if (isStateSource2(value)) {
      return value;
    }
    return State.Readonly(value === void 0 ? null : value);
  }
  function toStyleValueSource(value) {
    if (isStateSource2(value)) {
      return value;
    }
    return State.Readonly(value === void 0 ? null : value);
  }
  function serializeStyleValue(value) {
    if (value === null || value === void 0) {
      return null;
    }
    return expandVariableAccessShorthand(value);
  }
  var StyleManipulator = class {
    /**
     * @param owner The component owner managing this manipulator's lifecycle.
     * @param element The element whose inline styles are controlled.
     */
    constructor(owner, element) {
      this.owner = owner;
      this.element = element;
      __publicField(this, "determiner", null);
    }
    /**
     * Sets inline styles from a direct definition or a subscribable definition source.
     * Each property can also be driven by its own subscribable value.
     * Nullish property values remove that property from the inline style attribute.
     * @param value Direct or reactive inline style definition.
     * @returns The owning component for fluent chaining.
     */
    set(value) {
      this.ensureActive();
      const definitionSource = toStyleAttributeSource(value);
      this.replaceDeterminer((applyIfCurrent) => {
        let releaseDefinition = noop7;
        const applyDefinition = (definition) => {
          releaseDefinition();
          releaseDefinition = this.installDefinition(definition, applyIfCurrent);
        };
        applyDefinition(definitionSource.value);
        const releaseSource = definitionSource.subscribe(this.owner, (nextValue) => {
          applyDefinition(nextValue);
        });
        return () => {
          releaseSource();
          releaseDefinition();
        };
      });
      return this.owner;
    }
    installDefinition(definition, applyIfCurrent) {
      if (!definition) {
        return noop7;
      }
      const cleanups = [];
      const activeProperties = /* @__PURE__ */ new Set();
      for (const [propertyName, input] of Object.entries(definition)) {
        activeProperties.add(propertyName);
        const valueSource = toStyleValueSource(input);
        applyIfCurrent(propertyName, valueSource.value);
        cleanups.push(valueSource.subscribe(this.owner, (nextValue) => {
          applyIfCurrent(propertyName, nextValue);
        }));
      }
      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
        for (const propertyName of activeProperties) {
          this.writeProperty(propertyName, null);
        }
      };
    }
    replaceDeterminer(createCleanup) {
      this.determiner?.cleanup();
      const token = /* @__PURE__ */ Symbol("style");
      let active = true;
      let cleanup = noop7;
      const applyIfCurrent = (propertyName, value) => {
        if (this.determiner?.token !== token) {
          return;
        }
        this.writeProperty(propertyName, value);
      };
      const trackedCleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        if (this.determiner?.token === token) {
          this.determiner = null;
        }
        cleanup();
      };
      this.determiner = { cleanup: trackedCleanup, token };
      cleanup = createCleanup(applyIfCurrent);
    }
    writeProperty(propertyName, value) {
      const cssPropertyName = toCssPropertyName(propertyName);
      const serialized = serializeStyleValue(value);
      if (serialized === null) {
        this.element.style.removeProperty(cssPropertyName);
        return;
      }
      this.element.style.setProperty(cssPropertyName, serialized);
    }
    ensureActive() {
      if (this.owner.disposed) {
        throw new Error("Disposed components cannot be modified.");
      }
    }
  };

  // src/component/GenericPropertyManipulator.ts
  var noop8 = () => {
  };
  var GenericPropertyManipulator = class {
    constructor(owner) {
      this.owner = owner;
      __publicField(this, "determiner", null);
    }
    /**
     * Sets the property from a direct value or subscribable source.
     * @param value Direct or reactive property input.
     * @returns The owning component for fluent chaining.
     */
    set(value) {
      this.ensureActive();
      const source = this.toSource(value);
      this.replaceDeterminer((applyIfCurrent) => {
        applyIfCurrent(source.value);
        return source.subscribe(this.owner, (nextValue) => {
          applyIfCurrent(nextValue);
        });
      });
      return this.owner;
    }
    /**
     * Applies the property while visible and clears it while hidden.
     * @param visible Boolean source controlling whether the property is shown.
     * @param value Direct or reactive property input.
     * @returns The owning component for fluent chaining.
     */
    bind(visible, value) {
      this.ensureActive();
      const source = this.toSource(value);
      this.replaceDeterminer((applyIfCurrent) => {
        const sync = () => {
          applyIfCurrent(visible.value ? source.value : void 0);
        };
        const releaseVisibility = visible.subscribe(this.owner, sync);
        const releaseValue = source.subscribe(this.owner, sync);
        sync();
        return () => {
          releaseVisibility();
          releaseValue();
        };
      });
      return this.owner;
    }
    replaceDeterminer(createCleanup) {
      this.determiner?.cleanup();
      const token = /* @__PURE__ */ Symbol("property");
      let active = true;
      let cleanup = noop8;
      const applyIfCurrent = (value) => {
        if (this.determiner?.token !== token) {
          return;
        }
        this.writeProperty(value);
      };
      const trackedCleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        if (this.determiner?.token === token) {
          this.determiner = null;
          this.writeProperty(void 0);
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

  // src/component/TextManipulator.ts
  function isTextSource(value) {
    return value instanceof State;
  }
  var TextManipulator = class extends GenericPropertyManipulator {
    /**
     * Sets the element's text content from a direct value or subscribable source.
     * Nullish values clear the text content.
     * @param value Direct or reactive text input.
     * @returns The owning component for fluent chaining.
     */
    set(value) {
      return super.set(value);
    }
    /**
     * Shows or clears text content based on a boolean source.
     * When visible, the latest text value is applied; when hidden, the text content is cleared.
     * @param visible Boolean source controlling whether text is shown.
     * @param value Direct or reactive text input.
     * @returns The owning component for fluent chaining.
     */
    bind(visible, value) {
      return super.bind(visible, value);
    }
    toSource(value) {
      if (isTextSource(value)) {
        return value;
      }
      return State.Readonly(value ?? null);
    }
    writeProperty(value) {
      const text = String(value ?? "");
      this.owner.clear();
      this.owner.element.textContent = text;
    }
  };

  // src/component/ComponentComposition.ts
  var componentBuilders = /* @__PURE__ */ new WeakMap();
  function markComponentBuilder(component, builder2) {
    let builders = componentBuilders.get(component);
    if (!builders) {
      builders = /* @__PURE__ */ new Set();
      componentBuilders.set(component, builders);
    }
    builders.add(builder2);
  }
  function hasComponentBuilder(component, builder2) {
    return componentBuilders.get(component)?.has(builder2) ?? false;
  }

  // src/component/Component.ts
  var noop9 = () => {
  };
  var orphanedComponentErrorMessage = "Components must be connected to the document or have a managed owner before the next tick.";
  var recursiveTreeErrorMessage = "Cannot move a node into itself or one of its descendants.";
  var elementComponents = /* @__PURE__ */ new WeakMap();
  var componentOwnerResolvers = /* @__PURE__ */ new Set();
  var hiddenManagedOwners = /* @__PURE__ */ new WeakMap();
  var componentAccessorInstalled = false;
  function isMoveParent(value) {
    return value !== null && typeof value.insertBefore === "function";
  }
  function wouldCreateRecursiveTree(parent, node) {
    return node === parent || node.contains(parent);
  }
  function moveNode(parent, node, beforeNode) {
    if (wouldCreateRecursiveTree(parent, node)) {
      console.error(recursiveTreeErrorMessage);
      return false;
    }
    try {
      if (typeof parent.moveBefore === "function" && parent.isConnected && node.isConnected) {
        parent.moveBefore(node, beforeNode);
        return true;
      }
      parent.insertBefore(node, beforeNode);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "HierarchyRequestError") {
        console.error(recursiveTreeErrorMessage);
        return false;
      }
      throw error;
    }
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
  function getWrappedNodeOwner2(node) {
    const maybeMarker = node.marker;
    if (maybeMarker) {
      return maybeMarker;
    }
    const maybeComponent = node.component;
    return maybeComponent ?? null;
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
    if (typeof value !== "object" || value === null) {
      return false;
    }
    if (value instanceof Node || value instanceof ComponentClass) {
      return false;
    }
    const maybeSelectionState = value;
    return "value" in maybeSelectionState && typeof maybeSelectionState.subscribe === "function";
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
  function ownerResolvesForComponent(owner) {
    if (!owner || owner.disposed) {
      return false;
    }
    if (owner instanceof ComponentClass) {
      return owner["isManaged"]();
    }
    return true;
  }
  function componentHasExternalManager(component, ignoredOwner) {
    if (component.owner.getAll().some((owner) => owner !== ignoredOwner && ownerResolvesForComponent(owner))) {
      return true;
    }
    const hiddenManagedOwner = hiddenManagedOwners.get(component) ?? null;
    if (hiddenManagedOwner !== ignoredOwner && ownerResolvesForComponent(hiddenManagedOwner)) {
      return true;
    }
    let current = component.element.parentNode;
    while (current) {
      const wrappedOwner = getWrappedNodeOwner2(current);
      if (wrappedOwner !== ignoredOwner && ownerResolvesForComponent(wrappedOwner)) {
        return true;
      }
      current = current.parentNode;
    }
    for (const resolver of componentOwnerResolvers) {
      const resolvedOwner = resolver(component);
      if (resolvedOwner !== ignoredOwner && ownerResolvesForComponent(resolvedOwner)) {
        return true;
      }
    }
    return false;
  }
  function retainManagedComponent(component, action) {
    if (action !== "detach") {
      return;
    }
    component.element.parentNode?.removeChild(component.element);
    component["refreshOrphanCheck"]();
  }
  function disposeManagedNode(node, options = {}) {
    if (node instanceof HTMLElement) {
      const component = getLiveComponent(node);
      if (component && !component.disposed) {
        if (options.ignoredOwner && componentHasExternalManager(component, options.ignoredOwner)) {
          retainManagedComponent(component, options.retainedComponentAction ?? "leave");
          return;
        }
        component.remove();
        return;
      }
    }
    for (const childNode of Array.from(node.childNodes)) {
      disposeManagedNode(childNode, options);
    }
  }
  var ComponentClass = class _ComponentClass extends Owner {
    constructor(tagNameOrElement) {
      super();
      /**
       * The underlying DOM element managed by this component.
       */
      __publicField(this, "element");
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
     * Lazily creates and memoizes a StyleManipulator for managing inline styles.
     */
    get style() {
      this.ensureActive();
      const manipulator = new StyleManipulator(this, this.element);
      Object.defineProperty(this, "style", {
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
     * Lazily creates and memoizes an OwnerManipulator for managing explicit owners.
     */
    get owner() {
      this.ensureActive();
      const manipulator = new OwnerManipulator(this, () => {
        this.refreshOrphanCheck();
      });
      Object.defineProperty(this, "owner", {
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
      const manipulator = new TextManipulator(this);
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
        const moved = moveNode(this.element, this.resolveNode(child), null);
        if (moved && child instanceof _ComponentClass) {
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
        const moved = moveNode(this.element, this.resolveNode(child), referenceNode);
        if (moved && child instanceof _ComponentClass) {
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
        const moved = moveNode(parentNode, this.resolveNode(node), where === "before" ? this.element : this.element.nextSibling);
        if (moved && node instanceof _ComponentClass) {
          node.refreshOrphanCheck();
          node.dispatchMount();
        }
      }
      return this;
    }
    /**
     * Appends children conditionally based on state.
     * When the state becomes true, children are inserted. When false, they are parked in storage and placeholders remain in-flow.
     * @param state - A State<boolean> that controls visibility.
     * @param nodes - Nodes or iterables of nodes to append conditionally.
     * @returns This component for chaining.
     */
    appendWhen(state2, ...nodes) {
      this.ensureActive();
      for (const node of this.expandChildren(nodes)) {
        if (isComponentSelectionState(node)) {
          this.attachConditionalSelectionState(state2, node, {
            getContainer: () => this.element,
            getReferenceNode: () => null
          });
          continue;
        }
        this.attachConditionalNode(state2, node, {
          getContainer: () => this.element,
          getReferenceNode: () => null
        });
      }
      return this;
    }
    /**
     * Prepends children conditionally based on state.
     * When the state becomes true, children are inserted before the current first child.
     * @param state - A State<boolean> that controls visibility.
     * @param nodes - Nodes or iterables of nodes to prepend conditionally.
     * @returns This component for chaining.
     */
    prependWhen(state2, ...nodes) {
      this.ensureActive();
      const referenceNode = this.element.firstChild;
      for (const node of this.expandChildren(nodes)) {
        if (isComponentSelectionState(node)) {
          this.attachConditionalSelectionState(state2, node, {
            getContainer: () => this.element,
            getReferenceNode: () => referenceNode
          });
          continue;
        }
        this.attachConditionalNode(state2, node, {
          getContainer: () => this.element,
          getReferenceNode: () => referenceNode
        });
      }
      return this;
    }
    /**
     * Inserts children conditionally before or after this component, based on state.
     * When the state becomes true, children are inserted. When false, they're stored but stay in the DOM as a placeholder.
     * @param state - A State<boolean> that controls visibility.
     * @param where - "before" to insert before this component, or "after" to insert after.
     * @param nodes - Nodes or iterables of nodes to insert conditionally.
     * @returns This component for chaining.
     */
    insertWhen(state2, where, ...nodes) {
      this.ensureActive();
      const insertables = this.expandChildren(nodes);
      const orderedInsertables = where === "before" ? insertables : [...insertables].reverse();
      for (const node of orderedInsertables) {
        if (isComponentSelectionState(node)) {
          this.attachConditionalSelectionState(state2, node, {
            getContainer: () => this.element.parentNode,
            getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling
          });
          continue;
        }
        this.attachConditionalNode(state2, node, {
          getContainer: () => this.element.parentNode,
          getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling
        });
      }
      return this;
    }
    attachConditionalSelectionState(visibleState, selectionState, options) {
      const marker = Marker("kitsui:conditional-stateful").owner.add(this);
      const storage = createStorageElement(this.element.ownerDocument);
      let active = true;
      let markerWasInserted = false;
      let renderedComponents = [];
      const retainedHiddenComponents = /* @__PURE__ */ new Set();
      const cleanupRenderedComponents = (nextComponents = /* @__PURE__ */ new Set(), mode = "dispose") => {
        for (const component of renderedComponents) {
          if (nextComponents.has(component)) {
            retainedHiddenComponents.delete(component);
            continue;
          }
          if (mode === "dispose") {
            retainedHiddenComponents.delete(component);
            component.remove();
            continue;
          }
          retainedHiddenComponents.add(component);
        }
        renderedComponents = renderedComponents.filter((component) => nextComponents.has(component));
      };
      const releaseRetainedHiddenComponents = (nextComponents) => {
        for (const component of [...retainedHiddenComponents]) {
          if (nextComponents.has(component)) {
            continue;
          }
          retainedHiddenComponents.delete(component);
          component.element.parentNode?.removeChild(component.element);
          component.refreshOrphanCheck();
        }
      };
      const render = () => {
        if (!active) {
          return;
        }
        const nextComponents = this.resolveComponentSelection(selectionState.value);
        const nextComponentSet = new Set(nextComponents);
        const container = options.getContainer();
        if (!isMoveParent(container)) {
          if (markerWasInserted) {
            this.remove();
            return;
          }
          cleanupRenderedComponents(nextComponentSet, visibleState.value ? "dispose" : "retain");
          if (visibleState.value) {
            releaseRetainedHiddenComponents(nextComponentSet);
          }
          for (const component of nextComponents) {
            retainedHiddenComponents.delete(component);
            component.ensureActive();
            component.onBeforeMove?.();
            moveNode(storage, component.element, null);
          }
          renderedComponents = nextComponents;
          return;
        }
        if (markerWasInserted && marker.node.parentNode !== container) {
          this.remove();
          return;
        }
        if (marker.node.parentNode !== container) {
          moveNode(container, marker.node, options.getReferenceNode());
          markerWasInserted = true;
        }
        cleanupRenderedComponents(nextComponentSet, visibleState.value ? "dispose" : "retain");
        if (visibleState.value) {
          releaseRetainedHiddenComponents(nextComponentSet);
          for (const component of nextComponents) {
            retainedHiddenComponents.delete(component);
            component.ensureActive();
            component.onBeforeMove?.();
            const moved = moveNode(container, component.element, marker.node);
            if (moved) {
              component.refreshOrphanCheck();
              component.dispatchMount();
            }
          }
        } else {
          for (const component of nextComponents) {
            retainedHiddenComponents.delete(component);
            component.ensureActive();
            component.onBeforeMove?.();
            moveNode(storage, component.element, null);
          }
        }
        renderedComponents = nextComponents;
      };
      const cleanup = this.trackStructuralCleanup(() => {
        active = false;
        releaseVisibleSubscription();
        releaseSelectionSubscription();
        cleanupRenderedComponents();
        for (const component of retainedHiddenComponents) {
          component.remove();
        }
        retainedHiddenComponents.clear();
        marker.remove();
        storage.remove();
      });
      const releaseVisibleSubscription = visibleState.subscribe(this, render);
      const releaseSelectionSubscription = selectionState.subscribe(this, render);
      render();
      return cleanup;
    }
    /**
     * Clears all child nodes from this component.
     * @returns This component for chaining.
     */
    clear() {
      this.ensureActive();
      this.releaseStructuralCleanups();
      for (const childNode of Array.from(this.element.childNodes)) {
        disposeManagedNode(childNode, {
          ignoredOwner: this,
          retainedComponentAction: "detach"
        });
      }
      this.element.replaceChildren();
      return this;
    }
    use(setupOrState, ...params) {
      this.ensureActive();
      if (typeof setupOrState === "function") {
        setupOrState(this, ...params);
        return this;
      }
      const render = params[0];
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
     * Assigns instance-specific members onto this component and returns the same narrowed component.
     * The extension factory receives this component typed as the final intersection.
     * @param extensions Builds the object members to assign onto this component.
     * @returns This component narrowed with the assigned extension members.
     */
    extend(extensions) {
      this.ensureActive();
      if (typeof extensions !== "function") {
        throw new TypeError("Component.extend requires an extension factory function.");
      }
      const extensionMembers = extensions(this);
      if (typeof extensionMembers !== "object" || extensionMembers === null) {
        throw new TypeError("Component.extend extension factories must return an object.");
      }
      return Object.assign(this, extensionMembers);
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
    beforeDispose() {
      this.element.dispatchEvent(new CustomEvent("Dispose"));
      this.clearOrphanCheck();
      this.releaseStructuralCleanups();
      if (getLiveComponent(this.element) === this) {
        elementComponents.delete(this.element);
      }
    }
    afterDispose() {
      this.element.remove();
      const disposeImplicitChildren = (node) => {
        disposeManagedNode(node, {
          ignoredOwner: this,
          retainedComponentAction: "leave"
        });
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
      this.orphanCheckId.cancel();
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
      this.orphanCheckId = scheduleTimeoutPromise(() => {
        this.orphanCheckId = null;
        if (this.disposed) {
          return;
        }
        if (this.isManaged()) {
          this.dispatchMount();
          return;
        }
        throw new Error(orphanedComponentErrorMessage);
      });
    }
    disposeIfUnmanagedAfterPlacementCleanup() {
      if (this.disposed || this.isManaged()) {
        this.clearOrphanCheck();
        return;
      }
      this.clearOrphanCheck();
      this.orphanCheckId = scheduleTimeoutPromise(() => {
        this.orphanCheckId = null;
        if (this.disposed) {
          return;
        }
        if (this.isManaged()) {
          this.dispatchMount();
          return;
        }
        this.remove();
      });
    }
    isManaged() {
      if (this.element.isConnected) {
        return true;
      }
      if (this.owner.getAll().some((owner) => this.ownerResolves(owner))) {
        return true;
      }
      if (this.ownerResolves(hiddenManagedOwners.get(this) ?? null)) {
        return true;
      }
      let current = this.element.parentNode;
      while (current) {
        if (this.ownerResolves(getWrappedNodeOwner2(current))) {
          return true;
        }
        current = current.parentNode;
      }
      for (const resolver of componentOwnerResolvers) {
        if (this.ownerResolves(resolver(this))) {
          return true;
        }
      }
      return false;
    }
    ownerResolves(owner) {
      return ownerResolvesForComponent(owner);
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
      let releaseOwnerCleanup = noop9;
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
        return noop9;
      }
      const resolvedNode = this.resolveNode(node);
      const placeholder = Marker("kitsui:conditional").owner.add(this);
      const storage = createStorageElement(this.element.ownerDocument);
      const childComponent = node instanceof _ComponentClass ? node : null;
      let active = true;
      let releaseChildCleanup = noop9;
      let placeholderWasInserted = false;
      const setHiddenManagedOwner = (owner) => {
        if (!childComponent || childComponent.owner.get() !== null) {
          return;
        }
        if (owner) {
          hiddenManagedOwners.set(childComponent, owner);
        } else {
          hiddenManagedOwners.delete(childComponent);
        }
        childComponent.refreshOrphanCheck();
      };
      const getSafeReferenceNode = (container) => {
        const referenceNode = options.getReferenceNode();
        if (!referenceNode) {
          return null;
        }
        return referenceNode.parentNode === container ? referenceNode : null;
      };
      const removeOwnerForMissingMarker = () => {
        if (!active) {
          return;
        }
        this.remove();
      };
      const ensurePlaceholder = () => {
        const container = options.getContainer();
        if (!isMoveParent(container)) {
          if (placeholderWasInserted) {
            removeOwnerForMissingMarker();
          }
          return null;
        }
        if (!placeholderWasInserted) {
          moveNode(container, placeholder.node, getSafeReferenceNode(container));
          placeholderWasInserted = true;
          return container;
        }
        if (placeholder.node.parentNode !== container) {
          removeOwnerForMissingMarker();
          return null;
        }
        return container;
      };
      const placeVisible = () => {
        if (!active) {
          return;
        }
        const initialContainer = options.getContainer();
        if (isMoveParent(initialContainer) && wouldCreateRecursiveTree(initialContainer, resolvedNode)) {
          console.error(recursiveTreeErrorMessage);
          return;
        }
        const container = ensurePlaceholder();
        if (!active) {
          return;
        }
        if (!container) {
          setHiddenManagedOwner(this);
          moveNode(storage, resolvedNode, null);
          return;
        }
        setHiddenManagedOwner(null);
        const moved = moveNode(container, resolvedNode, placeholder.node);
        if (moved) {
          childComponent?.refreshOrphanCheck();
          childComponent?.dispatchMount();
        }
      };
      const placeHidden = () => {
        if (!active) {
          return;
        }
        const initialContainer = options.getContainer();
        if (isMoveParent(initialContainer) && wouldCreateRecursiveTree(initialContainer, resolvedNode)) {
          console.error(recursiveTreeErrorMessage);
          return;
        }
        const container = ensurePlaceholder();
        if (!active) {
          return;
        }
        if (!container) {
          setHiddenManagedOwner(this);
          if (resolvedNode.parentNode !== storage) {
            moveNode(storage, resolvedNode, null);
          }
          return;
        }
        if (resolvedNode.parentNode !== storage) {
          setHiddenManagedOwner(this);
          moveNode(storage, resolvedNode, null);
        }
      };
      const cleanup = this.trackStructuralCleanup(() => {
        active = false;
        stateCleanup();
        releaseChildCleanup();
        setHiddenManagedOwner(null);
        placeholder.remove();
        storage.remove();
        if (childComponent) {
          const explicitOwners = childComponent.owner.getAll();
          if (explicitOwners.some((owner) => owner !== this)) {
            childComponent.element.parentNode?.removeChild(childComponent.element);
            childComponent.refreshOrphanCheck();
            return;
          }
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
      const marker = Marker("kitsui:stateful-child").owner.add(this);
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
        if (markerWasInserted && marker.node.parentNode !== container) {
          this.remove();
          return;
        }
        if (marker.node.parentNode !== container) {
          moveNode(container, marker.node, options.getReferenceNode());
          markerWasInserted = true;
        }
        cleanupRenderedComponents(nextComponentSet);
        for (const component of nextComponents) {
          component.ensureActive();
          component.onBeforeMove?.();
          const moved = moveNode(container, component.element, marker.node);
          if (moved) {
            component.refreshOrphanCheck();
            component.dispatchMount();
          }
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
  var Component = function Component2(tagNameOrElement = "span", builder2) {
    if (tagNameOrElement instanceof ComponentClass) {
      if (builder2) {
        markComponentBuilder(tagNameOrElement, builder2);
      }
      return tagNameOrElement;
    }
    const component = new ComponentClass(tagNameOrElement);
    if (builder2) {
      markComponentBuilder(component, builder2);
    }
    return component;
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
  Component.extend = function extend3() {
    return ComponentClass;
  };

  // src/component/extensions/breakdownExtension.ts
  var noop10 = () => {
  };
  var createOwnedState = State;
  var componentClass = null;
  var patched = false;
  function getComponentClass() {
    componentClass ?? (componentClass = Component.extend());
    return componentClass;
  }
  function isStateLike(value) {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const maybeState = value;
    return "value" in maybeState && typeof maybeState.subscribe === "function";
  }
  function isBreakdownKey(value) {
    return typeof value === "string" || typeof value === "number" || typeof value === "symbol";
  }
  function validateCreatedPartComponent(component) {
    if (!(component instanceof getComponentClass())) {
      throw new TypeError("Component.Breakdown part builders must return a Component.");
    }
    if (component.owner.get() !== null) {
      throw new Error("Component.Breakdown part builders must return an ownerless Component.");
    }
    if (component.element.parentNode !== null) {
      throw new Error("Component.Breakdown part builders must return an unplaced Component.");
    }
    return component;
  }
  function ensureActive(component) {
    if (component.disposed) {
      throw new Error("Disposed components cannot be modified.");
    }
  }
  function breakdownExtension() {
    if (patched) {
      return;
    }
    patched = true;
    const ComponentWithBreakdown = Component;
    const Breakdown = function Breakdown2(owner, state2, breakdown) {
      if (!(owner instanceof Owner)) {
        throw new TypeError("Component.Breakdown requires an Owner as the first argument.");
      }
      if (!isStateLike(state2)) {
        throw new TypeError("Component.Breakdown requires a State as the second argument.");
      }
      if (typeof breakdown !== "function") {
        throw new TypeError("Component.Breakdown requires a breakdown function as the third argument.");
      }
      const parts = /* @__PURE__ */ new Map();
      let active = true;
      let latestValue = state2.value;
      let rendering = false;
      let rerenderQueued = false;
      let releaseOwnerCleanup = noop10;
      let releaseStateSubscription = noop10;
      const removePart = (key, record = parts.get(key)) => {
        if (!record || parts.get(key) !== record) {
          return;
        }
        parts.delete(key);
        record.state?.dispose();
        record.component.remove();
      };
      const cleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        releaseOwnerCleanup();
        releaseStateSubscription();
        for (const [key, record] of [...parts]) {
          removePart(key, record);
        }
      };
      const render = () => {
        if (!active) {
          return;
        }
        if (rendering) {
          rerenderQueued = true;
          return;
        }
        rendering = true;
        try {
          do {
            rerenderQueued = false;
            const currentValue = latestValue;
            const seenKeys = /* @__PURE__ */ new Set();
            const Part = (key, valueOrBuild, maybeBuild) => {
              if (!isBreakdownKey(key)) {
                throw new TypeError("Component.Breakdown part keys must be strings, numbers, or symbols.");
              }
              const isStateless = maybeBuild === void 0;
              const build = isStateless ? valueOrBuild : maybeBuild;
              if (typeof build !== "function") {
                throw new TypeError("Component.Breakdown parts require a builder function.");
              }
              seenKeys.add(key);
              const existing = parts.get(key);
              if (existing) {
                if (!isStateless) {
                  existing.state?.set(valueOrBuild);
                }
                return existing.component;
              }
              let component;
              let partState;
              try {
                if (isStateless) {
                  component = validateCreatedPartComponent(build());
                } else {
                  partState = createOwnedState(owner, valueOrBuild);
                  component = validateCreatedPartComponent(build(partState));
                }
              } catch (error) {
                partState?.dispose();
                throw error;
              }
              component.owner.add(owner);
              const record = {
                component,
                state: partState
              };
              parts.set(key, record);
              const releaseComponentCleanup = component.onCleanup(() => {
                if (parts.get(key) !== record) {
                  return;
                }
                parts.delete(key);
                partState?.dispose();
              });
              partState?.onCleanup(() => {
                releaseComponentCleanup();
              });
              return component;
            };
            breakdown(Part, currentValue);
            for (const [key, record] of [...parts]) {
              if (seenKeys.has(key)) {
                continue;
              }
              removePart(key, record);
            }
          } while (active && rerenderQueued);
        } finally {
          rendering = false;
        }
      };
      releaseOwnerCleanup = owner.onCleanup(cleanup);
      releaseStateSubscription = state2.subscribe(owner, (value) => {
        latestValue = value;
        render();
      });
      render();
      return cleanup;
    };
    ComponentWithBreakdown.Breakdown = Breakdown;
    const prototype = getComponentClass().prototype;
    prototype.breakdown = function breakdown(state2, breakdown) {
      ensureActive(this);
      Breakdown(this, state2, (Part, value) => {
        breakdown(this, Part, value);
      });
      return this;
    };
  }

  // src/component/extensions/compositionExtension.ts
  var patched2 = false;
  function isComponent(value) {
    return value instanceof Component.extend();
  }
  function ensureActive2(component) {
    if (component.disposed) {
      throw new Error("Disposed components cannot be modified.");
    }
  }
  function compositionExtension() {
    if (patched2) {
      return;
    }
    patched2 = true;
    const ComponentClass2 = Component.extend();
    const prototype = ComponentClass2.prototype;
    prototype.and = function and(builder2, ...params) {
      ensureActive2(this);
      if (typeof builder2 !== "function") {
        throw new TypeError("Component.and requires a builder function.");
      }
      if (hasComponentBuilder(this, builder2)) {
        return this;
      }
      const result = builder2.call(this, ...params);
      if (!isComponent(result)) {
        throw new TypeError("Component builders must return a Component.");
      }
      if (result !== this) {
        throw new Error("Component.and builders must return the component they were called on.");
      }
      markComponentBuilder(this, builder2);
      return this;
    };
    prototype.is = function is(builder2) {
      return typeof builder2 === "function" && hasComponentBuilder(this, builder2);
    };
    prototype.as = function as(builder2) {
      return this.is(builder2) ? this : void 0;
    };
  }

  // src/component/extensions/placeExtension.ts
  var noop11 = () => {
  };
  var PlacementLifecycleOwner = class extends Owner {
    // Uses Owner's default lifecycle hooks.
  };
  var placementControllers = /* @__PURE__ */ new WeakMap();
  var placementOwners = /* @__PURE__ */ new WeakMap();
  var placementLifecycleOwners = /* @__PURE__ */ new WeakMap();
  var recursiveTreeErrorMessage2 = "Cannot move a node into itself or one of its descendants.";
  var componentClass2 = null;
  var patched3 = false;
  function getComponentClass2() {
    componentClass2 ?? (componentClass2 = Component.extend());
    return componentClass2;
  }
  function isMoveParent2(value) {
    return value !== null && typeof value.insertBefore === "function";
  }
  function wouldCreateRecursiveTree2(parent, node) {
    return node === parent || node.contains(parent);
  }
  function moveNode2(parent, node, beforeNode) {
    if (wouldCreateRecursiveTree2(parent, node)) {
      console.error(recursiveTreeErrorMessage2);
      return false;
    }
    try {
      if (typeof parent.moveBefore === "function" && parent.isConnected && node.isConnected) {
        parent.moveBefore(node, beforeNode);
        return true;
      }
      parent.insertBefore(node, beforeNode);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "HierarchyRequestError") {
        console.error(recursiveTreeErrorMessage2);
        return false;
      }
      throw error;
    }
  }
  function createStorageElement2(documentRef) {
    return documentRef.createElement("kitsui-storage");
  }
  function ensureActive3(component) {
    if (component.disposed) {
      throw new Error("Disposed components cannot be modified.");
    }
  }
  function isComponent2(value) {
    return value instanceof getComponentClass2();
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
    let releaseDisposeCleanup = noop11;
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
      this.marker.appendTo(target);
      return this;
    }
    /**
     * Moves this placement marker to the start of the target component or DOM parent.
     * @param target The target component or DOM parent.
     * @returns This place for chaining.
     */
    prependTo(target) {
      this.marker.prependTo(target);
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
      this.marker.insertTo(where, target);
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
    if (isComponent2(target)) {
      return target.element;
    }
    if (target instanceof Marker) {
      return target.node;
    }
    if (target instanceof PlaceClass) {
      return target.marker.node;
    }
    return target;
  }
  function resolvePlacementContainer(target) {
    if (isComponent2(target)) {
      ensureActive3(target);
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
    return component.owner.get() ?? placementOwners.get(component) ?? null;
  }
  function resolvePlacementOwner(target, component) {
    if (!target) {
      return null;
    }
    if (isComponent2(target)) {
      return target === component ? resolveOwnPlacementOwner(component) : resolveOwnPlacementOwner(target);
    }
    if (target instanceof Marker) {
      return target.owner.get() ?? resolveNearestWrappedAncestor(target.node) ?? null;
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
    if (isComponent2(target)) {
      return target === component ? resolveOwnPlacementOwner(component) : target;
    }
    return resolvePlacementOwner(target, component);
  }
  function toPlaceSource(state2, place) {
    const placeState = State(place.owner, state2.value ? place : null);
    state2.subscribe(place.marker, (value) => {
      placeState.set(value ? place : null);
    });
    return placeState;
  }
  function placeComponent(component, parent, beforeNode) {
    component["onBeforeMove"]?.();
    clearPlacement(component);
    const moved = moveNode2(parent, component.element, beforeNode);
    if (!moved) {
      return;
    }
    component["refreshOrphanCheck"]();
    component["dispatchMount"]();
  }
  function placeMarker(marker, parent, beforeNode) {
    const moved = moveNode2(parent, marker.node, beforeNode);
    if (!moved) {
      return;
    }
    marker["refreshOrphanCheck"]();
    marker["dispatchMount"]();
  }
  function placeExtension() {
    if (patched3) {
      return;
    }
    patched3 = true;
    registerComponentOwnerResolver((component) => {
      return placementOwners.get(component) ?? null;
    });
    const ComponentClass2 = getComponentClass2();
    const MarkerClass2 = Marker.extend();
    const prototype = ComponentClass2.prototype;
    const markerPrototype = MarkerClass2.prototype;
    markerPrototype.appendTo = function appendTo(target) {
      const resolvedOwner = resolvePlacementContainerOwner(target);
      if (resolvedOwner) {
        this.owner.add(resolvedOwner, "placement");
      } else {
        this.owner.remove("placement");
      }
      const container = resolvePlacementContainer(target);
      placeMarker(this, container, null);
      return this;
    };
    markerPrototype.prependTo = function prependTo(target) {
      const resolvedOwner = resolvePlacementContainerOwner(target);
      if (resolvedOwner) {
        this.owner.add(resolvedOwner, "placement");
      } else {
        this.owner.remove("placement");
      }
      const container = resolvePlacementContainer(target);
      placeMarker(this, container, container.firstChild);
      return this;
    };
    markerPrototype.insertTo = function insertTo(where, target) {
      const resolvedOwner = resolvePlacementOwner(target);
      if (resolvedOwner) {
        this.owner.add(resolvedOwner, "placement");
      } else {
        this.owner.remove("placement");
      }
      const referenceNode = resolvePlacementReferenceNode(target);
      if (!referenceNode) {
        return this;
      }
      const parentNode = referenceNode.parentNode;
      if (!isMoveParent2(parentNode)) {
        throw new Error("Insert target was not found.");
      }
      placeMarker(this, parentNode, where === "before" ? referenceNode : referenceNode.nextSibling);
      return this;
    };
    prototype.appendTo = function appendTo(target) {
      ensureActive3(this);
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
      ensureActive3(this);
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
      ensureActive3(this);
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
      ensureActive3(this);
      const placementOwner = owner === this ? getPlacementLifecycleOwner(this) : owner;
      placementOwners.set(this, placementOwner);
      const documentRef = this.element.ownerDocument;
      const storage = createStorageElement2(documentRef);
      const places = /* @__PURE__ */ new Set();
      const Place = function Place2() {
        const place2 = new PlaceClass(placementOwner, Marker("kitsui:place").owner.add(placementOwner, "place"));
        places.add(place2);
        return place2;
      };
      Place.prototype = PlaceClass.prototype;
      const placeState = placer(Place);
      let releaseOwnerCleanup = noop11;
      let releaseStateCleanup = noop11;
      let blockedByRecursivePlacement = false;
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
        this["disposeIfUnmanagedAfterPlacementCleanup"]();
      });
      this["onBeforeMove"] = () => clearPlacement(this);
      const syncPlace = (place2) => {
        if (!place2) {
          if (blockedByRecursivePlacement) {
            return;
          }
          moveNode2(storage, this.element, null);
          return;
        }
        const parentNode = place2.marker.node.parentNode;
        if (!isMoveParent2(parentNode)) {
          console.error("Placement marker was removed. Treating placement as null.");
          moveNode2(storage, this.element, null);
          return;
        }
        if (wouldCreateRecursiveTree2(parentNode, this.element)) {
          console.error(recursiveTreeErrorMessage2);
          blockedByRecursivePlacement = true;
          return;
        }
        blockedByRecursivePlacement = false;
        const moved = moveNode2(parentNode, this.element, place2.marker.node);
        if (!moved) {
          return;
        }
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

  // src/state/extensions/groupExtension.ts
  var createState = State;
  var patched4 = false;
  function scheduleNextTick(callback) {
    const schedulerRef = globalThis;
    if (typeof schedulerRef.scheduler?.yield === "function") {
      void schedulerRef.scheduler.yield().then(callback);
      return;
    }
    queueMicrotask(callback);
  }
  function readGroupedValue(states) {
    const entries = Object.entries(states).map(([key, state2]) => {
      return [key, state2.value];
    });
    return Object.fromEntries(entries);
  }
  function readGroupSnapshot(states, mapper, oldValue) {
    const snapshot = readGroupedValue(states);
    return {
      snapshot,
      value: mapper ? mapper(snapshot, oldValue) : snapshot
    };
  }
  function createGroupedState(owner, states, mapper, options) {
    const initialGroup = readGroupSnapshot(states, mapper, void 0);
    const grouped = owner ? createState(owner, initialGroup.value, options) : createState(initialGroup.value, options);
    const releaseSubscriptions = [];
    let active = true;
    let queued = false;
    let previousSnapshot = initialGroup.snapshot;
    const flush = () => {
      queued = false;
      if (!active || grouped.disposed) {
        return;
      }
      const nextGroup = readGroupSnapshot(states, mapper, previousSnapshot);
      grouped.set(nextGroup.value);
      previousSnapshot = nextGroup.snapshot;
    };
    const queueGroupedUpdate = () => {
      if (!active || queued || grouped.disposed) {
        return;
      }
      queued = true;
      scheduleNextTick(flush);
    };
    for (const state2 of Object.values(states)) {
      releaseSubscriptions.push(state2.subscribeImmediate(grouped, queueGroupedUpdate));
    }
    grouped.onCleanup(() => {
      if (!active) {
        return;
      }
      active = false;
      queued = false;
      for (const releaseSubscription of releaseSubscriptions) {
        releaseSubscription();
      }
      releaseSubscriptions.length = 0;
    });
    return grouped;
  }
  function groupExtension() {
    if (patched4) {
      return;
    }
    patched4 = true;
    const StateWithGroup = State;
    const Group = function Group2(ownerOrStates, statesOrMapperOrOptions, mapperOrOptions, maybeOptions) {
      const owner = ownerOrStates instanceof Owner && arguments.length >= 2 ? ownerOrStates : null;
      const states = owner === null ? ownerOrStates : statesOrMapperOrOptions;
      const mapperOrStateOptions = owner === null ? statesOrMapperOrOptions : mapperOrOptions;
      const optionsCandidate = owner === null ? maybeOptions ?? mapperOrOptions : maybeOptions;
      if (typeof states !== "object" || states === null) {
        throw new TypeError("State.Group requires a states object.");
      }
      const mapper = typeof mapperOrStateOptions === "function" ? mapperOrStateOptions : void 0;
      const options = typeof mapperOrStateOptions === "function" ? optionsCandidate : mapperOrStateOptions;
      return createGroupedState(owner, states, mapper, options);
    };
    StateWithGroup.Group = Group;
  }

  // src/state/extensions/mappingExtension.ts
  var truthyStates = /* @__PURE__ */ new WeakMap();
  var falsyStates = /* @__PURE__ */ new WeakMap();
  var createOwnedState2 = State;
  var createOwnerlessState = State;
  var patched5 = false;
  function createMappedState(source, owner, mapValue, options) {
    const stateOptions = {
      ...options,
      graph: source.getGraph()
    };
    const mapped = owner ? createOwnedState2(owner, mapValue(source.value), stateOptions) : createOwnerlessState(mapValue(source.value), stateOptions);
    const releaseImplicitOwnerPropagation = mapped._registerImplicitOwnerDependent?.(source) ?? (() => void 0);
    const releaseSourceSubscription = source.subscribeImmediate(mapped, (value, oldValue) => {
      mapped.set(mapValue(value, oldValue));
    });
    const releaseSourceCleanup = source.onCleanup(() => {
      mapped.dispose();
    });
    mapped.onCleanup(() => {
      releaseImplicitOwnerPropagation();
      releaseSourceCleanup();
      releaseSourceSubscription();
    });
    mapped.recompute = () => {
      mapped.set(mapValue(source.value, source.value));
    };
    return mapped;
  }
  function createComparisonState(source, compareValue, compare) {
    const comparator = compareValue instanceof State ? compareValue : null;
    const comparisonState = createMappedState(source, source, (value) => compare(value, comparator?.value ?? compareValue));
    if (!comparator || comparator === source) {
      return comparisonState;
    }
    const releaseComparatorImplicitOwnerPropagation = comparisonState._registerImplicitOwnerDependent?.(comparator) ?? (() => void 0);
    const releaseComparatorSubscription = comparator.subscribeImmediate(comparisonState, () => {
      comparisonState.recompute();
    });
    comparisonState.onCleanup(() => {
      releaseComparatorImplicitOwnerPropagation();
      releaseComparatorSubscription();
    });
    return comparisonState;
  }
  function mappingExtension() {
    if (patched5) {
      return;
    }
    patched5 = true;
    const StateClass2 = State.extend();
    const prototype = StateClass2.prototype;
    prototype.map = function map(ownerOrMapValue, maybeMapValueOrOptions, maybeOptions) {
      if (ownerOrMapValue instanceof Owner) {
        return createMappedState(this, ownerOrMapValue, maybeMapValueOrOptions, maybeOptions);
      }
      return createMappedState(this, null, ownerOrMapValue, maybeMapValueOrOptions);
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
    prototype.or = function or(getValue, options) {
      return createMappedState(this, this, (value) => {
        if (value === null) {
          return getValue();
        }
        return value;
      }, options);
    };
    prototype.equals = function equals(compareValue) {
      return createComparisonState(this, compareValue, (value, otherValue) => value === otherValue);
    };
    prototype.notEquals = function notEquals(compareValue) {
      return createComparisonState(this, compareValue, (value, otherValue) => value !== otherValue);
    };
  }

  // src/component/Draggable.ts
  var noop12 = () => {
  };
  var createOwnedState3 = State;
  var activeDragsByDocument = /* @__PURE__ */ new WeakMap();
  function pointFromPointerEvent(event) {
    return {
      x: event.clientX,
      y: event.clientY
    };
  }
  function subtractPoint(left, right) {
    return {
      x: left.x - right.x,
      y: left.y - right.y
    };
  }
  function distance(point) {
    return Math.hypot(point.x, point.y);
  }
  function localPointFor(component, point) {
    const rect = component.element.getBoundingClientRect();
    return {
      x: point.x - rect.left,
      y: point.y - rect.top
    };
  }
  function componentFromPoint(documentRef, point) {
    const element = documentRef.elementFromPoint?.(point.x, point.y);
    if (element instanceof HTMLElement) {
      return element.component;
    }
    return void 0;
  }
  function isComponent3(value) {
    return value instanceof Component.extend();
  }
  function isUnplacedOwnerlessComponent(component) {
    return component.owner.get() === null && component.element.parentNode === null;
  }
  function eachElement(root, callback) {
    callback(root);
    for (const element of Array.from(root.querySelectorAll("*"))) {
      if (element instanceof HTMLElement) {
        callback(element);
      }
    }
  }
  function makePreviewInert(element) {
    eachElement(element, (current) => {
      current.setAttribute("aria-hidden", "true");
      current.setAttribute("draggable", "false");
      current.setAttribute("inert", "");
      if ("inert" in current) {
        current.inert = true;
      }
    });
  }
  function sanitizePreviewClone(element) {
    eachElement(element, (current) => {
      for (const attribute of Array.from(current.attributes)) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        const dangerousUrl = value.startsWith("javascript:");
        if (name === "id" || name === "autofocus" || name === "srcdoc" || name.startsWith("on") || (name === "href" || name.endsWith(":href") || name === "src") && dangerousUrl) {
          current.removeAttribute(attribute.name);
        }
      }
    });
    makePreviewInert(element);
  }
  function defaultRenderPreview(context) {
    const clone = context.component.element.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      throw new TypeError("Draggable preview clone must be an HTMLElement.");
    }
    sanitizePreviewClone(clone);
    return Component(clone);
  }
  function validatePreviewComponent(component) {
    if (!isComponent3(component)) {
      throw new TypeError("Draggable preview must return a Component.");
    }
    if (!isUnplacedOwnerlessComponent(component)) {
      throw new Error("Draggable preview must return an ownerless, unplaced Component.");
    }
    return component;
  }
  function dispatchDragEvent(component, eventName, detail) {
    component.element.dispatchEvent(new CustomEvent(eventName, {
      bubbles: true,
      cancelable: false,
      detail
    }));
  }
  function defaultPointerInput(component, receiver) {
    let releaseTracking = noop12;
    const releaseCurrentTracking = () => {
      releaseTracking();
      releaseTracking = noop12;
    };
    const releaseCurrentTrackingWithoutCapture = () => {
      releaseTracking(false);
      releaseTracking = noop12;
    };
    const handlePointerDown = (event) => {
      if (event.button !== 0) {
        return;
      }
      const point = pointFromPointerEvent(event);
      const accepted = receiver.start({
        event,
        localPosition: localPointFor(component, point),
        position: point,
        source: {
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          type: "pointer"
        },
        target: componentFromPoint(component.element.ownerDocument, point)
      });
      if (!accepted) {
        return;
      }
      if (component.draggable.phase.value === "idle") {
        return;
      }
      releaseCurrentTracking();
      const documentRef = component.element.ownerDocument;
      const captureElement = documentRef.documentElement;
      try {
        captureElement.setPointerCapture?.(event.pointerId);
      } catch {
      }
      const handlePointerMove = (moveEvent) => {
        if (moveEvent.pointerId !== event.pointerId) {
          return;
        }
        const movePoint = pointFromPointerEvent(moveEvent);
        receiver.move({
          event: moveEvent,
          position: movePoint,
          target: componentFromPoint(documentRef, movePoint)
        });
      };
      const handlePointerUp = (upEvent) => {
        if (upEvent.pointerId !== event.pointerId) {
          return;
        }
        const upPoint = pointFromPointerEvent(upEvent);
        releaseCurrentTracking();
        receiver.end({
          event: upEvent,
          position: upPoint,
          target: componentFromPoint(documentRef, upPoint)
        });
      };
      const handlePointerCancel = (cancelEvent) => {
        if (cancelEvent.pointerId !== event.pointerId) {
          return;
        }
        const cancelPoint = pointFromPointerEvent(cancelEvent);
        releaseCurrentTracking();
        receiver.cancel({
          event: cancelEvent,
          position: cancelPoint,
          target: componentFromPoint(documentRef, cancelPoint)
        });
      };
      const handleLostPointerCapture = (lostEvent) => {
        if (lostEvent.pointerId !== event.pointerId) {
          return;
        }
        const lostPoint = pointFromPointerEvent(lostEvent);
        releaseCurrentTrackingWithoutCapture();
        receiver.cancel({
          event: lostEvent,
          position: lostPoint,
          target: componentFromPoint(documentRef, lostPoint)
        });
      };
      documentRef.addEventListener("pointermove", handlePointerMove);
      documentRef.addEventListener("pointerup", handlePointerUp);
      documentRef.addEventListener("pointercancel", handlePointerCancel);
      captureElement.addEventListener("lostpointercapture", handleLostPointerCapture);
      releaseTracking = (releaseCapture = true) => {
        documentRef.removeEventListener("pointermove", handlePointerMove);
        documentRef.removeEventListener("pointerup", handlePointerUp);
        documentRef.removeEventListener("pointercancel", handlePointerCancel);
        captureElement.removeEventListener("lostpointercapture", handleLostPointerCapture);
        if (releaseCapture) {
          try {
            captureElement.releasePointerCapture?.(event.pointerId);
          } catch {
          }
        }
      };
    };
    const handleDragStop = () => {
      releaseCurrentTracking();
    };
    component.element.addEventListener("pointerdown", handlePointerDown);
    component.element.addEventListener("DragEnd", handleDragStop);
    component.element.addEventListener("DragCancel", handleDragStop);
    return () => {
      releaseCurrentTracking();
      component.element.removeEventListener("pointerdown", handlePointerDown);
      component.element.removeEventListener("DragEnd", handleDragStop);
      component.element.removeEventListener("DragCancel", handleDragStop);
    };
  }
  var DraggableController = class {
    constructor(component, options) {
      this.component = component;
      this.options = options;
      __publicField(this, "active");
      __publicField(this, "pending");
      __publicField(this, "phase");
      __publicField(this, "position");
      __publicField(this, "preview");
      __publicField(this, "activePreview", null);
      __publicField(this, "cleanupDisposeEvent", noop12);
      __publicField(this, "cleanupInput", noop12);
      __publicField(this, "disposedValue", false);
      __publicField(this, "startContext", null);
      this.phase = createOwnedState3(component, "idle");
      this.position = createOwnedState3(component, null);
      this.preview = createOwnedState3(component, null);
      const active = createOwnedState3(component, false);
      const pending = createOwnedState3(component, false);
      this.active = active;
      this.pending = pending;
      this.phase.subscribeImmediate(component, (phase) => {
        active.set(phase === "dragging");
        pending.set(phase === "pending");
      });
      this.cleanupInput = (options.input ?? defaultPointerInput)(component, this.createReceiver()) ?? noop12;
      const handleDispose = () => {
        this.cancelWith({});
      };
      component.element.addEventListener("Dispose", handleDispose);
      this.cleanupDisposeEvent = () => {
        component.element.removeEventListener("Dispose", handleDispose);
      };
      component.onCleanup(() => {
        this.dispose();
      });
    }
    cancel() {
      this.cancelWith({});
    }
    dispose() {
      if (this.disposedValue) {
        return;
      }
      this.disposedValue = true;
      this.cleanupDisposeEvent();
      this.cleanupDisposeEvent = noop12;
      if (!this.phase.disposed && !this.position.disposed) {
        this.cancelWith({});
      } else {
        this.releaseActiveDrag();
      }
      this.cleanupInput();
      this.cleanupInput = noop12;
    }
    end() {
      this.endWith({});
    }
    createReceiver() {
      return {
        cancel: (input) => {
          this.cancelWith(input ?? {});
        },
        end: (input) => {
          this.endWith(input);
        },
        move: (input) => {
          this.moveWith(input);
        },
        start: (input) => {
          return this.startWith(input);
        }
      };
    }
    startWith(input) {
      if (!this.canUseState() || this.phase.value !== "idle") {
        return false;
      }
      const documentRef = this.component.element.ownerDocument;
      const activeDrag = activeDragsByDocument.get(documentRef);
      if (activeDrag && activeDrag !== this) {
        return false;
      }
      const rect = this.component.element.getBoundingClientRect();
      const context = {
        component: this.component,
        event: input.event,
        localPosition: input.localPosition ?? localPointFor(this.component, input.position),
        position: input.position,
        rect,
        source: input.source
      };
      this.startContext = context;
      dispatchDragEvent(this.component, "DragStartRequested", context);
      if (!this.canUseState() || this.options.canStart?.(context) === false || !this.canUseState()) {
        this.startContext = null;
        return false;
      }
      activeDragsByDocument.set(documentRef, this);
      this.position.set({
        current: input.position,
        delta: { x: 0, y: 0 },
        initial: input.position,
        offset: { x: 0, y: 0 },
        previous: null,
        source: input.source
      });
      this.phase.set("pending");
      if ((this.options.threshold ?? 0) <= 0) {
        this.startDragging(input);
      }
      return true;
    }
    moveWith(input) {
      if (!this.canUseState()) {
        return;
      }
      const current = this.position.value;
      if (!current || this.phase.value === "idle") {
        return;
      }
      const next = this.nextPosition(input.position, input.source ?? current.source);
      this.position.set(next);
      if (this.phase.value === "pending") {
        if (distance(next.offset) < (this.options.threshold ?? 0)) {
          return;
        }
        this.startDragging(input);
      }
      if (!this.canUseState() || this.phase.value !== "dragging") {
        return;
      }
      this.positionPreview(next);
      dispatchDragEvent(this.component, "DragMove", {
        component: this.component,
        event: input.event,
        position: next,
        target: input.target
      });
    }
    endWith(input) {
      if (this.phase.value === "idle") {
        return;
      }
      if (input.position) {
        this.position.set(this.nextPosition(input.position, input.source ?? this.position.value.source));
      }
      const position = this.position.value;
      const wasDragging = this.phase.value === "dragging";
      if (wasDragging && position) {
        this.positionPreview(position);
        dispatchDragEvent(this.component, "DragEnd", {
          component: this.component,
          event: input.event,
          position,
          target: input.target
        });
      } else if (position) {
        dispatchDragEvent(this.component, "DragCancel", {
          component: this.component,
          event: input.event,
          position,
          target: input.target
        });
      }
      this.reset();
    }
    cancelWith(input) {
      if (this.phase.value === "idle") {
        return;
      }
      if (input.position && this.position.value) {
        this.position.set(this.nextPosition(input.position, input.source ?? this.position.value.source));
      }
      const position = this.position.value;
      if (position) {
        this.positionPreview(position);
        dispatchDragEvent(this.component, "DragCancel", {
          component: this.component,
          event: input.event,
          position,
          target: input.target
        });
      }
      this.reset();
    }
    startDragging(input) {
      const position = this.position.value;
      const context = this.startContext;
      if (!position || !context || this.phase.value === "dragging") {
        return;
      }
      try {
        this.createPreview(context, position);
      } catch (error) {
        this.reset();
        throw error;
      }
      this.phase.set("dragging");
      dispatchDragEvent(this.component, "DragStart", {
        component: this.component,
        event: input.event,
        position,
        target: input.target
      });
    }
    nextPosition(point, source) {
      const current = this.position.value;
      const previous = current.current;
      return {
        current: point,
        delta: subtractPoint(point, previous),
        initial: current.initial,
        offset: subtractPoint(point, current.initial),
        previous,
        source
      };
    }
    reset() {
      this.releaseActiveDrag();
      this.removePreview();
      this.startContext = null;
      if (this.phase.disposed || this.position.disposed || this.preview.disposed) {
        return;
      }
      this.phase.set("idle");
      this.position.set(null);
      this.preview.set(null);
    }
    releaseActiveDrag() {
      const documentRef = this.component.element.ownerDocument;
      if (activeDragsByDocument.get(documentRef) === this) {
        activeDragsByDocument.delete(documentRef);
      }
    }
    canUseState() {
      return !this.disposedValue && !this.phase.disposed && !this.position.disposed && !this.preview.disposed;
    }
    createPreview(context, position) {
      if (this.options.renderPreview === false) {
        return;
      }
      const renderPreview = this.options.renderPreview ?? defaultRenderPreview;
      const preview = validatePreviewComponent(renderPreview(context));
      makePreviewInert(preview.element);
      preview.owner.add(this.component, "drag-preview");
      preview.element.style.boxSizing = "border-box";
      preview.element.style.height = `${context.rect.height}px`;
      preview.element.style.left = "0px";
      preview.element.style.pointerEvents = "none";
      preview.element.style.position = "fixed";
      preview.element.style.top = "0px";
      preview.element.style.width = `${context.rect.width}px`;
      preview.element.style.zIndex = "2147483647";
      this.component.element.ownerDocument.body.append(preview.element);
      this.activePreview = {
        component: preview,
        localPosition: context.localPosition
      };
      this.preview.set(preview);
      this.positionPreview(position);
    }
    positionPreview(position) {
      const preview = this.activePreview;
      if (!preview || preview.component.disposed) {
        return;
      }
      preview.component.element.style.left = `${position.current.x - preview.localPosition.x}px`;
      preview.component.element.style.top = `${position.current.y - preview.localPosition.y}px`;
    }
    removePreview() {
      const preview = this.activePreview?.component ?? null;
      this.activePreview = null;
      if (preview && !preview.disposed) {
        preview.remove();
      }
    }
  };
  var Draggable = function Draggable2(options = {}) {
    const component = Component(this ?? "div", Draggable2);
    if (component.draggable) {
      return component;
    }
    return component.extend((root) => ({
      draggable: new DraggableController(root, options)
    }));
  };
  Draggable.Input = function Input(input) {
    if (typeof input !== "function") {
      throw new TypeError("Draggable.Input requires an input adapter function.");
    }
    return input;
  };

  // src/component/DropTarget.ts
  var noop13 = () => {
  };
  var targetsByDocument = /* @__PURE__ */ new WeakMap();
  var documentCleanups = /* @__PURE__ */ new WeakMap();
  var activeHoverByDocument = /* @__PURE__ */ new WeakMap();
  var handledDropEvents = /* @__PURE__ */ new WeakMap();
  function isPointInRect(point, rect) {
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  }
  function getDropTargetController(component) {
    return component?.dropTarget ?? null;
  }
  function contextFor(controller, draggable, position, source) {
    return {
      draggable,
      position,
      source,
      target: controller.component
    };
  }
  function installDocumentListeners(documentRef) {
    if (documentCleanups.has(documentRef)) {
      return;
    }
    const handleDragStart = (event) => {
      const detail = event.detail;
      if (!detail) {
        return;
      }
      syncAcceptingTargets(detail.component.element.ownerDocument, detail.component, detail.position.current, detail.position.source);
    };
    const handleDragMove = (event) => {
      const detail = event.detail;
      if (!detail) {
        return;
      }
      syncAcceptingTargets(detail.component.element.ownerDocument, detail.component, detail.position.current, detail.position.source);
      const resolved = resolveDropTarget(detail.component, detail.position.current, detail.position.source, detail.target);
      setActiveDropTarget(detail.component.element.ownerDocument, resolved?.controller ?? null, detail.component);
    };
    const handleDragEnd = (event) => {
      const detail = event.detail;
      if (!detail) {
        return;
      }
      const handled = handleDropTargetDrop(event, detail.component, detail.position.current, detail.position.source, detail.target);
      handledDropEvents.set(event, handled);
      clearDropTargetState(detail.component.element.ownerDocument);
    };
    const handleDragCancel = (event) => {
      const detail = event.detail;
      if (!detail) {
        return;
      }
      clearDropTargetState(detail.component.element.ownerDocument);
    };
    documentRef.addEventListener("DragStart", handleDragStart);
    documentRef.addEventListener("DragMove", handleDragMove);
    documentRef.addEventListener("DragEnd", handleDragEnd);
    documentRef.addEventListener("DragCancel", handleDragCancel);
    documentCleanups.set(documentRef, () => {
      documentRef.removeEventListener("DragStart", handleDragStart);
      documentRef.removeEventListener("DragMove", handleDragMove);
      documentRef.removeEventListener("DragEnd", handleDragEnd);
      documentRef.removeEventListener("DragCancel", handleDragCancel);
      documentCleanups.delete(documentRef);
    });
  }
  function getRegisteredTargets(documentRef) {
    let targets = targetsByDocument.get(documentRef);
    if (!targets) {
      targets = /* @__PURE__ */ new Set();
      targetsByDocument.set(documentRef, targets);
      installDocumentListeners(documentRef);
    }
    return targets;
  }
  function peekRegisteredTargets(documentRef) {
    return targetsByDocument.get(documentRef);
  }
  function syncAcceptingTargets(documentRef, draggable, position, source) {
    for (const target of peekRegisteredTargets(documentRef) ?? []) {
      target.setAccepting(target.accepts(draggable, position, source));
    }
  }
  function hoveredDropTargets(documentRef) {
    const hovered = [];
    try {
      for (const element of Array.from(documentRef.querySelectorAll(":hover")).reverse()) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        const controller = getDropTargetController(element.component);
        if (controller) {
          hovered.push(controller);
        }
      }
    } catch {
    }
    return hovered;
  }
  function targetFromExplicitComponent(component) {
    let current = component?.element ?? null;
    while (current) {
      if (current instanceof HTMLElement) {
        const controller = getDropTargetController(current.component);
        if (controller) {
          return controller;
        }
      }
      current = current.parentNode;
    }
    return null;
  }
  function resolveDropTarget(draggable, position, source, explicitTarget) {
    const documentRef = draggable.element.ownerDocument;
    const candidates = [];
    const explicit = targetFromExplicitComponent(explicitTarget);
    if (explicit) {
      candidates.push(explicit);
    }
    candidates.push(...hoveredDropTargets(documentRef));
    const elementAtPoint = documentRef.elementFromPoint?.(position.x, position.y);
    if (elementAtPoint instanceof HTMLElement) {
      const pointTarget = targetFromExplicitComponent(elementAtPoint.component);
      if (pointTarget) {
        candidates.push(pointTarget);
      }
    }
    for (const candidate of candidates) {
      if (candidate.accepts(draggable, position, source)) {
        return candidate.toResolved(draggable, position, source);
      }
    }
    const targets = [...peekRegisteredTargets(documentRef) ?? []].reverse();
    for (const target of targets) {
      if (!isPointInRect(position, target.component.element.getBoundingClientRect())) {
        continue;
      }
      if (target.accepts(draggable, position, source)) {
        return target.toResolved(draggable, position, source);
      }
    }
    return null;
  }
  function setActiveDropTarget(documentRef, controller, draggable) {
    const previous = activeHoverByDocument.get(documentRef);
    if (previous && previous !== controller) {
      previous.setHovering(false, null);
    }
    if (!controller) {
      activeHoverByDocument.delete(documentRef);
      return;
    }
    activeHoverByDocument.set(documentRef, controller);
    controller.setHovering(true, draggable);
  }
  function clearDropTargetState(documentRef) {
    const previous = activeHoverByDocument.get(documentRef);
    previous?.setHovering(false, null);
    activeHoverByDocument.delete(documentRef);
    for (const target of peekRegisteredTargets(documentRef) ?? []) {
      target.setAccepting(false);
    }
  }
  function handleDropTargetDrop(event, draggable, position, source, explicitTarget) {
    if (event && handledDropEvents.has(event)) {
      return handledDropEvents.get(event) ?? false;
    }
    const resolved = resolveDropTarget(draggable, position, source, explicitTarget);
    const handled = Boolean(resolved);
    resolved?.drop();
    if (event) {
      handledDropEvents.set(event, handled);
    }
    return handled;
  }
  var DropTargetController = class {
    constructor(component, options) {
      this.component = component;
      this.options = options;
      __publicField(this, "accepting");
      __publicField(this, "draggable");
      __publicField(this, "hovering");
      __publicField(this, "cleanupRegistration", noop13);
      __publicField(this, "disposedValue", false);
      this.accepting = State(component, false);
      this.draggable = State(component, null);
      this.hovering = State(component, false);
      const documentRef = component.element.ownerDocument;
      const targets = getRegisteredTargets(documentRef);
      targets.add(this);
      this.cleanupRegistration = () => {
        targets.delete(this);
        if (activeHoverByDocument.get(documentRef) === this) {
          activeHoverByDocument.delete(documentRef);
        }
        if (!this.component.disposed) {
          this.setAccepting(false);
          this.setHovering(false, null);
        }
        if (targets.size === 0) {
          targetsByDocument.delete(documentRef);
          documentCleanups.get(documentRef)?.();
        }
      };
      component.onCleanup(() => {
        this.dispose();
      });
    }
    accepts(draggable, position, source) {
      return this.options.accepts(contextFor(this, draggable, position, source));
    }
    dispose() {
      if (this.disposedValue) {
        return;
      }
      this.disposedValue = true;
      this.cleanupRegistration();
      this.cleanupRegistration = noop13;
    }
    setAccepting(accepting) {
      if (this.accepting.disposed) {
        return;
      }
      this.accepting.set(accepting);
    }
    setHovering(hovering, draggable) {
      if (this.hovering.disposed || this.draggable.disposed) {
        return;
      }
      this.hovering.set(hovering);
      this.draggable.set(hovering ? draggable : null);
    }
    toResolved(draggable, position, source) {
      return {
        controller: this,
        drop: () => {
          this.options.drop(contextFor(this, draggable, position, source));
        },
        target: this.component
      };
    }
  };
  var DropTarget = function DropTarget2(options) {
    if (!options || typeof options.accepts !== "function") {
      throw new TypeError("DropTarget requires an accepts function.");
    }
    if (typeof options.drop !== "function") {
      throw new TypeError("DropTarget requires a drop function.");
    }
    const component = Component(this ?? "div", DropTarget2);
    if (component.dropTarget) {
      return component;
    }
    return component.extend((root) => ({
      dropTarget: new DropTargetController(root, options)
    }));
  };

  // src/component/Sortable.ts
  var noop14 = () => {
  };
  var createOwnedState4 = State;
  var sortablesByDocument = /* @__PURE__ */ new WeakMap();
  var activeSessionsByDocument = /* @__PURE__ */ new WeakMap();
  function isStateLike2(value) {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const maybeState = value;
    return "value" in maybeState && typeof maybeState.subscribe === "function";
  }
  function isComponent4(value) {
    return value instanceof Component.extend();
  }
  function isUnplacedOwnerlessComponent2(component) {
    return component.owner.get() === null && component.element.parentNode === null;
  }
  function validateRenderedComponent(component, message) {
    if (!isComponent4(component)) {
      throw new TypeError(`${message} must return a Component.`);
    }
    if (!isUnplacedOwnerlessComponent2(component)) {
      throw new Error(`${message} must return an ownerless, unplaced Component.`);
    }
    return component;
  }
  function valuesFromRecords(records, order) {
    const values = [];
    for (const key of order) {
      const record = records.get(key);
      if (record) {
        values.push(record.state.value);
      }
    }
    return values;
  }
  function getSortableController(component) {
    return component?.sortable ?? null;
  }
  function closestSortableController(component) {
    let current = component?.element ?? null;
    while (current) {
      if (current instanceof HTMLElement) {
        const controller = getSortableController(current.component);
        if (controller) {
          return controller;
        }
      }
      current = current.parentNode;
    }
    return null;
  }
  function pointInRect(point, rect) {
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  }
  function sortableRegistryFor(documentRef) {
    let registry = sortablesByDocument.get(documentRef);
    if (!registry) {
      registry = /* @__PURE__ */ new Set();
      sortablesByDocument.set(documentRef, registry);
    }
    return registry;
  }
  function activeSessionFor(documentRef) {
    return activeSessionsByDocument.get(documentRef) ?? null;
  }
  function activeSessionForSortable(sortable) {
    return activeSessionFor(sortable.component.element.ownerDocument);
  }
  function setActiveSession(session) {
    if (!session) {
      return;
    }
    activeSessionsByDocument.set(session.source.component.element.ownerDocument, session);
  }
  function clearActiveSession(session) {
    const documentRef = session.source.component.element.ownerDocument;
    if (activeSessionsByDocument.get(documentRef) === session) {
      activeSessionsByDocument.delete(documentRef);
    }
  }
  function resolveSortableTarget(session, detail) {
    const explicit = closestSortableController(detail.target);
    if (explicit?.canAcceptSession(session)) {
      return explicit;
    }
    const registry = [...sortableRegistryFor(detail.component.element.ownerDocument)].reverse();
    for (const sortable of registry) {
      if (!pointInRect(detail.position.current, sortable.component.element.getBoundingClientRect())) {
        continue;
      }
      if (sortable.canAcceptSession(session)) {
        return sortable;
      }
    }
    return session.source;
  }
  var SortableController = class {
    constructor(component, input, options) {
      this.component = component;
      this.input = input;
      this.options = options;
      __publicField(this, "dragging");
      __publicField(this, "items");
      __publicField(this, "phase");
      __publicField(this, "preview");
      __publicField(this, "recordsByKey", /* @__PURE__ */ new Map());
      __publicField(this, "cleanupDisposeEvent", noop14);
      __publicField(this, "currentOrder", []);
      __publicField(this, "disposedValue", false);
      __publicField(this, "previewOrder", []);
      __publicField(this, "releaseSourceSubscription", noop14);
      const initial = isStateLike2(input) ? input.value : input;
      this.items = createOwnedState4(component, []);
      this.preview = createOwnedState4(component, []);
      this.phase = createOwnedState4(component, "idle");
      this.dragging = createOwnedState4(component, null);
      sortableRegistryFor(component.element.ownerDocument).add(this);
      const handleDispose = () => {
        this.dispose();
      };
      component.element.addEventListener("Dispose", handleDispose);
      this.cleanupDisposeEvent = () => {
        component.element.removeEventListener("Dispose", handleDispose);
      };
      component.onCleanup(() => {
        this.dispose();
      });
      if (isStateLike2(input)) {
        this.releaseSourceSubscription = input.subscribe(component, (items) => {
          this.syncItems(items);
        });
      }
      this.syncItems(initial);
    }
    cancel() {
      const session = activeSessionForSortable(this);
      if (session?.source === this || session?.target === this) {
        this.cancelDragSession(session);
      }
    }
    canAcceptSession(session) {
      if (session.source === this) {
        return true;
      }
      if (!this.options.transfer || this.options.transfer !== session.source.options.transfer) {
        return false;
      }
      if (this.recordsByKey.has(session.key)) {
        return false;
      }
      const sourceContext = session.source.transferContextFor(session);
      const targetContext = this.transferContextFor(session);
      if (session.source.options.canTransferOut?.(sourceContext) === false) {
        return false;
      }
      if (this.options.canTransferIn?.(targetContext) === false) {
        return false;
      }
      return true;
    }
    dispose() {
      if (this.disposedValue) {
        return;
      }
      this.disposedValue = true;
      const session = activeSessionForSortable(this);
      if (session?.source === this || session?.target === this) {
        this.cancelDragSession(session);
      }
      this.cleanupDisposeEvent();
      this.cleanupDisposeEvent = noop14;
      this.releaseSourceSubscription();
      sortableRegistryFor(this.component.element.ownerDocument).delete(this);
      for (const record of [...this.recordsByKey.values()]) {
        this.removeRecord(record);
      }
    }
    handleDragStart(record, detail) {
      if (activeSessionForSortable(this) || this.disposedValue || !this.recordsByKey.has(record.key)) {
        return;
      }
      const placeholder = validateRenderedComponent(this.options.placeholder(record.component, record.key), "Sortable placeholder");
      placeholder.owner.add(this.component, "sortable-placeholder");
      const session = {
        dragging: record.component,
        item: record.state.value,
        key: record.key,
        placeholder,
        source: this,
        target: this,
        targetIndex: this.currentOrder.indexOf(record.key)
      };
      setActiveSession(session);
      this.phase.set("sorting");
      this.dragging.set(record.component);
      this.previewOrder = [...this.currentOrder];
      this.preview.set(valuesFromRecords(this.recordsByKey, this.previewOrder));
      this.placePlaceholder(this, session.targetIndex);
      this.handleDragMove(detail);
      record.component.element.remove();
    }
    handleDragMove(detail) {
      const session = activeSessionForSortable(this);
      if (!session || session.source !== this) {
        return;
      }
      const dropTarget = resolveDropTarget(detail.component, detail.position.current, detail.position.source, detail.target);
      if (dropTarget) {
        session.target.clearPreviewFromSession(session);
        session.target = session.source;
        session.targetIndex = session.source.currentOrder.indexOf(session.key);
        this.suspendPlaceholder(session);
        return;
      }
      const target = resolveSortableTarget(session, detail);
      target.previewSession(session, detail.position.current);
    }
    handleDragEnd(event, detail) {
      const session = activeSessionForSortable(this);
      if (!session || session.source !== this) {
        return;
      }
      const handled = handleDropTargetDrop(event, detail.component, detail.position.current, detail.position.source, detail.target);
      if (handled) {
        this.cleanupSession();
        return;
      }
      session.target.commitSession(session);
    }
    handleDragCancel() {
      if (activeSessionForSortable(this)?.source === this) {
        this.cancelSession();
      }
    }
    previewSession(session, point) {
      if (!this.canAcceptSession(session)) {
        session.source.previewSession(session, point);
        return;
      }
      if (session.target !== this) {
        session.target.clearPreviewFromSession(session);
      }
      session.target = this;
      session.targetIndex = this.resolveInsertionIndex(session, point);
      this.placePlaceholder(this, session.targetIndex);
      this.previewOrder = this.previewOrderForSession(session, session.targetIndex);
      this.preview.set(this.previewValuesForSession(session));
      this.phase.set("sorting");
      this.dragging.set(session.dragging);
    }
    cleanupSession() {
      const session = activeSessionForSortable(this);
      if (!session || session.source !== this) {
        return;
      }
      session.placeholder?.remove();
      session.placeholder = null;
      session.target.clearPreviewFromSession(session);
      session.source.phase.set("idle");
      session.source.dragging.set(null);
      session.source.previewOrder = [...session.source.currentOrder];
      session.source.preview.set(valuesFromRecords(session.source.recordsByKey, session.source.previewOrder));
      if (session.target !== session.source) {
        session.target.phase.set("idle");
        session.target.dragging.set(null);
      }
      clearActiveSession(session);
      if (!session.source.disposedValue && !session.source.component.disposed) {
        session.source.placeRecords();
      }
      if (session.target !== session.source && !session.target.disposedValue && !session.target.component.disposed) {
        session.target.placeRecords();
      }
    }
    cancelSession() {
      const session = activeSessionForSortable(this);
      if (!session || session.source !== this && session.target !== this) {
        return;
      }
      session.placeholder?.remove();
      session.placeholder = null;
      session.source.phase.set("idle");
      session.source.dragging.set(null);
      session.source.previewOrder = [...session.source.currentOrder];
      session.source.preview.set(valuesFromRecords(session.source.recordsByKey, session.source.previewOrder));
      if (session.target !== session.source) {
        session.target.phase.set("idle");
        session.target.dragging.set(null);
        session.target.previewOrder = [...session.target.currentOrder];
        session.target.preview.set(valuesFromRecords(session.target.recordsByKey, session.target.previewOrder));
      }
      clearActiveSession(session);
      if (!session.source.disposedValue && !session.source.component.disposed) {
        session.source.placeRecords();
      }
      if (session.target !== session.source && !session.target.disposedValue && !session.target.component.disposed) {
        session.target.placeRecords();
      }
    }
    cancelDragSession(session) {
      if (session.dragging.draggable.phase.value !== "idle") {
        session.dragging.draggable.cancel();
        return;
      }
      this.cancelSession();
    }
    clearPreviewFromSession(session) {
      this.previewOrder = [...this.currentOrder];
      this.preview.set(valuesFromRecords(this.recordsByKey, this.previewOrder));
      if (session.target === this && session.source !== this) {
        this.phase.set("idle");
        this.dragging.set(null);
      }
    }
    suspendPlaceholder(session) {
      session.placeholder?.element.remove();
    }
    commitSession(session) {
      if (session.target !== this) {
        return;
      }
      if (session.source === this) {
        const nextItems = this.previewValuesForSession(session);
        this.syncItems(nextItems);
        this.cleanupSession();
        return;
      }
      const sourceItems = session.source.items.value.filter((item, index) => {
        return session.source.keyFor(item, index) !== session.key;
      });
      const targetItems = [...this.items.value];
      targetItems.splice(session.targetIndex, 0, session.item);
      session.source.syncItems(sourceItems);
      this.syncItems(targetItems);
      session.source.cleanupSession();
    }
    normalize(items) {
      const normalized = [];
      const seen = /* @__PURE__ */ new Set();
      items.forEach((item, index) => {
        const key = this.keyFor(item, index);
        if (seen.has(key)) {
          console.error(`Sortable ignored duplicate key ${String(key)}.`);
          return;
        }
        seen.add(key);
        normalized.push({ index, item, key });
      });
      return normalized;
    }
    keyFor(item, index) {
      return this.options.key?.(item, index) ?? index;
    }
    syncItems(items) {
      if (this.disposedValue) {
        return;
      }
      const sessionBeforeSync = activeSessionForSortable(this);
      const normalized = this.normalize(items);
      const nextKeys = new Set(normalized.map((item) => item.key));
      const draggingKey = sessionBeforeSync?.source === this ? sessionBeforeSync.key : null;
      if (draggingKey !== null && !nextKeys.has(draggingKey)) {
        this.cancelSession();
      }
      for (const entry of normalized) {
        const existing = this.recordsByKey.get(entry.key);
        if (existing) {
          existing.state.set(entry.item);
          if (sessionBeforeSync?.key === entry.key && sessionBeforeSync.source === this) {
            sessionBeforeSync.item = entry.item;
          }
          continue;
        }
        this.recordsByKey.set(entry.key, this.createRecord(entry));
      }
      for (const [key, record] of [...this.recordsByKey]) {
        if (nextKeys.has(key)) {
          continue;
        }
        this.removeRecord(record);
      }
      this.currentOrder = normalized.map((item) => item.key);
      const committedItems = normalized.map((item) => item.item);
      this.items.set(committedItems);
      this.placeRecords();
      const session = activeSessionForSortable(this);
      if (session && session === sessionBeforeSync && session.target === this) {
        this.previewOrder = this.mergeActivePreviewOrder(session);
        this.preview.set(this.previewValuesForSession(session));
        this.placePlaceholder(this, session.targetIndex);
      } else {
        this.previewOrder = [...this.currentOrder];
        this.preview.set(committedItems);
      }
    }
    createRecord(entry) {
      const state2 = createOwnedState4(this.component, entry.item);
      const rendered = validateRenderedComponent(this.options.render(state2, entry.key, entry.index), "Sortable render");
      const draggable = Draggable.call(rendered);
      draggable.owner.add(this.component, "sortable-item");
      let record;
      const isRecordDragDetail = (detail) => {
        return detail?.component === record.component;
      };
      const handleDragStart = (event) => {
        const detail = event.detail;
        if (isRecordDragDetail(detail)) {
          this.handleDragStart(record, detail);
        }
      };
      const handleDragMove = (event) => {
        const detail = event.detail;
        if (isRecordDragDetail(detail)) {
          this.handleDragMove(detail);
        }
      };
      const handleDragEnd = (event) => {
        const detail = event.detail;
        if (isRecordDragDetail(detail)) {
          this.handleDragEnd(event, detail);
        }
      };
      const handleDragCancel = (event) => {
        const detail = event.detail;
        if (isRecordDragDetail(detail)) {
          this.handleDragCancel();
        }
      };
      const cleanup = () => {
        draggable.element.removeEventListener("DragStart", handleDragStart);
        draggable.element.removeEventListener("DragMove", handleDragMove);
        draggable.element.removeEventListener("DragEnd", handleDragEnd);
        draggable.element.removeEventListener("DragCancel", handleDragCancel);
        state2.dispose();
        draggable.remove();
      };
      record = {
        cleanup,
        component: draggable,
        key: entry.key,
        state: state2
      };
      draggable.element.addEventListener("DragStart", handleDragStart);
      draggable.element.addEventListener("DragMove", handleDragMove);
      draggable.element.addEventListener("DragEnd", handleDragEnd);
      draggable.element.addEventListener("DragCancel", handleDragCancel);
      return record;
    }
    removeRecord(record) {
      if (this.recordsByKey.get(record.key) !== record) {
        return;
      }
      this.recordsByKey.delete(record.key);
      record.cleanup();
    }
    placeRecords() {
      const session = activeSessionForSortable(this);
      const hiddenKey = session?.source === this ? session.key : null;
      for (const key of this.currentOrder) {
        if (key === hiddenKey) {
          continue;
        }
        const record = this.recordsByKey.get(key);
        if (record) {
          this.component.append(record.component);
        }
      }
    }
    placePlaceholder(target, index) {
      const session = activeSessionForSortable(target);
      const placeholder = session?.placeholder;
      if (!placeholder) {
        return;
      }
      const referenceRecord = target.recordAtInsertionIndex(session, index);
      const referenceNode = referenceRecord?.component.element ?? null;
      target.component.element.insertBefore(placeholder.element, referenceNode);
    }
    baseOrderForSession(session) {
      const order = [...this.currentOrder];
      if (session.source === this) {
        return order.filter((key) => key !== session.key);
      }
      return order;
    }
    previewOrderForSession(session, index) {
      const order = [...this.currentOrder];
      if (session.source === this) {
        const existingIndex = order.indexOf(session.key);
        if (existingIndex >= 0) {
          order.splice(existingIndex, 1);
        }
      }
      order.splice(index, 0, session.key);
      return order;
    }
    previewValuesForSession(session) {
      const values = [];
      for (const key of this.previewOrder) {
        if (key === session.key) {
          values.push(session.item);
          continue;
        }
        const record = this.recordsByKey.get(key);
        if (record) {
          values.push(record.state.value);
        }
      }
      return values;
    }
    recordAtInsertionIndex(session, index) {
      const order = this.baseOrderForSession(session);
      const referenceKey = order[index];
      if (referenceKey === void 0) {
        return null;
      }
      return this.recordsByKey.get(referenceKey) ?? null;
    }
    resolveInsertionIndex(session, point) {
      const slots = this.insertionSlotsForSession(session);
      let nearest = slots[0] ?? { index: 0, x: point.x, y: point.y };
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const slot of slots) {
        const distanceX = point.x - slot.x;
        const distanceY = point.y - slot.y;
        const distance2 = distanceX * distanceX + distanceY * distanceY;
        if (distance2 < nearestDistance) {
          nearest = slot;
          nearestDistance = distance2;
        }
      }
      return nearest.index;
    }
    insertionSlotsForSession(session) {
      const order = this.baseOrderForSession(session);
      const hostRect = this.component.element.getBoundingClientRect();
      const slots = [];
      if (order.length === 0) {
        return [{
          index: 0,
          x: hostRect.left + hostRect.width / 2,
          y: hostRect.top + hostRect.height / 2
        }];
      }
      for (let index = 0; index <= order.length; index += 1) {
        const before = index > 0 ? this.recordsByKey.get(order[index - 1]) ?? null : null;
        const after = index < order.length ? this.recordsByKey.get(order[index]) ?? null : null;
        const beforeRect = before?.component.element.getBoundingClientRect();
        const afterRect = after?.component.element.getBoundingClientRect();
        if (beforeRect && afterRect) {
          slots.push({
            index,
            x: (beforeRect.left + beforeRect.width / 2 + afterRect.left + afterRect.width / 2) / 2,
            y: (beforeRect.bottom + afterRect.top) / 2
          });
          continue;
        }
        if (afterRect) {
          slots.push({
            index,
            x: afterRect.left + afterRect.width / 2,
            y: afterRect.top
          });
          continue;
        }
        if (beforeRect) {
          slots.push({
            index,
            x: beforeRect.left + beforeRect.width / 2,
            y: beforeRect.bottom
          });
        }
      }
      return slots;
    }
    mergeActivePreviewOrder(session) {
      const currentKeys = new Set(this.currentOrder);
      const merged = [];
      for (const key of this.previewOrder) {
        if (key !== session.key && !currentKeys.has(key)) {
          continue;
        }
        if (!merged.includes(key)) {
          merged.push(key);
        }
      }
      for (const key of this.currentOrder) {
        if (merged.includes(key)) {
          continue;
        }
        this.insertKeyBySourceNeighbors(merged, key, session);
      }
      if (session.target === this) {
        const sessionKeyIndex = merged.indexOf(session.key);
        if (sessionKeyIndex >= 0) {
          session.targetIndex = merged.slice(0, sessionKeyIndex).filter((key) => key !== session.key).length;
        }
      }
      return merged;
    }
    insertKeyBySourceNeighbors(merged, key, session) {
      const sourceIndex = this.currentOrder.indexOf(key);
      const sessionKey = session.key;
      const sessionKeyIndex = this.currentOrder.indexOf(sessionKey);
      const mergedSessionIndex = merged.indexOf(sessionKey);
      let previousNeighborIndex = -1;
      let nextNeighborIndex = -1;
      for (let index = sourceIndex - 1; index >= 0; index -= 1) {
        const previousKey = this.currentOrder[index];
        if (previousKey === sessionKey) {
          continue;
        }
        previousNeighborIndex = merged.indexOf(previousKey);
        break;
      }
      for (let index = sourceIndex + 1; index < this.currentOrder.length; index += 1) {
        const nextKey = this.currentOrder[index];
        if (nextKey === sessionKey) {
          continue;
        }
        nextNeighborIndex = merged.indexOf(nextKey);
        break;
      }
      if (previousNeighborIndex >= 0 && nextNeighborIndex >= 0) {
        merged.splice(Math.min(previousNeighborIndex + 1, nextNeighborIndex), 0, key);
        return;
      }
      if (session.source === this && sessionKeyIndex >= 0 && mergedSessionIndex >= 0) {
        if (sourceIndex > sessionKeyIndex) {
          merged.splice(mergedSessionIndex + 1, 0, key);
          return;
        }
        if (sourceIndex < sessionKeyIndex) {
          merged.splice(mergedSessionIndex, 0, key);
          return;
        }
      }
      merged.push(key);
    }
    transferContextFor(session) {
      return {
        item: session.item,
        key: session.key,
        sortable: this.component
      };
    }
  };
  var Sortable = function Sortable2(input, options) {
    if (!options || typeof options.render !== "function") {
      throw new TypeError("Sortable requires a render function.");
    }
    if (typeof options.placeholder !== "function") {
      throw new TypeError("Sortable requires a placeholder function.");
    }
    const component = Component(this ?? "div", Sortable2);
    if (component.sortable) {
      return component;
    }
    return component.extend((root) => ({
      sortable: new SortableController(root, input, options)
    }));
  };
  Sortable.Transfer = function Transfer(label) {
    return { label };
  };

  // src/index.ts
  breakdownExtension();
  compositionExtension();
  placeExtension();
  groupExtension();
  mappingExtension();
  return __toCommonJS(index_exports);
})();

  return __kitsui_factory__;
});
//# sourceMappingURL=kitsui.umd.js.map
