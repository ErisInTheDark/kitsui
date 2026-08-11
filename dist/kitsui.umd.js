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
    AsyncPending: () => AsyncPending,
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
    mediaQuery: () => mediaQuery,
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
    whenOpen: () => whenOpen
  });

  // src/utility/timer.ts
  var maximumNativeTimeout = 2147483647;
  var scheduledTimeouts = [];
  var activeNativeTimeout = null;
  var nextSequence = 0;
  function compareTimeouts(left, right) {
    return left.deadline - right.deadline || left.sequence - right.sequence;
  }
  function swapTimeouts(leftIndex, rightIndex) {
    const left = scheduledTimeouts[leftIndex];
    const right = scheduledTimeouts[rightIndex];
    scheduledTimeouts[leftIndex] = right;
    scheduledTimeouts[rightIndex] = left;
    left.heapIndex = rightIndex;
    right.heapIndex = leftIndex;
  }
  function bubbleUp(startIndex) {
    let index = startIndex;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (compareTimeouts(scheduledTimeouts[parentIndex], scheduledTimeouts[index]) <= 0) {
        return;
      }
      swapTimeouts(parentIndex, index);
      index = parentIndex;
    }
  }
  function bubbleDown(startIndex) {
    let index = startIndex;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallestIndex = index;
      if (leftIndex < scheduledTimeouts.length && compareTimeouts(scheduledTimeouts[leftIndex], scheduledTimeouts[smallestIndex]) < 0) {
        smallestIndex = leftIndex;
      }
      if (rightIndex < scheduledTimeouts.length && compareTimeouts(scheduledTimeouts[rightIndex], scheduledTimeouts[smallestIndex]) < 0) {
        smallestIndex = rightIndex;
      }
      if (smallestIndex === index) {
        return;
      }
      swapTimeouts(index, smallestIndex);
      index = smallestIndex;
    }
  }
  function removeTimeoutAt(index) {
    const removed = scheduledTimeouts[index];
    const replacement = scheduledTimeouts.pop();
    removed.heapIndex = -1;
    if (replacement === void 0 || replacement === removed) {
      return removed;
    }
    scheduledTimeouts[index] = replacement;
    replacement.heapIndex = index;
    if (index > 0 && compareTimeouts(replacement, scheduledTimeouts[Math.floor((index - 1) / 2)]) < 0) {
      bubbleUp(index);
    } else {
      bubbleDown(index);
    }
    return removed;
  }
  function clearNativeTimeout() {
    if (activeNativeTimeout === null) {
      return;
    }
    clearTimeout(activeNativeTimeout);
    activeNativeTimeout = null;
  }
  function armNextTimeout() {
    clearNativeTimeout();
    const nextTimeout = scheduledTimeouts[0];
    if (!nextTimeout) {
      return;
    }
    const remaining = Math.max(0, nextTimeout.deadline - performance.now());
    const delay = Math.min(maximumNativeTimeout, Math.ceil(remaining));
    activeNativeTimeout = setTimeout(runDueTimeouts, delay);
  }
  function runDueTimeouts() {
    activeNativeTimeout = null;
    const currentTime = performance.now();
    const callbacks = [];
    while (scheduledTimeouts[0]?.deadline <= currentTime) {
      const scheduledTimeout = removeTimeoutAt(0);
      const callback = scheduledTimeout.callback;
      scheduledTimeout.callback = null;
      if (callback) {
        callbacks.push(callback);
      }
    }
    armNextTimeout();
    for (const callback of callbacks) {
      try {
        callback();
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }
  function scheduleTimeout(callback, milliseconds) {
    if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError("Timeout duration must be a finite non-negative number.");
    }
    const currentTime = performance.now();
    const calculatedDeadline = currentTime + milliseconds;
    const scheduledTimeout = {
      callback,
      deadline: Number.isFinite(calculatedDeadline) ? calculatedDeadline : Number.MAX_VALUE,
      heapIndex: scheduledTimeouts.length,
      sequence: nextSequence++
    };
    scheduledTimeouts.push(scheduledTimeout);
    bubbleUp(scheduledTimeout.heapIndex);
    if (scheduledTimeout.heapIndex === 0) {
      armNextTimeout();
    }
    return {
      cancel() {
        if (scheduledTimeout.heapIndex < 0) {
          return;
        }
        const wasNext = scheduledTimeout.heapIndex === 0;
        scheduledTimeout.callback = null;
        removeTimeoutAt(scheduledTimeout.heapIndex);
        if (wasNext) {
          armNextTimeout();
        }
      }
    };
  }

  // src/utility/timeoutPromise.ts
  function scheduleTimeoutPromise(callback) {
    let active = true;
    let timeoutHandle = null;
    const timeoutPromise = new Promise((resolve) => {
      timeoutHandle = scheduleTimeout(resolve, 0);
    });
    void timeoutPromise.then(() => {
      const scheduledTimeout = timeoutHandle;
      timeoutHandle = null;
      scheduledTimeout?.cancel();
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
        if (timeoutHandle === null) {
          return;
        }
        timeoutHandle.cancel();
        timeoutHandle = null;
      }
    };
  }

  // src/utility/cleanup.ts
  function runCleanupSteps(cleanupSteps) {
    let firstError;
    let failed = false;
    for (const cleanupStep of cleanupSteps) {
      try {
        cleanupStep();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    if (failed) {
      throw firstError;
    }
  }
  function cleanupAndRethrow(error, cleanup) {
    try {
      cleanup();
    } catch (cleanupError) {
      let attached = false;
      try {
        if (error instanceof Error) {
          if (error.cause === void 0) {
            error.cause = cleanupError;
            attached = error.cause === cleanupError;
          }
        }
      } catch {
      }
      if (!attached) {
        try {
          console.error("Structural rollback cleanup failed.", cleanupError);
        } catch {
        }
      }
    }
    throw error;
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
      const pendingDeliveries = [...graph.pendingListeners].map((record) => ({
        equals: record.equals,
        finalValue: record.pendingFinalValue,
        force: record.forcePendingEmit,
        originalValue: record.pendingOriginalValue,
        record
      }));
      graph.pendingListeners.clear();
      for (const { record } of pendingDeliveries) {
        record.forcePendingEmit = false;
      }
      runCleanupSteps(pendingDeliveries.map(({ equals, finalValue, force, originalValue, record }) => () => {
        if (!record.active) {
          return;
        }
        if (!force && equals(originalValue, finalValue)) {
          return;
        }
        record.listener(finalValue, originalValue);
      }));
    };
    const schedulerRef = globalThis;
    if (typeof schedulerRef.scheduler?.yield === "function") {
      void schedulerRef.scheduler.yield().then(flush);
      return;
    }
    queueMicrotask(flush);
  }
  var OwnerClass = class {
    /** @hidden */
    constructor() {
      __publicField(this, "abortController", null);
      __publicField(this, "cleanupFunctions", /* @__PURE__ */ new Set());
      __publicField(this, "disposingValue", false);
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
     * Whether this owner is currently executing its synchronous disposal lifecycle.
     * This remains true through pre-disposal hooks, cleanup functions, and post-disposal hooks.
     * @readonly
     */
    get disposing() {
      return this.disposingValue;
    }
    /**
     * An abort signal for work scoped to this owner's lifetime.
     * The signal is created lazily, keeps a stable identity, and aborts synchronously when the owner is disposed.
     * @readonly
     */
    get signal() {
      if (this.abortController === null) {
        this.abortController = new AbortController();
        if (this.disposedValue) {
          this.abortController.abort();
        }
      }
      return this.abortController.signal;
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
      this.disposingValue = true;
      let firstError;
      let failed = false;
      const settle = (callback) => {
        try {
          callback();
        } catch (error) {
          if (!failed) {
            failed = true;
            firstError = error;
          }
        }
      };
      try {
        settle(() => this.abortController?.abort());
        settle(() => this.beforeDispose());
        const cleanupFunctions = [...this.cleanupFunctions];
        this.cleanupFunctions.clear();
        for (const cleanupFunction of cleanupFunctions) {
          settle(cleanupFunction);
        }
        settle(() => this.afterDispose());
      } finally {
        this.disposingValue = false;
      }
      if (failed) {
        throw firstError;
      }
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
  var Owner = function Owner2() {
    return Reflect.construct(OwnerClass, [], new.target ?? OwnerClass);
  };
  Owner.prototype = OwnerClass.prototype;
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
      __publicField(this, "notificationQueue", null);
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
      const notification = {
        force: forceNotify,
        immediateListeners: [...getImmediateListeners(this)],
        previousValue,
        value: nextValue
      };
      if (this.notificationQueue) {
        this.notificationQueue.push(notification);
        return this.currentValue;
      }
      const notificationQueue = [notification];
      this.notificationQueue = notificationQueue;
      try {
        for (const change of notificationQueue) {
          for (const listenerRecord of change.immediateListeners) {
            if (listenerRecord.active) listenerRecord.listener(change.value, change.previousValue);
          }
          for (const listenerRecord of getQueuedListeners(this)) {
            if (!listenerRecord.active) continue;
            if (!this.graph.pendingListeners.has(listenerRecord)) {
              listenerRecord.forcePendingEmit = change.force;
              listenerRecord.pendingOriginalValue = change.previousValue;
              listenerRecord.pendingFinalValue = change.value;
              listenerRecord.equals = getEqualityFunction(this);
              this.graph.pendingListeners.add(listenerRecord);
              scheduleGraphFlush(this.graph);
              continue;
            }
            listenerRecord.forcePendingEmit || (listenerRecord.forcePendingEmit = change.force);
            listenerRecord.pendingFinalValue = change.value;
          }
        }
      } finally {
        this.notificationQueue = null;
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
        listener,
        pendingFinalValue: this.currentValue,
        pendingOriginalValue: this.currentValue
      };
      getQueuedListeners(this).add(listenerRecord);
      return () => {
        if (!listenerRecord.active) {
          return;
        }
        listenerRecord.active = false;
        this.graph.pendingListeners.delete(listenerRecord);
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
        this.graph.pendingListeners.delete(listenerRecord);
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
      throw new Error("Modifications are not allowed after owner disposal.");
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
     * @param owner The owner managing this manipulator's cleanup.
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
     * @returns The owner of this manipulator.
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
     * @returns The owner of this manipulator.
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
     * @returns The owner of this manipulator.
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
        throw new Error("Modifications are not allowed after owner disposal.");
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
      __publicField(this, "dispatch");
      __publicField(this, "emit");
      __publicField(this, "on");
      __publicField(this, "off");
      __publicField(this, "owned");
      __publicField(this, "listenerRecords", /* @__PURE__ */ new Map());
      this.emit = this.createDispatchProxy();
      this.dispatch = this.emit;
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
    createDispatchProxy() {
      return new Proxy({}, {
        get: (_, eventName) => {
          if (typeof eventName !== "string") {
            return void 0;
          }
          return (detail, options) => {
            this.ensureEmittable();
            const { tweak, ...init } = options ?? {};
            const event = new CustomEvent(eventName, {
              ...init,
              detail
            });
            tweak?.(event);
            return this.target.dispatchEvent(event);
          };
        }
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
    ensureEmittable() {
      if (this.owner.disposed && !this.owner.disposing) {
        throw new Error("Disposed owners cannot be modified.");
      }
    }
  };

  // src/component/DOMTree.ts
  var recursiveTreeErrorMessage = "Cannot move a node into itself or one of its descendants.";
  var registrations = /* @__PURE__ */ new WeakMap();
  function registerDOMTreeNode(node, owner) {
    const registration = {
      active: true,
      owner: new WeakRef(owner)
    };
    registrations.set(node, registration);
    return registration;
  }
  function unregisterDOMTreeNode(registration) {
    registration.active = false;
  }
  function runPlacementCallbacks(placementNode, onPlaced) {
    if (!isPlacementNodeLive(placementNode)) {
      return;
    }
    onPlaced(placementNode.node);
  }
  function isRegistrationDisposed(registration) {
    return !registration.active || registration.owner.deref()?.disposed === true;
  }
  function isDisposedNode(node) {
    const registration = registrations.get(node);
    return registration ? isRegistrationDisposed(registration) : false;
  }
  function snapshotPlacementNode(node) {
    return {
      node,
      registration: registrations.get(node) ?? null
    };
  }
  function isPlacementNodeLive(placementNode) {
    const currentRegistration = registrations.get(placementNode.node) ?? null;
    if (currentRegistration !== placementNode.registration) {
      return false;
    }
    return !currentRegistration || !isRegistrationDisposed(currentRegistration);
  }
  function placementTargetNode(placement) {
    return placement.type === "append" || placement.type === "prepend" ? placement.parent : placement.reference;
  }
  function isDOMParent(value) {
    return value !== null && typeof value.insertBefore === "function";
  }
  function physicalParentOf(node) {
    return isDOMParent(node.parentNode) ? node.parentNode : null;
  }
  function physicalChildrenOf(parent) {
    const children = [];
    let child = parent.firstChild;
    while (child) {
      children.push(child);
      child = child.nextSibling;
    }
    return children;
  }
  function physicalContains(node, candidate) {
    let current = candidate;
    const visited = /* @__PURE__ */ new Set();
    while (current && !visited.has(current)) {
      if (current === node) {
        return true;
      }
      visited.add(current);
      current = resolveComposedParent(current);
    }
    return false;
  }
  function isConsumableDocumentFragment(node) {
    return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !("host" in node);
  }
  function shadowHostOf(node) {
    return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && "host" in node ? node.host : null;
  }
  function resolveComposedParent(node, parentOf = physicalParentOf) {
    return parentOf(node) ?? shadowHostOf(node);
  }
  function physicalMove(parent, node, beforeNode) {
    if (physicalContains(node, parent)) {
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
  function isPlacementTargetDisposed(placement, parentOf = physicalParentOf) {
    let current = placement.type === "append" || placement.type === "prepend" ? placement.parent : placement.reference;
    const visited = /* @__PURE__ */ new Set();
    while (current && !visited.has(current)) {
      if (isDisposedNode(current)) {
        return true;
      }
      visited.add(current);
      current = parentOf(current) ?? shadowHostOf(current);
    }
    return false;
  }
  var VirtualDOMTree = class {
    constructor(operations, excludedPlacements = /* @__PURE__ */ new Set()) {
      this.operations = operations;
      this.excludedPlacements = excludedPlacements;
      __publicField(this, "affectedParents", /* @__PURE__ */ new Set());
      __publicField(this, "deferredPlacements", /* @__PURE__ */ new Set());
      __publicField(this, "operationByNode", /* @__PURE__ */ new Map());
      __publicField(this, "lists", /* @__PURE__ */ new Map());
      __publicField(this, "virtualParents", /* @__PURE__ */ new Map());
      this.replay();
    }
    childrenOf(parent) {
      return this.initialiseParent(parent);
    }
    parentOf(node) {
      return this.getVirtualParent(node);
    }
    contains(node, candidate) {
      let current = candidate;
      const visited = /* @__PURE__ */ new Set();
      while (current && !visited.has(current)) {
        if (current === node) {
          return true;
        }
        visited.add(current);
        current = resolveComposedParent(current, (candidateNode) => this.getVirtualParent(candidateNode));
      }
      return false;
    }
    isConnected(node) {
      let current = node;
      const visited = /* @__PURE__ */ new Set();
      while (current && !visited.has(current)) {
        visited.add(current);
        const hadVirtualParent = this.virtualParents.has(current);
        const parent = this.getVirtualParent(current);
        if (parent) {
          current = parent;
          continue;
        }
        const shadowHost = shadowHostOf(current);
        if (shadowHost) {
          current = shadowHost;
          continue;
        }
        return current.nodeType === Node.DOCUMENT_NODE || !hadVirtualParent && current.isConnected;
      }
      return false;
    }
    initialiseParent(parent) {
      const existing = this.lists.get(parent);
      if (existing) {
        return existing;
      }
      const children = Array.from(parent.childNodes);
      this.lists.set(parent, children);
      for (const child of children) {
        if (!this.virtualParents.has(child)) {
          this.virtualParents.set(child, parent);
        }
      }
      return children;
    }
    getVirtualParent(node) {
      if (this.virtualParents.has(node)) {
        return this.virtualParents.get(node) ?? null;
      }
      const parent = physicalParentOf(node);
      this.virtualParents.set(node, parent);
      if (parent) {
        this.initialiseParent(parent);
      }
      return parent;
    }
    resolveDestination(placement) {
      if (placement.type === "append") {
        const children2 = this.initialiseParent(placement.parent);
        return { index: children2.length, parent: placement.parent };
      }
      if (placement.type === "prepend") {
        return { index: 0, parent: placement.parent };
      }
      const parent = this.getVirtualParent(placement.reference);
      if (!parent) {
        return null;
      }
      const children = this.initialiseParent(parent);
      const referenceIndex = children.indexOf(placement.reference);
      if (referenceIndex < 0) {
        return null;
      }
      return {
        index: placement.type === "before" ? referenceIndex : referenceIndex + 1,
        parent
      };
    }
    createsRecursiveTree(parent, node) {
      return this.contains(node, parent);
    }
    removeVirtualNode(node) {
      const parent = this.getVirtualParent(node);
      if (!parent) {
        return;
      }
      const children = this.initialiseParent(parent);
      const index = children.indexOf(node);
      if (index >= 0) {
        children.splice(index, 1);
        this.affectedParents.add(parent);
      }
      this.virtualParents.set(node, null);
    }
    replayPlacement(operation, operationIndex) {
      const targetNode = placementTargetNode(operation.placement);
      if (operation.targetRegistration && registrations.get(targetNode) !== operation.targetRegistration) {
        return;
      }
      if (isPlacementTargetDisposed(operation.placement, (node) => this.getVirtualParent(node))) {
        return;
      }
      const seenNodes = /* @__PURE__ */ new Set();
      const placementNodes = operation.nodes.flatMap((placementNode) => {
        if (!isPlacementNodeLive(placementNode)) {
          return [];
        }
        if (!isConsumableDocumentFragment(placementNode.node)) {
          return [placementNode];
        }
        return [...this.initialiseParent(placementNode.node)].map(snapshotPlacementNode).filter(isPlacementNodeLive);
      }).filter((placementNode) => {
        const latestOperation = this.operationByNode.get(placementNode.node);
        return !latestOperation || latestOperation.operationIndex <= operationIndex;
      }).filter((placementNode) => {
        if (seenNodes.has(placementNode.node)) {
          return false;
        }
        seenNodes.add(placementNode.node);
        return true;
      });
      const nodes = placementNodes.map((placementNode) => placementNode.node);
      if (nodes.length === 0) {
        return;
      }
      const reference = operation.placement.type === "before" || operation.placement.type === "after" ? operation.placement.reference : null;
      if (reference && this.getVirtualParent(reference) === null) {
        this.deferredPlacements.add(operation);
        return;
      }
      const destinationBeforeRemoval = this.resolveDestination(operation.placement);
      if (!destinationBeforeRemoval) {
        return;
      }
      if (reference !== null && nodes.includes(reference)) {
        const withoutReference = placementNodes.filter((placementNode) => placementNode.node !== reference);
        if (withoutReference.length > 0) {
          this.replayPlacement({ ...operation, nodes: withoutReference }, operationIndex);
        }
        return;
      }
      const validPlacementNodes = placementNodes.filter((placementNode) => {
        if (!this.createsRecursiveTree(destinationBeforeRemoval.parent, placementNode.node)) {
          return true;
        }
        if (!operation.reportedRecursiveNodes.has(placementNode.node)) {
          operation.reportedRecursiveNodes.add(placementNode.node);
          console.error(recursiveTreeErrorMessage);
        }
        return false;
      });
      const validNodes = validPlacementNodes.map((placementNode) => placementNode.node);
      for (const node of validNodes) {
        this.removeVirtualNode(node);
      }
      const destination = this.resolveDestination(operation.placement);
      if (!destination) {
        return;
      }
      const children = this.initialiseParent(destination.parent);
      children.splice(destination.index, 0, ...validNodes);
      for (const placementNode of validPlacementNodes) {
        const node = placementNode.node;
        this.virtualParents.set(node, destination.parent);
        this.operationByNode.set(node, { onPlaced: operation.onPlaced, operationIndex, placementNode });
      }
      this.affectedParents.add(destination.parent);
    }
    replay() {
      for (const [operationIndex, operation] of this.operations.entries()) {
        this.apply(operation, operationIndex);
      }
      this.settleDeferredPlacements();
    }
    settleDeferredPlacements() {
      let pending = [...this.deferredPlacements];
      while (pending.length > 0) {
        this.deferredPlacements.clear();
        let progressed = false;
        for (const operation of pending) {
          const placement = operation.placement;
          if ((placement.type === "before" || placement.type === "after") && this.getVirtualParent(placement.reference) !== null) {
            this.replayPlacement(operation, this.operations.indexOf(operation));
            progressed = true;
          } else {
            this.deferredPlacements.add(operation);
          }
        }
        if (!progressed) {
          return;
        }
        pending = [...this.deferredPlacements];
      }
    }
    applyIncremental(operation, operationIndex) {
      this.apply(operation, operationIndex);
      this.settleDeferredPlacements();
    }
    apply(operation, operationIndex = this.operations.length) {
      if (operation.type === "remove") {
        const latestOperation = this.operationByNode.get(operation.node);
        this.operationByNode.set(operation.node, {
          onPlaced: latestOperation?.onPlaced ?? null,
          operationIndex,
          placementNode: latestOperation?.placementNode ?? snapshotPlacementNode(operation.node)
        });
        this.removeVirtualNode(operation.node);
        return;
      }
      if (!this.excludedPlacements.has(operation)) {
        this.replayPlacement(operation, operationIndex);
      }
    }
  };
  var DOMTreeTransactionContext = class {
    constructor() {
      __publicField(this, "operations", []);
      __publicField(this, "tree", new VirtualDOMTree(this.operations));
    }
    add(operation) {
      const operationIndex = this.operations.length;
      this.operations.push(operation);
      this.tree.applyIncremental(operation, operationIndex);
    }
  };
  var DOMTreeTransactionScope = class {
    constructor(parent, context) {
      this.parent = parent;
      this.context = context;
      __publicField(this, "active", true);
    }
    add(operation) {
      this.context.add(operation);
    }
    commit() {
      if (!this.active) {
        return;
      }
      if (activeScopes.at(-1) !== this) {
        throw new Error("DOM tree transactions must close in stack order.");
      }
      this.active = false;
      activeScopes.pop();
      if (this.parent) {
        return;
      }
      commitOperations(this.context.operations, createVirtualTree(this.context.operations));
    }
  };
  var activeScopes = [];
  function currentScope() {
    return activeScopes.at(-1) ?? null;
  }
  function currentTree() {
    return currentScope()?.context.tree ?? null;
  }
  function createPlacementOperation(nodes, placement, onPlaced) {
    return {
      nodes: nodes.map(snapshotPlacementNode),
      onPlaced,
      placement,
      reportedRecursiveNodes: /* @__PURE__ */ new Set(),
      targetRegistration: registrations.get(placementTargetNode(placement)) ?? null,
      type: "place"
    };
  }
  function createVirtualTree(operations) {
    const excludedPlacements = /* @__PURE__ */ new Set();
    while (true) {
      const tree = new VirtualDOMTree(operations, excludedPlacements);
      let changed = false;
      for (const operation of operations) {
        if (operation.type !== "place" || excludedPlacements.has(operation)) {
          continue;
        }
        if (operation.placement.type !== "before" && operation.placement.type !== "after") {
          continue;
        }
        const reference = operation.placement.reference;
        if (operation.targetRegistration !== null && registrations.get(reference) !== operation.targetRegistration || isDisposedNode(reference) || tree.parentOf(reference) === null) {
          excludedPlacements.add(operation);
          changed = true;
        }
      }
      if (!changed) {
        return tree;
      }
    }
  }
  function placePhysically(nodes, placement, onPlaced) {
    if (isPlacementTargetDisposed(placement)) {
      return;
    }
    const parent = placement.type === "append" || placement.type === "prepend" ? placement.parent : physicalParentOf(placement.reference);
    if (!parent) {
      return;
    }
    const seen = /* @__PURE__ */ new Set();
    const placementNodes = nodes.flatMap((node) => isConsumableDocumentFragment(node) ? Array.from(node.childNodes) : [node]).map(snapshotPlacementNode).filter(isPlacementNodeLive).filter(({ node }) => {
      if (seen.has(node)) return false;
      seen.add(node);
      return placement.type !== "before" && placement.type !== "after" || node !== placement.reference;
    }).filter(({ node }) => {
      if (!physicalContains(node, parent)) return true;
      console.error(recursiveTreeErrorMessage);
      return false;
    });
    if (placementNodes.length === 0) return;
    const nodeSet = new Set(placementNodes.map(({ node }) => node));
    const current = physicalChildrenOf(parent);
    const remaining = current.filter((node) => !nodeSet.has(node));
    let insertionIndex;
    if (placement.type === "append") insertionIndex = remaining.length;
    else if (placement.type === "prepend") insertionIndex = 0;
    else {
      const referenceIndex = remaining.indexOf(placement.reference);
      if (referenceIndex < 0) return;
      insertionIndex = placement.type === "before" ? referenceIndex : referenceIndex + 1;
    }
    const anchor = remaining[insertionIndex] ?? null;
    const desired = [...remaining.slice(0, insertionIndex), ...placementNodes.map(({ node }) => node), ...remaining.slice(insertionIndex)];
    const alreadySatisfied = current.length === desired.length && current.every((node, index) => node === desired[index]);
    const placedNodes = [];
    for (const placementNode of placementNodes) {
      const node = placementNode.node;
      if (alreadySatisfied || physicalMove(parent, node, anchor)) {
        placedNodes.push(placementNode);
      }
    }
    runCleanupSteps(placedNodes.map((placementNode) => () => {
      if (physicalParentOf(placementNode.node) === parent) {
        runPlacementCallbacks(placementNode, onPlaced);
      }
    }));
  }
  function removeImmediately(node) {
    if (!node.parentNode) {
      return;
    }
    node.parentNode.removeChild(node);
  }
  function commitOperations(operations, tree = createVirtualTree(operations)) {
    if (operations.length === 0) {
      return;
    }
    const failedMoves = /* @__PURE__ */ new Set();
    const plans = [...tree.affectedParents].map((parent) => {
      const current = Array.from(parent.childNodes);
      const desired = tree.childrenOf(parent).filter((node) => !isDisposedNode(node));
      return {
        current,
        desired,
        parent,
        retained: longestRetainedSubsequence(current, desired, tree.operationByNode)
      };
    });
    for (const plan of plans) {
      let anchor = null;
      for (let index = plan.desired.length - 1; index >= 0; index -= 1) {
        const node = plan.desired[index];
        if (!tree.operationByNode.has(node)) {
          anchor = node;
          continue;
        }
        if (plan.retained.has(node) && node.parentNode === plan.parent) {
          anchor = node;
          continue;
        }
        if (node.parentNode === plan.parent && node.nextSibling === anchor) {
          anchor = node;
          continue;
        }
        if (physicalMove(plan.parent, node, anchor)) {
          failedMoves.delete(node);
          anchor = node;
        } else {
          failedMoves.add(node);
        }
      }
      for (const node of plan.current) {
        if (tree.operationByNode.has(node) && tree.parentOf(node) === null && node.parentNode === plan.parent) {
          node.parentNode?.removeChild(node);
        }
      }
    }
    const effectivePlacements = [...tree.operationByNode.values()].filter((placement) => placement.onPlaced !== null).sort((left, right) => left.operationIndex - right.operationIndex);
    runCleanupSteps(effectivePlacements.map((placement) => () => {
      const node = placement.placementNode.node;
      const parent = tree.parentOf(node);
      if (!parent || failedMoves.has(node) || physicalParentOf(node) !== parent || !isPlacementNodeLive(placement.placementNode)) {
        return;
      }
      runPlacementCallbacks(placement.placementNode, placement.onPlaced);
    }));
  }
  function longestIncreasingNodes(entries) {
    const tails = [];
    const previous = new Array(entries.length).fill(-1);
    for (let index2 = 0; index2 < entries.length; index2 += 1) {
      let low = 0;
      let high = tails.length;
      while (low < high) {
        const middle = low + high >> 1;
        if (entries[tails[middle]].currentIndex < entries[index2].currentIndex) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }
      if (low > 0) {
        previous[index2] = tails[low - 1];
      }
      tails[low] = index2;
    }
    const retained = /* @__PURE__ */ new Set();
    if (tails.length === 0) {
      return retained;
    }
    let index = tails[tails.length - 1];
    while (index >= 0) {
      retained.add(entries[index].node);
      index = previous[index];
    }
    return retained;
  }
  function longestRetainedSubsequence(current, desired, movable) {
    const desiredNodes = new Set(desired);
    const retained = new Set(current.filter((node) => !movable.has(node) && desiredNodes.has(node)));
    const currentIndexes = new Map(current.map((node, index) => [node, index]));
    const currentSegments = /* @__PURE__ */ new Map();
    let segment = 0;
    for (const node of current) {
      if (!movable.has(node) && desiredNodes.has(node)) {
        segment += 1;
        continue;
      }
      if (movable.has(node)) {
        currentSegments.set(node, segment);
      }
    }
    const entriesBySegment = /* @__PURE__ */ new Map();
    segment = 0;
    for (const node of desired) {
      if (!movable.has(node) && retained.has(node)) {
        segment += 1;
        continue;
      }
      const currentIndex = currentIndexes.get(node);
      if (currentIndex === void 0 || currentSegments.get(node) !== segment) {
        continue;
      }
      const entries = entriesBySegment.get(segment) ?? [];
      entries.push({ currentIndex, node });
      entriesBySegment.set(segment, entries);
    }
    for (const entries of entriesBySegment.values()) {
      for (const node of longestIncreasingNodes(entries)) {
        retained.add(node);
      }
    }
    return retained;
  }
  function beginDOMTreeTransaction() {
    const parent = currentScope();
    const scope = new DOMTreeTransactionScope(parent, parent?.context ?? new DOMTreeTransactionContext());
    activeScopes.push(scope);
    return scope;
  }
  var DOMTree = {
    get active() {
      return activeScopes.length > 0;
    },
    parentOf(node) {
      const tree = currentTree();
      return tree ? tree.parentOf(node) : physicalParentOf(node);
    },
    composedParentOf(node) {
      const tree = currentTree();
      return resolveComposedParent(node, (candidate) => tree ? tree.parentOf(candidate) : physicalParentOf(candidate));
    },
    childrenOf(parent) {
      return [...currentTree()?.childrenOf(parent) ?? Array.from(parent.childNodes)];
    },
    firstChildOf(parent) {
      return this.childrenOf(parent)[0] ?? null;
    },
    nextSiblingOf(node) {
      const parent = this.parentOf(node);
      if (!parent) {
        return null;
      }
      const children = this.childrenOf(parent);
      const index = children.indexOf(node);
      return index < 0 ? null : children[index + 1] ?? null;
    },
    contains(node, candidate) {
      return currentTree()?.contains(node, candidate) ?? physicalContains(node, candidate);
    },
    isConnected(node) {
      return currentTree()?.isConnected(node) ?? node.isConnected;
    },
    canPlace(nodes, placement) {
      const tree = currentTree();
      if (isPlacementTargetDisposed(placement, (node) => tree ? tree.parentOf(node) : physicalParentOf(node))) return false;
      const parent = placement.type === "append" || placement.type === "prepend" ? placement.parent : tree?.parentOf(placement.reference) ?? physicalParentOf(placement.reference);
      if (!parent) return false;
      for (const node of nodes) {
        if (this.contains(node, parent)) {
          console.error(recursiveTreeErrorMessage);
          return false;
        }
      }
      return true;
    },
    place(nodes, placement, onPlaced = () => {
    }) {
      const liveNodes = nodes.filter((node) => !isDisposedNode(node));
      if (liveNodes.length === 0) {
        return;
      }
      const operation = createPlacementOperation(liveNodes, placement, onPlaced);
      const scope = currentScope();
      if (scope) {
        scope.add(operation);
        return;
      }
      placePhysically(liveNodes, placement, onPlaced);
    },
    remove(node) {
      const scope = currentScope();
      if (scope) {
        scope.add({ node, type: "remove" });
        return;
      }
      removeImmediately(node);
    },
    physical: {
      parentOf: physicalParentOf,
      childrenOf(parent) {
        return Array.from(parent.childNodes);
      },
      place: placePhysically,
      remove(node) {
        removeImmediately(node);
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
      if (claim.disposed) {
        throw new Error("Disposed owners cannot be modified.");
      }
      if (id === null) {
        const record2 = this.createClaimRecord(id, claim);
        this.anonymousClaims.add(record2);
        this.trackClaimant(record2);
        try {
          record2.activate();
        } catch (error) {
          cleanupAndRethrow(error, record2.cleanup);
        }
        if (this.anonymousClaims.has(record2)) {
          this.onClaimsChanged();
        }
        return;
      }
      const record = this.createClaimRecord(id, claim);
      const previousClaim = this.keyedClaims.get(id);
      this.keyedClaims.set(id, record);
      this.trackClaimant(record);
      try {
        record.activate();
      } catch (error) {
        if (previousClaim) {
          this.keyedClaims.set(id, previousClaim);
        } else {
          this.keyedClaims.delete(id);
        }
        cleanupAndRethrow(error, record.cleanup);
      }
      const recordSurvivedActivation = this.keyedClaims.get(id) === record;
      previousClaim?.cleanup();
      if (recordSurvivedActivation) {
        this.onClaimsChanged();
      }
    }
    /** Returns the claimant registered in a keyed slot, if any. */
    getRegisteredClaimant(id) {
      return this.keyedClaims.get(id)?.claimant ?? null;
    }
    /** Returns whether the claimant has an anonymous registration. */
    hasAnonymousClaim(claimant) {
      return [...this.claimsByClaimant.get(claimant) ?? []].some((record) => record.id === null);
    }
    /** Returns every registered claimant in keyed-then-anonymous order. */
    getRegisteredClaimants() {
      return [
        ...this.keyedClaims.values(),
        ...this.anonymousClaims
      ].map((record) => record.claimant);
    }
    /** Runs after the registered claim set changes. */
    onClaimsChanged(_disposedClaimantRemoved = false) {
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
        this.onClaimsChanged(record.claimant.disposed);
      };
      record = isBooleanStateClaim(claim) ? this.createStateClaimRecord(id, claim, releaseClaimRecord) : this.createOwnerClaimRecord(id, claim, releaseClaimRecord);
      return record;
    }
    createOwnerClaimRecord(id, claim, onCleanup) {
      const record = {
        id,
        claimant: claim,
        active: false,
        activate: noop4,
        cleanup: noop4
      };
      let active = false;
      let releaseOwner = noop4;
      let releaseClaim = noop4;
      const cleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        runCleanupSteps([
          () => this.setClaimActive(record, false),
          onCleanup,
          releaseOwner,
          releaseClaim
        ]);
      };
      record.cleanup = cleanup;
      record.activate = () => {
        if (active) {
          return;
        }
        active = true;
        releaseOwner = this.owner.onCleanup(cleanup);
        if (!active) {
          releaseOwner();
          return;
        }
        releaseClaim = claim.onCleanup(cleanup);
        if (!active) {
          releaseClaim();
          return;
        }
        this.setClaimActive(record, true);
      };
      return record;
    }
    createStateClaimRecord(id, claim, onCleanup) {
      const record = {
        id,
        claimant: claim,
        active: false,
        activate: noop4,
        cleanup: noop4
      };
      let active = false;
      let releaseOwner = noop4;
      let releaseClaim = noop4;
      let releaseClaimOwner = noop4;
      const cleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        runCleanupSteps([
          () => this.setClaimActive(record, false),
          onCleanup,
          releaseOwner,
          releaseClaim,
          releaseClaimOwner
        ]);
      };
      record.cleanup = cleanup;
      record.activate = () => {
        if (active) {
          return;
        }
        active = true;
        releaseOwner = this.owner.onCleanup(cleanup);
        if (!active) {
          releaseOwner();
          return;
        }
        releaseClaimOwner = claim.onCleanup(cleanup);
        if (!active) {
          releaseClaimOwner();
          return;
        }
        releaseClaim = claim.subscribe(this.owner, (value) => {
          if (!active) {
            return;
          }
          this.setClaimActive(record, value);
        });
        if (!active) {
          releaseClaim();
          return;
        }
        this.setClaimActive(record, claim.value);
      };
      return record;
    }
    cleanupMatchingClaims(records, predicate) {
      if (!records) {
        return;
      }
      const matchingRecords = [...records].filter((record) => !predicate || predicate(record));
      runCleanupSteps(matchingRecords.map((record) => record.cleanup));
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
  var OwnerManipulator = class extends GenericClaimManipulator {
    constructor(owner, refreshManagement) {
      super(owner);
      this.refreshManagement = refreshManagement;
    }
    /**
     * Adds an explicit owner claim to the host.
     * A non-null id replaces any previous claim registered in the same slot.
     * Anonymous claims are deduplicated by owner.
     * @param owner Explicit owner to register.
     * @param id Optional keyed claim slot.
     * @returns The owning host for fluent chaining.
     * @throws If the host attempts to own itself.
     */
    add(owner, id = null) {
      if (this.owner.disposed || owner.disposed) {
        throw new Error("Disposed owners cannot be modified.");
      }
      if (owner === this.owner) {
        throw new Error("An owner cannot own itself.");
      }
      if (id === null) {
        if (this.hasAnonymousClaim(owner)) {
          return this.owner;
        }
      } else if (this.getRegisteredClaimant(id) === owner) {
        return this.owner;
      }
      this.registerClaim(id, owner);
      return this.owner;
    }
    remove(idOrOwner, owner) {
      if (owner !== void 0) {
        this.deregisterClaim(idOrOwner, owner);
        return this.owner;
      }
      if (typeof idOrOwner === "string") {
        this.deregisterClaim(idOrOwner);
        return this.owner;
      }
      if (idOrOwner !== null) {
        this.deregisterClaim(idOrOwner);
      }
      return this.owner;
    }
    /**
     * Returns one explicit owner if any are registered.
     * When multiple owners are present, which owner is returned is not guaranteed.
     * @returns One explicit owner or null when no owners are registered.
     */
    get() {
      return this.getRegisteredClaimants()[0] ?? null;
    }
    /**
     * Returns every currently registered explicit owner without duplicates.
     * @returns All explicit owners currently managing the host.
     */
    getAll() {
      return [...new Set(this.getRegisteredClaimants())];
    }
    onClaimsChanged(disposedOwnerRemoved = false) {
      this.refreshManagement();
      if (disposedOwnerRemoved && this.getAll().length === 0 && !this.owner.disposed) {
        this.owner.remove();
      }
    }
  };

  // src/component/PlacementAuthority.ts
  var authorities = /* @__PURE__ */ new WeakMap();
  var authoringGenerations = /* @__PURE__ */ new WeakMap();
  var nextAuthoringGeneration = 0;
  function releaseRecord(record, preservePosition) {
    if (record.active) {
      record.active = false;
      record.preservePosition = preservePosition;
      if (authorities.get(record.node) === record) {
        authorities.delete(record.node);
      }
    }
    const cleanup = record.cleanup;
    if (cleanup) {
      record.cleanup = null;
      cleanup(record.preservePosition);
    }
  }
  function installPlacementAuthority(node, owner, generation) {
    const previous = authorities.get(node);
    const record = {
      active: true,
      cleanup: null,
      cleanupAssigned: false,
      node,
      owner,
      preservePosition: true
    };
    authoringGenerations.set(node, generation);
    authorities.set(node, record);
    previous && releaseRecord(previous, true);
    return {
      owner,
      node,
      isCurrent: () => record.active && authorities.get(node) === record,
      relinquish: () => {
        if (!record.active) return;
        record.active = false;
        if (authorities.get(node) === record) authorities.delete(node);
        record.cleanup = null;
      },
      release: (preservePosition = false) => releaseRecord(record, preservePosition),
      setCleanup: (cleanup) => {
        if (record.cleanupAssigned) {
          throw new Error("Placement authority cleanup can only be assigned once.");
        }
        record.cleanupAssigned = true;
        record.cleanup = cleanup;
        if (!record.active || authorities.get(node) !== record) {
          releaseRecord(record, true);
        }
      }
    };
  }
  function createPlacementAuthorityAuthor() {
    const generation = ++nextAuthoringGeneration;
    return {
      claim: (node, owner = null) => {
        if ((authoringGenerations.get(node) ?? 0) > generation) {
          return null;
        }
        return installPlacementAuthority(node, owner, generation);
      }
    };
  }
  function replacePlacementAuthority(node, owner = null) {
    return installPlacementAuthority(node, owner, ++nextAuthoringGeneration);
  }
  function releasePlacementAuthority(node, preservePosition = true) {
    const authority = authorities.get(node);
    if (authority) {
      releaseRecord(authority, preservePosition);
    }
  }
  function placementAuthorityOwner(node) {
    const authority = authorities.get(node);
    return authority?.active ? authority.owner : null;
  }

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
    if (DOMTree.isConnected(node)) {
      return true;
    }
    let current = node;
    while (current) {
      const wrappedOwner = getWrappedNodeOwner(current);
      if (wrappedOwner && isManagedOwner(wrappedOwner, visitedOwners)) {
        return true;
      }
      current = DOMTree.composedParentOf(current);
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
      __publicField(this, "domTreeRegistration");
      __publicField(this, "useHooks", /* @__PURE__ */ new Set());
      __publicField(this, "mounted", false);
      __publicField(this, "orphanCheckId", null);
      installNodeMarkerAccessor();
      this.node = document.createComment(id);
      markers.set(this.node, new WeakRef(this));
      this.domTreeRegistration = registerDOMTreeNode(this.node, this);
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
      this.ensureActive();
      this.useHooks.add({
        onMount,
        onDispose,
        cleanup: void 0,
        disposePending: false,
        mounting: false,
        settled: false
      });
      return this;
    }
    beforeDispose() {
      const useHooks = [...this.useHooks];
      this.useHooks.clear();
      runCleanupSteps([
        () => this.node.dispatchEvent(new CustomEvent("Dispose")),
        () => releasePlacementAuthority(this.node, true),
        ...useHooks.map((hook) => () => {
          if (hook.mounting) {
            hook.disposePending = true;
            return;
          }
          this.settleUseHook(hook);
        }),
        () => this.clearOrphanCheck(),
        () => {
          if (getLiveMarker(this.node) === this) {
            markers.delete(this.node);
          }
        },
        () => unregisterDOMTreeNode(this.domTreeRegistration)
      ]);
    }
    afterDispose() {
      DOMTree.remove(this.node);
    }
    /** @internal */
    dispatchMount() {
      if (this.mounted) {
        return;
      }
      this.mounted = true;
      const useHooks = [...this.useHooks];
      runCleanupSteps([
        () => this.node.dispatchEvent(new CustomEvent("Mount")),
        ...useHooks.map((hook) => () => {
          if (this.disposed) {
            return;
          }
          hook.mounting = true;
          let cleanup;
          runCleanupSteps([
            () => {
              cleanup = hook.onMount();
            },
            () => {
              hook.mounting = false;
              hook.cleanup = cleanup;
              if (this.disposed || hook.disposePending) {
                this.settleUseHook(hook);
              }
            }
          ]);
        })
      ]);
    }
    settleUseHook(hook) {
      if (hook.settled) {
        return;
      }
      hook.settled = true;
      const cleanup = hook.cleanup;
      const onDispose = hook.onDispose;
      hook.cleanup = void 0;
      hook.onDispose = void 0;
      runCleanupSteps([
        () => cleanup?.(),
        () => onDispose?.()
      ]);
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
        this.refreshPlacementOwner();
        if (this.isManaged()) {
          this.dispatchMount();
          return;
        }
        throw new Error(orphanedMarkerErrorMessage);
      });
    }
    /** @internal Updates Kitsui-derived placement ownership from the current virtual tree. */
    refreshPlacementOwner() {
      let current = DOMTree.parentOf(this.node);
      while (current) {
        const owner = getWrappedNodeOwner(current);
        if (owner && owner !== this) {
          this.owner.add(owner, "placement");
          return;
        }
        current = DOMTree.composedParentOf(current);
      }
      this.owner.remove("placement");
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
        if (!cleanup) {
          return;
        }
        if (marker.disposed) {
          cleanup();
          return;
        }
        marker.event.owned.on.Dispose(cleanup);
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
    Style2.Container = createStyleContainerFactory({});
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
  function assertQueryExpression(expression) {
    if (expression.length < 2 || !expression.startsWith("(") || !expression.endsWith(")")) {
      throw new Error(`Query expression '${expression}' must start with '(' and end with ')'.`);
    }
  }
  function spreadableContainerQuery(containerName, query2, definition) {
    return spreadableQuery(`@container ${containerName} ${query2}`, definition);
  }
  function createStyleContainerFactory(capabilities) {
    const factory = {};
    const descriptors = {
      inlineSize: {
        get: () => createStyleContainerFactory({ ...capabilities, size: "inline-size" })
      },
      scrollState: {
        get: () => createStyleContainerFactory({ ...capabilities, scrollState: true })
      },
      size: {
        get: () => createStyleContainerFactory({ ...capabilities, size: "size" })
      },
      style: {
        get: () => createStyleContainerFactory({ ...capabilities, style: true })
      }
    };
    if (capabilities.size || capabilities.style === true || capabilities.scrollState === true) {
      descriptors.name = {
        value: (name) => createStyleContainer(name, capabilities)
      };
    }
    Object.defineProperties(factory, descriptors);
    return Object.freeze(factory);
  }
  function createStyleContainer(name, options) {
    if (!name.trim() || name !== name.trim() || ["and", "none", "not", "or"].includes(name.toLowerCase())) {
      throw new Error(`Container name '${name}' must be a non-empty CSS custom identifier and cannot be 'none', 'and', 'not', or 'or'.`);
    }
    if (options.size !== void 0 && options.size !== "inline-size" && options.size !== "size") {
      throw new Error(`Container '${name}' has unsupported size query capability '${options.size}'.`);
    }
    if (!options.size && options.style !== true && options.scrollState !== true) {
      throw new Error(`Container '${name}' must support at least one query capability.`);
    }
    const containerTypes = [options.size, options.scrollState === true ? "scroll-state" : void 0].filter((value) => value !== void 0);
    const containerDefinition = { containerName: name };
    if (containerTypes.length > 0) {
      containerDefinition.containerType = containerTypes.join(" ");
    }
    const methodDefinitions = {};
    if (options.size) {
      methodDefinitions.query = {
        value: (expression, definition) => {
          assertQueryExpression(expression);
          return spreadableContainerQuery(name, expression, definition);
        }
      };
    }
    if (options.style === true) {
      methodDefinitions.style = {
        value: (expression, definition) => {
          assertQueryExpression(expression);
          return spreadableContainerQuery(name, `style(${expression})`, definition);
        }
      };
      methodDefinitions.styleProperty = {
        value: (propertyName, value, definition) => {
          return spreadableContainerQuery(name, `style(${toCssPropertyName(propertyName)}: ${expandVariableAccessShorthand(value)})`, definition);
        }
      };
    }
    if (options.scrollState === true) {
      methodDefinitions.scrollState = {
        value: (expression, definition) => {
          assertQueryExpression(expression);
          return spreadableContainerQuery(name, `scroll-state(${expression})`, definition);
        }
      };
      for (const feature of ["scrolled", "scrollable", "snapped"]) {
        methodDefinitions[feature] = {
          value: (value, definition) => {
            return spreadableContainerQuery(name, `scroll-state(${feature}: ${value})`, definition);
          }
        };
      }
      methodDefinitions.stuck = {
        value: (sideOrDefinition, definition) => {
          if (typeof sideOrDefinition === "string") {
            return spreadableContainerQuery(name, `scroll-state(stuck: ${sideOrDefinition})`, definition);
          }
          return spreadableContainerQuery(name, "scroll-state((stuck: left) or (stuck: right) or (stuck: top) or (stuck: bottom))", sideOrDefinition);
        }
      };
    }
    Object.defineProperties(containerDefinition, methodDefinitions);
    return Object.freeze(containerDefinition);
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
  function mediaQuery(expression, definition) {
    assertQueryExpression(expression);
    return spreadableQuery(`@media ${expression}`, definition);
  }
  function lightScheme(definition) {
    return mediaQuery("(prefers-color-scheme: light)", definition);
  }
  function darkScheme(definition) {
    return mediaQuery("(prefers-color-scheme: dark)", definition);
  }
  function whenOpen(definition) {
    return spreadableSelector(":open", definition);
  }
  function whenClosed(definition) {
    return spreadableSelector(":not(:open)", definition);
  }

  // src/component/ClassManipulator.ts
  var noop5 = () => {
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
     * @returns The owner of this manipulator.
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
     * @returns The owner of this manipulator.
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
     * @returns The owner of this manipulator.
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
     * @returns The owner of this manipulator.
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
        throw new Error("Modifications are not allowed after owner disposal.");
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
        return noop5;
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
        return noop5;
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
            apply: noop5,
            cleanup: noop5
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
      }) ?? noop5;
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

  // src/component/StyleManipulator.ts
  var noop6 = () => {
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
     * @param owner The owner managing this manipulator's lifecycle.
     * @param element The element whose inline styles are controlled.
     */
    constructor(owner, element) {
      this.owner = owner;
      this.element = element;
      __publicField(this, "layers", []);
    }
    /**
     * Sets inline styles from a direct definition or a subscribable definition source.
     * Each property can also be driven by its own subscribable value.
     * Nullish property values remove that property from the inline style attribute.
     * @param value Direct or reactive inline style definition.
     * @returns The owner of this manipulator.
     */
    set(value) {
      this.ensureActive();
      const definitionSource = toStyleAttributeSource(value);
      const layer = {
        active: true,
        properties: /* @__PURE__ */ new Map(),
        releaseDefinition: noop6,
        releaseSource: noop6
      };
      this.layers.push(layer);
      const applyDefinition = (definition) => {
        if (!layer.active) {
          return;
        }
        this.releaseLayerProperties(layer);
        layer.releaseDefinition = this.installDefinition(layer, definition);
      };
      applyDefinition(definitionSource.value);
      layer.releaseSource = definitionSource.subscribe(this.owner, (nextValue) => {
        applyDefinition(nextValue);
      });
      this.owner.onCleanup(() => {
        this.releaseLayer(layer);
      });
      return this.owner;
    }
    installDefinition(layer, definition) {
      if (!definition) {
        return noop6;
      }
      const cleanups = [];
      for (const [propertyName, input] of Object.entries(definition)) {
        const valueSource = toStyleValueSource(input);
        const property = {
          cleanup: noop6,
          value: valueSource.value
        };
        layer.properties.set(propertyName, property);
        this.writeResolvedProperty(propertyName);
        property.cleanup = valueSource.subscribe(this.owner, (nextValue) => {
          if (!layer.active || layer.properties.get(propertyName) !== property) {
            return;
          }
          property.value = nextValue;
          this.writeResolvedProperty(propertyName);
        });
        cleanups.push(property.cleanup);
      }
      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    }
    releaseLayerProperties(layer) {
      layer.releaseDefinition();
      layer.releaseDefinition = noop6;
      const propertyNames = new Set(layer.properties.keys());
      layer.properties.clear();
      for (const propertyName of propertyNames) {
        this.writeResolvedProperty(propertyName);
      }
    }
    releaseLayer(layer) {
      if (!layer.active) {
        return;
      }
      layer.active = false;
      layer.releaseSource();
      layer.releaseSource = noop6;
      this.releaseLayerProperties(layer);
    }
    writeResolvedProperty(propertyName) {
      for (let index = this.layers.length - 1; index >= 0; index--) {
        const layer = this.layers[index];
        if (!layer.active) {
          continue;
        }
        const property = layer.properties.get(propertyName);
        if (!property) {
          continue;
        }
        this.writeProperty(propertyName, property.value);
        return;
      }
      this.writeProperty(propertyName, null);
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
        throw new Error("Modifications are not allowed after owner disposal.");
      }
    }
  };

  // src/component/GenericPropertyManipulator.ts
  var noop7 = () => {
  };
  var GenericPropertyManipulator = class {
    constructor(owner) {
      this.owner = owner;
      __publicField(this, "determiner", null);
    }
    /**
     * Sets the property from a direct value or subscribable source.
     * @param value Direct or reactive property input.
     * @returns The owner of this manipulator.
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
     * @returns The owner of this manipulator.
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
      let cleanup = noop7;
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
        throw new Error("Modifications are not allowed after owner disposal.");
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

  // src/component/Component.ts
  var noop8 = () => {
  };
  var orphanedComponentErrorMessage = "Components must be connected to the document or have a managed owner before the next tick.";
  var shadowPlacementOwnerClaim = "kitsui:shadow-placement";
  var elementComponents = /* @__PURE__ */ new WeakMap();
  var componentOwnerResolvers = /* @__PURE__ */ new Set();
  var componentAccessorInstalled = false;
  function createStatefulChildController() {
    let cleanup = () => {
    };
    const controller = {
      active: true,
      author: createPlacementAuthorityAuthor(),
      authorities: /* @__PURE__ */ new Map(),
      cleanup: (preservePosition = false) => {
        if (!controller.active) return;
        controller.active = false;
        cleanup(preservePosition);
      },
      setCleanup: (nextCleanup) => {
        cleanup = nextCleanup;
        if (!controller.active) nextCleanup(true);
      },
      onSuppressed: null
    };
    return controller;
  }
  function claimStatefulChildComponentSelection(components, owner, token) {
    const controlledComponents = [];
    for (const component of components) {
      if (!token.active) break;
      if (token.authorities.get(component.element)?.isCurrent()) {
        controlledComponents.push(component);
        continue;
      }
      const authority = token.author.claim(component.element, owner);
      if (!authority) {
        token.onSuppressed?.(component);
        continue;
      }
      token.authorities.set(component.element, authority);
      authority.setCleanup((preservePosition) => {
        if (token.authorities.get(component.element) !== authority) return;
        token.authorities.delete(component.element);
        if (token.onSuppressed) token.onSuppressed(component);
        else token.cleanup(preservePosition);
      });
      if (!authority.isCurrent()) continue;
      component["refreshOrphanCheck"]();
      controlledComponents.push(component);
    }
    return controlledComponents;
  }
  function claimStatefulNode(node, owner, token) {
    if (!token.active || token.authorities.get(node)?.isCurrent()) return;
    const authority = token.author.claim(node, owner);
    if (!authority) {
      token.cleanup(true);
      return;
    }
    token.authorities.set(node, authority);
    authority.setCleanup((preservePosition) => {
      if (token.authorities.get(node) !== authority) return;
      token.authorities.delete(node);
      token.cleanup(preservePosition);
    });
  }
  function releaseStatefulNode(node, token) {
    const authority = token.authorities.get(node);
    if (!authority) return;
    authority.relinquish();
    token.authorities.delete(node);
  }
  function releaseStatefulChildController(component, token) {
    releaseStatefulNode(component.element, token);
    component["refreshOrphanCheck"]();
  }
  function createStorageElement(documentRef) {
    return documentRef.createElement("kitsui-storage");
  }
  function moveKnownComponent(component, parent, beforeNode, onMoved = noop8) {
    const placement = beforeNode ? { type: "before", reference: beforeNode } : { type: "append", parent };
    DOMTree.place([component.element], placement, () => {
      onMoved(component);
    });
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
  function refreshPlacedNode(node) {
    const component = node.component;
    component?.["refreshPlacementOwner"]();
    component?.["refreshOrphanCheck"]();
    const marker = node.marker;
    marker?.["refreshPlacementOwner"]();
    marker?.["refreshOrphanCheck"]();
  }
  function dispatchPlacedNodeMount(node) {
    node.component?.["dispatchMount"]();
    node.marker?.["dispatchMount"]();
  }
  function snapshotDirectInsertedNodes(node) {
    return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !("host" in node) ? Array.from(node.childNodes) : [node];
  }
  function ownerResolvesForComponent(owner, visitedComponents = /* @__PURE__ */ new Set()) {
    if (!owner || owner.disposed) {
      return false;
    }
    if (owner instanceof ComponentClass) {
      return owner["isManaged"](visitedComponents);
    }
    return true;
  }
  function resolveExternalComponentManager(component, ignoredOwner, physicalOwnershipBoundary) {
    const visitedComponents = /* @__PURE__ */ new Set([component]);
    let current = DOMTree.composedParentOf(component.element);
    while (current) {
      if (current === physicalOwnershipBoundary) {
        break;
      }
      const wrappedOwner = getWrappedNodeOwner2(current);
      if (wrappedOwner !== ignoredOwner && ownerResolvesForComponent(wrappedOwner, visitedComponents)) {
        return { kind: "physical", owner: wrappedOwner, resolverManaged: false };
      }
      current = DOMTree.composedParentOf(current);
    }
    const explicitOwner = component.owner.getAll().find((owner) => owner !== ignoredOwner && ownerResolvesForComponent(owner, visitedComponents));
    if (explicitOwner) {
      return { kind: "other", owner: explicitOwner, resolverManaged: false };
    }
    const statefulChildOwner = placementAuthorityOwner(component.element);
    if (statefulChildOwner !== ignoredOwner && ownerResolvesForComponent(statefulChildOwner ?? null, visitedComponents)) {
      return { kind: "other", owner: statefulChildOwner, resolverManaged: false };
    }
    for (const resolver of componentOwnerResolvers) {
      const resolvedOwner = resolver(component);
      if (resolvedOwner !== ignoredOwner && ownerResolvesForComponent(resolvedOwner, visitedComponents)) {
        return { kind: "other", owner: resolvedOwner, resolverManaged: true };
      }
    }
    return null;
  }
  function retainManagedComponent(component, action) {
    if (action !== "detach") {
      return;
    }
    DOMTree.remove(component.element);
    component["refreshOrphanCheck"]();
  }
  function managedChildNodes(node) {
    const childNodes = new Set(isDOMParent(node) ? DOMTree.childrenOf(node) : Array.from(node.childNodes));
    if (node instanceof HTMLElement && node.shadowRoot) {
      for (const childNode of DOMTree.childrenOf(node.shadowRoot)) {
        childNodes.add(childNode);
      }
    }
    return [...childNodes];
  }
  function pendingManagedChildNodes(node, settledNodes, includeDetachedPhysicalChildren) {
    const pendingNodes = [];
    const visitedNodes = /* @__PURE__ */ new Set();
    const visit = (parent, includeDetachedChildren = false) => {
      const childNodes = new Set(managedChildNodes(parent));
      if (includeDetachedChildren && isDOMParent(parent)) {
        for (const childNode of DOMTree.physical.childrenOf(parent)) {
          if (DOMTree.parentOf(childNode) === null) {
            childNodes.add(childNode);
          }
        }
      }
      for (const childNode of childNodes) {
        if (visitedNodes.has(childNode)) {
          continue;
        }
        visitedNodes.add(childNode);
        if (!settledNodes.has(childNode)) {
          pendingNodes.push(childNode);
          continue;
        }
        const component = childNode instanceof HTMLElement ? getLiveComponent(childNode) : void 0;
        if (!component || component.disposed) {
          visit(childNode);
        }
      }
    };
    visit(node, includeDetachedPhysicalChildren);
    return pendingNodes;
  }
  function* managedChildCleanupSteps(node, options, includeDetachedPhysicalChildren = false) {
    const settledNodes = /* @__PURE__ */ new Set();
    while (true) {
      const pendingNodes = pendingManagedChildNodes(node, settledNodes, includeDetachedPhysicalChildren);
      if (pendingNodes.length === 0) {
        return;
      }
      for (const childNode of pendingNodes) {
        settledNodes.add(childNode);
        yield () => disposeManagedNode(childNode, options);
      }
    }
  }
  function disposeManagedNode(node, options = {}) {
    if (node instanceof HTMLElement) {
      const component = getLiveComponent(node);
      if (component && !component.disposed) {
        const externalManager = options.ignoredOwner && resolveExternalComponentManager(
          component,
          options.ignoredOwner,
          options.physicalOwnershipBoundary
        );
        if (externalManager) {
          const retainedAction = externalManager.kind === "physical" ? options.retainedPhysicalComponentAction ?? options.retainedComponentAction ?? "leave" : options.retainedComponentAction ?? "leave";
          retainManagedComponent(component, retainedAction);
          if (externalManager.resolverManaged) {
            component["bindRetainedResolverOwner"](externalManager.owner);
          }
          return;
        }
        component.remove();
        return;
      }
    }
    runCleanupSteps(managedChildCleanupSteps(node, options));
  }
  function releaseStatefulChildComponent(component, owner, token, physicalOwnershipBoundary) {
    releaseStatefulChildController(component, token);
    if (component.disposed) {
      return;
    }
    disposeManagedNode(component.element, {
      ignoredOwner: owner,
      physicalOwnershipBoundary,
      retainedComponentAction: "detach",
      retainedPhysicalComponentAction: "leave"
    });
  }
  var ComponentClass = class _ComponentClass extends Owner {
    constructor(tagNameOrElement) {
      super();
      /**
       * The underlying DOM element managed by this component.
       */
      __publicField(this, "element");
      __publicField(this, "domTreeRegistration");
      __publicField(this, "structuralCleanups", /* @__PURE__ */ new Set());
      __publicField(this, "mounted", false);
      __publicField(this, "orphanCheckId", null);
      __publicField(this, "retainedResolverOwner", null);
      __publicField(this, "releaseRetainedResolverOwner", noop8);
      installNodeComponentAccessor();
      this.element = typeof tagNameOrElement === "string" ? document.createElement(tagNameOrElement) : tagNameOrElement;
      if (getLiveComponent(this.element)) {
        throw new Error("This node already has a component. Use node.component to retrieve it.");
      }
      elementComponents.set(this.element, new WeakRef(this));
      this.domTreeRegistration = registerDOMTreeNode(this.element, this);
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
      const preparedChildren = this.prepareComponentChildren(this.expandChildren(children), false);
      this.processPreparedChildren(preparedChildren, (prepared) => {
        const { child } = prepared;
        if (this.disposed) {
          this.disposePreparedChild(prepared);
          return;
        }
        if (isComponentSelectionState(child)) {
          this.attachStatefulChildren(child, {
            getContainer: () => this.element,
            getReferenceNode: () => null
          }, prepared.controller, prepared.controlledComponents);
          return;
        }
        const node = this.resolveNode(child);
        const insertedNodes = snapshotDirectInsertedNodes(node);
        if (!DOMTree.canPlace(insertedNodes, { type: "append", parent: this.element })) return;
        for (const insertedNode of insertedNodes) replacePlacementAuthority(insertedNode);
        DOMTree.place([node], { type: "append", parent: this.element }, dispatchPlacedNodeMount);
        for (const insertedNode of insertedNodes) refreshPlacedNode(insertedNode);
      });
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
      const preparedChildren = this.prepareComponentChildren(this.expandChildren(children), false);
      let referenceNode = DOMTree.firstChildOf(this.element);
      this.processPreparedChildren(preparedChildren, (prepared) => {
        const { child } = prepared;
        if (this.disposed) {
          this.disposePreparedChild(prepared);
          return;
        }
        if (referenceNode && DOMTree.parentOf(referenceNode) !== this.element) {
          referenceNode = DOMTree.firstChildOf(this.element);
        }
        if (isComponentSelectionState(child)) {
          this.attachStatefulChildren(child, {
            getContainer: () => this.element,
            getReferenceNode: () => referenceNode
          }, prepared.controller, prepared.controlledComponents);
          return;
        }
        const node = this.resolveNode(child);
        const placement = referenceNode ? { type: "before", reference: referenceNode } : { type: "append", parent: this.element };
        const insertedNodes = snapshotDirectInsertedNodes(node);
        if (!DOMTree.canPlace(insertedNodes, placement)) return;
        for (const insertedNode of insertedNodes) replacePlacementAuthority(insertedNode);
        DOMTree.place([node], placement, dispatchPlacedNodeMount);
        for (const insertedNode of insertedNodes) refreshPlacedNode(insertedNode);
        const lastInsertedNode = insertedNodes[insertedNodes.length - 1];
        if (lastInsertedNode && DOMTree.parentOf(lastInsertedNode) === this.element) {
          referenceNode = DOMTree.nextSiblingOf(lastInsertedNode);
        }
      });
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
      const parentNode = DOMTree.parentOf(this.element);
      if (!isDOMParent(parentNode)) {
        throw new Error("Insert target was not found.");
      }
      const orderedInsertables = where === "before" ? insertables : [...insertables].reverse();
      const preparedInsertables = this.prepareComponentChildren(orderedInsertables, false);
      this.processPreparedChildren(preparedInsertables, (prepared) => {
        const { child: node } = prepared;
        if (this.disposed) {
          this.disposePreparedChild(prepared);
          return;
        }
        if (isComponentSelectionState(node)) {
          this.attachStatefulChildren(node, {
            getContainer: () => DOMTree.parentOf(this.element),
            getReferenceNode: () => where === "before" ? this.element : DOMTree.nextSiblingOf(this.element)
          }, prepared.controller, prepared.controlledComponents);
          return;
        }
        const resolvedNode = this.resolveNode(node);
        const insertedNodes = snapshotDirectInsertedNodes(resolvedNode);
        if (!DOMTree.canPlace(insertedNodes, { type: where, reference: this.element })) return;
        for (const insertedNode of insertedNodes) replacePlacementAuthority(insertedNode);
        DOMTree.place([resolvedNode], { type: where, reference: this.element }, dispatchPlacedNodeMount);
        for (const insertedNode of insertedNodes) refreshPlacedNode(insertedNode);
      });
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
      const preparedNodes = this.prepareComponentChildren(this.expandConditionalChildren(nodes), true);
      this.processPreparedChildren(preparedNodes, (prepared) => {
        const { child: node } = prepared;
        if (this.disposed) {
          this.disposePreparedChild(prepared);
          return;
        }
        if (isComponentSelectionState(node)) {
          this.attachConditionalSelectionState(state2, node, {
            getContainer: () => this.element,
            getReferenceNode: () => null
          }, prepared.controller, prepared.controlledComponents);
          return;
        }
        this.attachConditionalNode(state2, node, {
          getContainer: () => this.element,
          getReferenceNode: () => null
        }, prepared.controller);
      });
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
      const referenceNode = DOMTree.firstChildOf(this.element);
      const preparedNodes = this.prepareComponentChildren(this.expandConditionalChildren(nodes), true);
      this.processPreparedChildren(preparedNodes, (prepared) => {
        const { child: node } = prepared;
        if (this.disposed) {
          this.disposePreparedChild(prepared);
          return;
        }
        if (isComponentSelectionState(node)) {
          this.attachConditionalSelectionState(state2, node, {
            getContainer: () => this.element,
            getReferenceNode: () => referenceNode
          }, prepared.controller, prepared.controlledComponents);
          return;
        }
        this.attachConditionalNode(state2, node, {
          getContainer: () => this.element,
          getReferenceNode: () => referenceNode
        }, prepared.controller);
      });
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
      const insertables = this.expandConditionalChildren(nodes);
      const orderedInsertables = where === "before" ? insertables : [...insertables].reverse();
      const preparedInsertables = this.prepareComponentChildren(orderedInsertables, true);
      this.processPreparedChildren(preparedInsertables, (prepared) => {
        const { child: node } = prepared;
        if (this.disposed) {
          this.disposePreparedChild(prepared);
          return;
        }
        if (isComponentSelectionState(node)) {
          this.attachConditionalSelectionState(state2, node, {
            getContainer: () => DOMTree.parentOf(this.element),
            getReferenceNode: () => where === "before" ? this.element : DOMTree.nextSiblingOf(this.element)
          }, prepared.controller, prepared.controlledComponents);
          return;
        }
        this.attachConditionalNode(state2, node, {
          getContainer: () => DOMTree.parentOf(this.element),
          getReferenceNode: () => where === "before" ? this.element : DOMTree.nextSiblingOf(this.element)
        }, prepared.controller);
      });
      return this;
    }
    attachConditionalSelectionState(visibleState, selectionState, options, controller, initialComponents) {
      const marker = Marker("kitsui:conditional-stateful").owner.add(this);
      const storage = createStorageElement(this.element.ownerDocument);
      let active = true;
      let rendering = false;
      let markerWasInserted = false;
      let renderedComponents = [];
      let releaseVisibleSubscription = noop8;
      let releaseSelectionSubscription = noop8;
      const retainedHiddenComponents = /* @__PURE__ */ new Set();
      const getPhysicalOwnershipBoundary = () => DOMTree.parentOf(marker.node);
      controller.onSuppressed = (component) => {
        renderedComponents = renderedComponents.filter((rendered) => rendered !== component);
        retainedHiddenComponents.delete(component);
      };
      renderedComponents = claimStatefulChildComponentSelection(initialComponents, this, controller);
      const cleanupRenderedComponents = (nextComponents = /* @__PURE__ */ new Set(), mode = "dispose") => {
        const cleanupSteps = [];
        for (const component of renderedComponents) {
          if (nextComponents.has(component)) {
            retainedHiddenComponents.delete(component);
            continue;
          }
          if (mode === "dispose") {
            retainedHiddenComponents.delete(component);
            cleanupSteps.push(() => releaseStatefulChildComponent(component, this, controller, getPhysicalOwnershipBoundary()));
            continue;
          }
          if (component.disposed) {
            releaseStatefulChildController(component, controller);
            continue;
          }
          retainedHiddenComponents.add(component);
          moveKnownComponent(component, storage, null);
        }
        renderedComponents = renderedComponents.filter((component) => nextComponents.has(component) && !component.disposed);
        runCleanupSteps(cleanupSteps);
      };
      const releaseRetainedHiddenComponents = (nextComponents) => {
        const cleanupSteps = [];
        for (const component of [...retainedHiddenComponents]) {
          if (nextComponents.has(component)) {
            continue;
          }
          retainedHiddenComponents.delete(component);
          cleanupSteps.push(() => releaseStatefulChildComponent(component, this, controller, getPhysicalOwnershipBoundary()));
        }
        runCleanupSteps(cleanupSteps);
      };
      const forgetDisposedComponent = (component) => {
        releaseStatefulChildController(component, controller);
        retainedHiddenComponents.delete(component);
        renderedComponents = renderedComponents.filter((rendered) => rendered !== component);
      };
      const releaseUntrackedClaims = (components) => {
        const trackedComponents = /* @__PURE__ */ new Set([...renderedComponents, ...retainedHiddenComponents]);
        runCleanupSteps(components.filter((component) => !trackedComponents.has(component)).map((component) => () => releaseStatefulChildController(component, controller)));
      };
      const render = () => {
        if (!active || rendering) {
          return;
        }
        rendering = true;
        try {
          const nextComponents = claimStatefulChildComponentSelection(
            this.resolveComponentSelection(selectionState.value),
            this,
            controller
          );
          if (!active || !controller.active) return;
          const nextComponentSet = new Set(nextComponents);
          try {
            const container = options.getContainer();
            if (!isDOMParent(container)) {
              if (markerWasInserted) {
                this.remove();
                return;
              }
              const cleanupMode2 = visibleState.value ? "dispose" : "retain";
              cleanupRenderedComponents(nextComponentSet, cleanupMode2);
              if (!active) {
                return;
              }
              if (visibleState.value) {
                releaseRetainedHiddenComponents(nextComponentSet);
              }
              renderedComponents = [...nextComponents];
              for (const component of nextComponents) {
                if (!active) {
                  return;
                }
                if (component.disposed) {
                  forgetDisposedComponent(component);
                  continue;
                }
                retainedHiddenComponents.delete(component);
                moveKnownComponent(component, storage, null);
              }
              return;
            }
            if (markerWasInserted && DOMTree.parentOf(marker.node) !== container) {
              this.remove();
              return;
            }
            if (DOMTree.parentOf(marker.node) !== container) {
              const reference = options.getReferenceNode();
              DOMTree.place([marker.node], reference ? { type: "before", reference } : { type: "append", parent: container }, () => {
                markerWasInserted = true;
              });
            }
            const cleanupMode = visibleState.value ? "dispose" : "retain";
            cleanupRenderedComponents(nextComponentSet, cleanupMode);
            if (!active) {
              return;
            }
            if (visibleState.value) {
              releaseRetainedHiddenComponents(nextComponentSet);
            }
            renderedComponents = [...nextComponents];
            if (visibleState.value) {
              for (const component of nextComponents) {
                if (!active) {
                  return;
                }
                if (component.disposed) {
                  forgetDisposedComponent(component);
                  continue;
                }
                retainedHiddenComponents.delete(component);
                moveKnownComponent(component, container, marker.node, (movedComponent) => {
                  movedComponent.refreshOrphanCheck();
                  movedComponent.dispatchMount();
                });
              }
            } else {
              for (const component of nextComponents) {
                if (!active) {
                  return;
                }
                if (component.disposed) {
                  forgetDisposedComponent(component);
                  continue;
                }
                retainedHiddenComponents.delete(component);
                moveKnownComponent(component, storage, null);
              }
            }
          } catch (error) {
            cleanupAndRethrow(error, () => releaseUntrackedClaims(nextComponents));
          }
        } finally {
          rendering = false;
        }
      };
      const cleanup = this.trackStructuralCleanup((preservePosition = false) => {
        const cleanupComponents = /* @__PURE__ */ new Set([...renderedComponents, ...retainedHiddenComponents]);
        active = false;
        renderedComponents = [];
        retainedHiddenComponents.clear();
        runCleanupSteps([
          releaseVisibleSubscription,
          releaseSelectionSubscription,
          ...[...cleanupComponents].map((component) => () => preservePosition ? releaseStatefulChildController(component, controller) : releaseStatefulChildComponent(component, this, controller, getPhysicalOwnershipBoundary())),
          () => marker.remove(),
          () => DOMTree.remove(storage)
        ]);
      });
      controller.setCleanup(cleanup);
      try {
        releaseVisibleSubscription = visibleState.subscribe(this, render);
        if (!active) {
          releaseVisibleSubscription();
          return cleanup;
        }
        releaseSelectionSubscription = selectionState.subscribe(this, render);
        if (!active) {
          releaseSelectionSubscription();
          return cleanup;
        }
        render();
      } catch (error) {
        cleanupAndRethrow(error, cleanup);
      }
      return cleanup;
    }
    /**
     * Clears all child nodes from this component.
     * @returns This component for chaining.
     */
    clear() {
      this.ensureActive();
      runCleanupSteps([
        () => this.releaseStructuralCleanups(),
        () => runCleanupSteps(managedChildCleanupSteps(this.element, {
          ignoredOwner: this,
          retainedComponentAction: "detach"
        })),
        () => runCleanupSteps(DOMTree.childrenOf(this.element).map((childNode) => () => DOMTree.remove(childNode)))
      ]);
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
      runCleanupSteps([
        () => this.element.dispatchEvent(new CustomEvent("Dispose")),
        () => releasePlacementAuthority(this.element, true),
        () => this.clearOrphanCheck(),
        () => this.releaseStructuralCleanups(),
        this.releaseRetainedResolverOwner,
        () => unregisterDOMTreeNode(this.domTreeRegistration)
      ]);
    }
    afterDispose() {
      try {
        runCleanupSteps([
          () => DOMTree.remove(this.element),
          () => runCleanupSteps(managedChildCleanupSteps(this.element, {
            ignoredOwner: this,
            retainedComponentAction: "leave"
          }, true))
        ]);
      } finally {
        if (getLiveComponent(this.element) === this) {
          elementComponents.delete(this.element);
        }
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
        this.refreshPlacementOwner();
        if (this.isManaged()) {
          this.dispatchMount();
          return;
        }
        throw new Error(orphanedComponentErrorMessage);
      });
    }
    refreshPlacementOwner() {
      let current = DOMTree.parentOf(this.element);
      let crossedShadowBoundary = false;
      while (current) {
        if (current instanceof HTMLElement) {
          const owner = current.component;
          if (owner && owner !== this) {
            if (crossedShadowBoundary) this.owner.add(owner, shadowPlacementOwnerClaim);
            else this.owner.remove(shadowPlacementOwnerClaim);
            return;
          }
        }
        const parent = DOMTree.parentOf(current);
        if (parent) {
          current = parent;
          continue;
        }
        const composedParent = DOMTree.composedParentOf(current);
        if (!composedParent) break;
        crossedShadowBoundary = true;
        current = composedParent;
      }
      this.owner.remove(shadowPlacementOwnerClaim);
    }
    bindRetainedResolverOwner(owner) {
      if (this.disposed || this.retainedResolverOwner === owner) {
        return;
      }
      this.releaseRetainedResolverOwner();
      this.retainedResolverOwner = owner;
      let active = true;
      let releaseComponent = noop8;
      let releaseOwner = noop8;
      const release = () => {
        if (!active) {
          return;
        }
        active = false;
        if (this.retainedResolverOwner === owner) {
          this.retainedResolverOwner = null;
          this.releaseRetainedResolverOwner = noop8;
        }
        releaseComponent();
        releaseOwner();
      };
      this.releaseRetainedResolverOwner = release;
      releaseComponent = this.onCleanup(release);
      releaseOwner = owner.onCleanup(() => {
        release();
        if (this.disposed) {
          return;
        }
        for (const resolver of componentOwnerResolvers) {
          const nextOwner = resolver(this);
          if (ownerResolvesForComponent(nextOwner)) {
            this.bindRetainedResolverOwner(nextOwner);
            return;
          }
        }
        if (!this.isManaged()) {
          this.remove();
        }
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
        this.refreshPlacementOwner();
        if (this.isManaged()) {
          this.dispatchMount();
          return;
        }
        this.remove();
      });
    }
    isManaged(visitedComponents = /* @__PURE__ */ new Set()) {
      if (DOMTree.isConnected(this.element)) {
        return true;
      }
      if (visitedComponents.has(this)) {
        return false;
      }
      visitedComponents.add(this);
      if (this.owner.getAll().some((owner) => this.ownerResolves(owner, visitedComponents))) {
        return true;
      }
      if (this.ownerResolves(placementAuthorityOwner(this.element), visitedComponents)) {
        return true;
      }
      let current = DOMTree.composedParentOf(this.element);
      while (current) {
        if (this.ownerResolves(getWrappedNodeOwner2(current), visitedComponents)) {
          return true;
        }
        current = DOMTree.composedParentOf(current);
      }
      for (const resolver of componentOwnerResolvers) {
        if (this.ownerResolves(resolver(this), visitedComponents)) {
          return true;
        }
      }
      return false;
    }
    ownerResolves(owner, visitedComponents) {
      return ownerResolvesForComponent(owner, visitedComponents);
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
    expandConditionalChildren(children) {
      return this.expandChildren(children).flatMap((child) => {
        if (child instanceof Node && child.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !("host" in child)) {
          return Array.from(child.childNodes);
        }
        return [child];
      });
    }
    processPreparedChildren(preparedChildren, process) {
      for (const preparedChild of preparedChildren) {
        process(preparedChild);
      }
    }
    prepareComponentChildren(children, controlDirectComponents) {
      const prepared = children.map((child) => {
        if (isComponentSelectionState(child)) {
          return {
            child,
            controller: createStatefulChildController(),
            controlledComponents: this.resolveComponentSelection(child.value)
          };
        }
        if (controlDirectComponents) {
          return {
            child,
            controller: createStatefulChildController(),
            controlledComponents: child instanceof _ComponentClass ? [child] : []
          };
        }
        return { child, controller: null, controlledComponents: [] };
      });
      return prepared;
    }
    disposePreparedChild(prepared) {
      const settledComponents = /* @__PURE__ */ new Set();
      if (prepared.controller) {
        for (let index = 0; index < prepared.controlledComponents.length; index += 1) {
          const component = prepared.controlledComponents[index];
          settledComponents.add(component);
          try {
            releaseStatefulChildComponent(component, this, prepared.controller);
          } catch (error) {
            const pendingClaimReleases = prepared.controlledComponents.slice(index + 1).map((pending) => () => releaseStatefulChildController(pending, prepared.controller));
            cleanupAndRethrow(error, () => runCleanupSteps(pendingClaimReleases));
          }
        }
      }
      const cleanupSteps = [];
      const { child } = prepared;
      if (isComponentSelectionState(child)) {
        cleanupSteps.push(() => runCleanupSteps(this.resolveComponentSelection(child.value).filter((component) => !settledComponents.has(component)).map((component) => () => disposeManagedNode(component.element, { ignoredOwner: this }))));
        runCleanupSteps(cleanupSteps);
        return;
      }
      if (child instanceof _ComponentClass) {
        if (!settledComponents.has(child)) {
          cleanupSteps.push(() => disposeManagedNode(child.element, { ignoredOwner: this }));
        }
        runCleanupSteps(cleanupSteps);
        return;
      }
      const node = this.resolveNode(child);
      cleanupSteps.push(() => runCleanupSteps([
        () => disposeManagedNode(node, { ignoredOwner: this }),
        () => DOMTree.remove(node)
      ]));
      runCleanupSteps(cleanupSteps);
    }
    trackStructuralCleanup(cleanup) {
      let active = true;
      let releaseOwnerCleanup = noop8;
      const trackedCleanup = (preservePosition = false) => {
        if (!active) {
          return;
        }
        active = false;
        this.structuralCleanups.delete(trackedCleanup);
        runCleanupSteps([releaseOwnerCleanup, () => cleanup(preservePosition)]);
      };
      this.structuralCleanups.add(trackedCleanup);
      releaseOwnerCleanup = this.onCleanup(trackedCleanup);
      return trackedCleanup;
    }
    releaseStructuralCleanups() {
      const structuralCleanups = [...this.structuralCleanups];
      runCleanupSteps(structuralCleanups);
    }
    attachConditionalNode(state2, node, options, controller) {
      if (!node && node !== "") {
        return noop8;
      }
      const childComponent = node instanceof _ComponentClass ? node : null;
      const resolvedNode = this.resolveNode(node);
      claimStatefulNode(resolvedNode, this, controller);
      if (!controller.active) return noop8;
      const initialContainer = options.getContainer();
      if (isDOMParent(initialContainer) && DOMTree.contains(resolvedNode, initialContainer)) {
        console.error(recursiveTreeErrorMessage);
        releaseStatefulNode(resolvedNode, controller);
        return noop8;
      }
      const placeholder = Marker("kitsui:conditional").owner.add(this);
      const storage = createStorageElement(this.element.ownerDocument);
      let active = true;
      let releaseChildCleanup = noop8;
      let placeholderWasInserted = false;
      let stateCleanup = noop8;
      const getSafeReferenceNode = (container) => {
        const referenceNode = options.getReferenceNode();
        if (!referenceNode) {
          return null;
        }
        return DOMTree.parentOf(referenceNode) === container ? referenceNode : null;
      };
      const removeOwnerForMissingMarker = () => {
        if (!active) {
          return;
        }
        this.remove();
      };
      const ensurePlaceholder = () => {
        const container = options.getContainer();
        if (!isDOMParent(container)) {
          if (placeholderWasInserted) {
            removeOwnerForMissingMarker();
          }
          return null;
        }
        if (!placeholderWasInserted) {
          const reference = getSafeReferenceNode(container);
          DOMTree.place([placeholder.node], reference ? { type: "before", reference } : { type: "append", parent: container }, () => {
            placeholderWasInserted = true;
          });
          return container;
        }
        if (DOMTree.parentOf(placeholder.node) !== container) {
          removeOwnerForMissingMarker();
          return null;
        }
        return container;
      };
      const placeVisible = () => {
        if (!active) {
          return;
        }
        const initialContainer2 = options.getContainer();
        if (isDOMParent(initialContainer2) && DOMTree.contains(resolvedNode, initialContainer2)) {
          console.error(recursiveTreeErrorMessage);
          return;
        }
        const container = ensurePlaceholder();
        if (!active) {
          return;
        }
        if (!container) {
          if (childComponent) {
            moveKnownComponent(childComponent, storage, null);
          } else {
            DOMTree.place([resolvedNode], { type: "append", parent: storage });
          }
          return;
        }
        if (childComponent) {
          moveKnownComponent(childComponent, container, placeholder.node, (movedComponent) => {
            movedComponent.refreshOrphanCheck();
            movedComponent.dispatchMount();
          });
        } else {
          DOMTree.place([resolvedNode], { type: "before", reference: placeholder.node });
        }
      };
      const placeHidden = () => {
        if (!active) {
          return;
        }
        const initialContainer2 = options.getContainer();
        if (isDOMParent(initialContainer2) && DOMTree.contains(resolvedNode, initialContainer2)) {
          console.error(recursiveTreeErrorMessage);
          return;
        }
        const container = ensurePlaceholder();
        if (!active) {
          return;
        }
        if (!container) {
          if (DOMTree.parentOf(resolvedNode) !== storage) {
            if (childComponent) {
              moveKnownComponent(childComponent, storage, null);
            } else {
              DOMTree.place([resolvedNode], { type: "append", parent: storage });
            }
          }
          return;
        }
        if (DOMTree.parentOf(resolvedNode) !== storage) {
          if (childComponent) {
            moveKnownComponent(childComponent, storage, null);
          } else {
            DOMTree.place([resolvedNode], { type: "append", parent: storage });
          }
        }
      };
      const cleanup = this.trackStructuralCleanup((preservePosition = false) => {
        const physicalOwnershipBoundary = DOMTree.parentOf(placeholder.node);
        active = false;
        runCleanupSteps([
          stateCleanup,
          releaseChildCleanup,
          () => placeholder.remove(),
          () => DOMTree.remove(storage),
          childComponent ? () => preservePosition ? releaseStatefulChildController(childComponent, controller) : releaseStatefulChildComponent(childComponent, this, controller, physicalOwnershipBoundary) : () => {
            releaseStatefulNode(resolvedNode, controller);
            if (!preservePosition) DOMTree.remove(resolvedNode);
          }
        ]);
      });
      controller.setCleanup(cleanup);
      if (childComponent) {
        releaseChildCleanup = childComponent.onCleanup(cleanup);
      }
      try {
        stateCleanup = state2.subscribe(this, (nextVisible) => {
          if (nextVisible) {
            placeVisible();
            return;
          }
          placeHidden();
        });
        if (!active) {
          stateCleanup();
          return cleanup;
        }
        if (state2.value) {
          placeVisible();
        } else {
          placeHidden();
        }
      } catch (error) {
        cleanupAndRethrow(error, cleanup);
      }
      return cleanup;
    }
    attachStatefulChildren(state2, options, controller, initialComponents) {
      const marker = Marker("kitsui:stateful-child").owner.add(this);
      let active = true;
      let rendering = false;
      let renderedComponents = [];
      let markerWasInserted = false;
      let stateCleanup = noop8;
      const getPhysicalOwnershipBoundary = () => DOMTree.parentOf(marker.node);
      controller.onSuppressed = (component) => {
        renderedComponents = renderedComponents.filter((rendered) => rendered !== component);
      };
      renderedComponents = claimStatefulChildComponentSelection(initialComponents, this, controller);
      const cleanupRenderedComponents = (nextComponents = /* @__PURE__ */ new Set()) => {
        const cleanupSteps = [];
        for (const component of renderedComponents) {
          if (nextComponents.has(component)) {
            continue;
          }
          cleanupSteps.push(() => releaseStatefulChildComponent(component, this, controller, getPhysicalOwnershipBoundary()));
        }
        renderedComponents = renderedComponents.filter((component) => nextComponents.has(component) && !component.disposed);
        runCleanupSteps(cleanupSteps);
      };
      const forgetDisposedComponent = (component) => {
        releaseStatefulChildController(component, controller);
        renderedComponents = renderedComponents.filter((rendered) => rendered !== component);
      };
      const releaseUntrackedClaims = (components) => {
        const trackedComponents = new Set(renderedComponents);
        runCleanupSteps(components.filter((component) => !trackedComponents.has(component)).map((component) => () => releaseStatefulChildController(component, controller)));
      };
      const renderSelection = (selection) => {
        if (!active || rendering) {
          return;
        }
        rendering = true;
        try {
          const nextComponents = claimStatefulChildComponentSelection(
            this.resolveComponentSelection(selection),
            this,
            controller
          );
          if (!active || !controller.active) return;
          const nextComponentSet = new Set(nextComponents);
          try {
            const container = options.getContainer();
            if (!isDOMParent(container)) {
              if (markerWasInserted) {
                this.remove();
                return;
              }
              cleanupRenderedComponents();
              return;
            }
            if (markerWasInserted && DOMTree.parentOf(marker.node) !== container) {
              this.remove();
              return;
            }
            if (DOMTree.parentOf(marker.node) !== container) {
              const reference = options.getReferenceNode();
              DOMTree.place([marker.node], reference ? { type: "before", reference } : { type: "append", parent: container }, () => {
                markerWasInserted = true;
              });
            }
            cleanupRenderedComponents(nextComponentSet);
            if (!active) {
              return;
            }
            renderedComponents = [...nextComponents];
            for (const component of nextComponents) {
              if (!active) {
                return;
              }
              if (component.disposed) {
                forgetDisposedComponent(component);
                continue;
              }
              moveKnownComponent(component, container, marker.node, (movedComponent) => {
                movedComponent.refreshOrphanCheck();
                movedComponent.dispatchMount();
              });
            }
          } catch (error) {
            cleanupAndRethrow(error, () => releaseUntrackedClaims(nextComponents));
          }
        } finally {
          rendering = false;
        }
      };
      const cleanup = this.trackStructuralCleanup((preservePosition = false) => {
        const cleanupComponents = [...renderedComponents];
        renderedComponents = [];
        active = false;
        runCleanupSteps([
          stateCleanup,
          ...cleanupComponents.map((component) => () => preservePosition ? releaseStatefulChildController(component, controller) : releaseStatefulChildComponent(component, this, controller, getPhysicalOwnershipBoundary())),
          () => marker.remove()
        ]);
      });
      controller.setCleanup(cleanup);
      try {
        stateCleanup = state2.subscribe(this, renderSelection);
        if (!active) {
          stateCleanup();
          return cleanup;
        }
        renderSelection(state2.value);
      } catch (error) {
        cleanupAndRethrow(error, cleanup);
      }
      return cleanup;
    }
    resolveComponentSelection(selection) {
      if (!selection) {
        return [];
      }
      if (selection instanceof _ComponentClass) {
        return selection.disposed ? [] : [selection];
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
        if (item.disposed) {
          continue;
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
  var noop9 = () => {
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
    if (component.disposed) {
      throw new Error("Component.Breakdown part builders must return an active Component.");
    }
    if (component.owner.get() !== null) {
      throw new Error("Component.Breakdown part builders must return an ownerless Component.");
    }
    if (DOMTree.parentOf(component.element) !== null) {
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
      let releaseOwnerCleanup = noop9;
      let releaseStateSubscription = noop9;
      const removePart = (key, record = parts.get(key)) => {
        if (!record || parts.get(key) !== record) {
          return;
        }
        parts.delete(key);
        runCleanupSteps([
          () => record.state?.dispose(),
          () => record.component.remove()
        ]);
      };
      const cleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        runCleanupSteps([
          releaseOwnerCleanup,
          releaseStateSubscription,
          ...[...parts].map(([key, record]) => () => removePart(key, record))
        ]);
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
            const treeTransaction = beginDOMTreeTransaction();
            let renderError;
            let renderFailed = false;
            try {
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
                  cleanupAndRethrow(error, () => partState?.dispose());
                }
                try {
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
                } catch (error) {
                  const pendingRecord = parts.get(key);
                  if (pendingRecord?.component === component) {
                    parts.delete(key);
                  }
                  cleanupAndRethrow(error, () => runCleanupSteps([
                    () => partState?.dispose(),
                    () => component.remove()
                  ]));
                }
                return component;
              };
              breakdown(Part, currentValue);
              runCleanupSteps([...parts].filter(([key]) => !seenKeys.has(key)).map(([key, record]) => () => removePart(key, record)));
            } catch (error) {
              renderFailed = true;
              renderError = error;
            }
            try {
              treeTransaction.commit();
            } catch (commitError) {
              if (!renderFailed) {
                throw commitError;
              }
              try {
                console.error("Breakdown transaction commit failed after render cleanup.", commitError);
              } catch {
              }
            }
            if (renderFailed) {
              throw renderError;
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
  var noop10 = () => {
  };
  var placementLifecycleOwners = /* @__PURE__ */ new WeakMap();
  var componentClass2 = null;
  var patched3 = false;
  function getComponentClass2() {
    componentClass2 ?? (componentClass2 = Component.extend());
    return componentClass2;
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
  function isPlaceState(value) {
    return typeof value === "object" && value !== null && "value" in value && typeof value.subscribe === "function";
  }
  function getPlacementLifecycleOwner(component) {
    const existingOwner = placementLifecycleOwners.get(component);
    if (existingOwner) {
      return existingOwner;
    }
    const owner = Owner();
    placementLifecycleOwners.set(component, owner);
    component.onCleanup(() => {
      placementLifecycleOwners.delete(component);
      owner.dispose();
    });
    return owner;
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
    if (isDOMParent(target)) {
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
      const parent = DOMTree.parentOf(current);
      if (parent) {
        current = parent;
        continue;
      }
      const composedParent = DOMTree.composedParentOf(current);
      if (composedParent) {
        current = composedParent;
        continue;
      }
      return null;
    }
    return null;
  }
  function resolveOwnPlacementOwner(component) {
    if (!component) {
      return null;
    }
    return component.owner.get() ?? placementAuthorityOwner(component.element);
  }
  function resolvePlacementOwner(target, component) {
    if (!target) {
      return null;
    }
    if (isComponent2(target)) {
      return target === component ? resolveOwnPlacementOwner(component) : target;
    }
    if (target instanceof Marker) {
      return target;
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
  function resolveConditionalPlacementOwner(target, component) {
    if (isComponent2(target)) {
      return target === component ? component.owner.get() : target;
    }
    if (target instanceof Marker || target instanceof PlaceClass || !target) {
      return resolvePlacementOwner(target, component);
    }
    const owner = resolveNearestWrappedAncestor(target);
    return owner === component ? component.owner.get() : owner;
  }
  function toPlaceSource(state2, place) {
    const placeState = State(place.owner, state2.value ? place : null);
    state2.subscribe(place.marker, (value) => {
      placeState.set(value ? place : null);
    });
    return placeState;
  }
  function movePlacedComponent(component, placement, onMoved) {
    DOMTree.place([component.element], placement, () => onMoved(component));
  }
  function reconcileComponentPlacementOwner(component) {
    component["refreshPlacementOwner"]();
  }
  function reconcileMarkerPlacementOwner(marker, owner) {
    if (owner) marker.owner.add(owner, "placement");
    else marker.owner.remove("placement");
  }
  function placeComponent(component, placement) {
    if (!DOMTree.canPlace([component.element], placement)) return;
    replacePlacementAuthority(component.element);
    movePlacedComponent(component, placement, (movedComponent) => {
      reconcileComponentPlacementOwner(movedComponent);
      movedComponent["refreshOrphanCheck"]();
      movedComponent["dispatchMount"]();
    });
    reconcileComponentPlacementOwner(component);
    component["refreshOrphanCheck"]();
  }
  function placeMarker(marker, placement, resolveOwner) {
    const authority = replacePlacementAuthority(marker.node, resolveOwner());
    DOMTree.place([marker.node], placement, () => {
      if (!authority.isCurrent()) return;
      reconcileMarkerPlacementOwner(marker, resolveOwner());
      marker["refreshOrphanCheck"]();
      marker["dispatchMount"]();
    });
    if (marker.disposed) return;
    reconcileMarkerPlacementOwner(marker, resolveOwner());
    marker["refreshOrphanCheck"]();
  }
  function controlPlacement(component, placementOwner, placeState, places, authority) {
    const storage = createStorageElement2(component.element.ownerDocument);
    let releaseOwnerCleanup = noop10;
    let releaseStateCleanup = noop10;
    let controllerActive = true;
    const cleanup = (preservePosition = false) => {
      if (!controllerActive) return;
      controllerActive = false;
      runCleanupSteps([
        releaseOwnerCleanup,
        releaseStateCleanup,
        () => {
          if (!preservePosition && isDOMParent(storage)) {
            movePlacedComponent(component, { type: "append", parent: storage }, () => {
            });
          }
        },
        ...[...places].map((place) => () => place.remove()),
        () => DOMTree.remove(storage),
        () => component["disposeIfUnmanagedAfterPlacementCleanup"]()
      ]);
    };
    authority.setCleanup(cleanup);
    const syncPlace = (place) => {
      if (!authority.isCurrent()) return;
      if (!place) {
        movePlacedComponent(component, { type: "append", parent: storage }, () => {
        });
        component["refreshOrphanCheck"]();
        return;
      }
      const parentNode = DOMTree.parentOf(place.marker.node);
      if (!isDOMParent(parentNode)) {
        console.error("Placement marker was removed. Treating placement as null.");
        movePlacedComponent(component, { type: "append", parent: storage }, () => {
        });
        component["refreshOrphanCheck"]();
        return;
      }
      if (DOMTree.contains(component.element, parentNode)) {
        console.error(recursiveTreeErrorMessage);
        return;
      }
      movePlacedComponent(component, { type: "before", reference: place.marker.node }, (movedComponent) => {
        movedComponent["dispatchMount"]();
      });
      reconcileComponentPlacementOwner(component);
      component["refreshOrphanCheck"]();
    };
    try {
      releaseOwnerCleanup = placementOwner.onCleanup(() => authority.release(false));
    } catch (error) {
      cleanupAndRethrow(error, () => runCleanupSteps([
        cleanup,
        () => {
          if (component.element.parentNode === storage) {
            DOMTree.remove(component.element);
          }
        }
      ]));
    }
    if (!controllerActive) {
      return component;
    }
    try {
      releaseStateCleanup = placeState.subscribe(component, syncPlace);
      if (!controllerActive) {
        releaseStateCleanup();
        return component;
      }
      syncPlace(placeState.value);
    } catch (error) {
      cleanupAndRethrow(error, cleanup);
    }
    return component;
  }
  function controlConditionalPlacement(component, state2, placement, resolveOwner) {
    ensureActive3(component);
    const fallbackOwner = getPlacementLifecycleOwner(component);
    const marker = Marker("kitsui:place").owner.add(fallbackOwner, "conditional-place");
    const authority = replacePlacementAuthority(component.element, marker);
    placeMarker(marker, placement, () => {
      const owner = resolveOwner();
      if (owner) {
        marker.owner.remove("conditional-place");
      }
      return owner;
    });
    const place = new PlaceClass(marker, marker);
    return controlPlacement(component, marker, toPlaceSource(state2, place), /* @__PURE__ */ new Set([place]), authority);
  }
  function placeExtension() {
    if (patched3) {
      return;
    }
    patched3 = true;
    const ComponentClass2 = getComponentClass2();
    const MarkerClass2 = Marker.extend();
    const prototype = ComponentClass2.prototype;
    const markerPrototype = MarkerClass2.prototype;
    markerPrototype.appendTo = function appendTo(target) {
      const container = resolvePlacementContainer(target);
      placeMarker(this, { type: "append", parent: container }, () => resolvePlacementContainerOwner(target));
      return this;
    };
    markerPrototype.prependTo = function prependTo(target) {
      const container = resolvePlacementContainer(target);
      placeMarker(this, { type: "prepend", parent: container }, () => resolvePlacementContainerOwner(target));
      return this;
    };
    markerPrototype.insertTo = function insertTo(where, target) {
      const referenceNode = resolvePlacementReferenceNode(target);
      if (!referenceNode) {
        return this;
      }
      const parentNode = DOMTree.parentOf(referenceNode);
      if (!isDOMParent(parentNode)) {
        throw new Error("Insert target was not found.");
      }
      placeMarker(this, { type: where, reference: referenceNode }, () => resolvePlacementOwner(target));
      return this;
    };
    prototype.appendTo = function appendTo(target) {
      ensureActive3(this);
      const container = resolvePlacementContainer(target);
      placeComponent(this, { type: "append", parent: container });
      return this;
    };
    prototype.appendToWhen = function appendToWhen(state2, target) {
      const container = resolvePlacementContainer(target);
      return controlConditionalPlacement(
        this,
        state2,
        { type: "append", parent: container },
        () => resolveConditionalPlacementOwner(target, this)
      );
    };
    prototype.prependTo = function prependTo(target) {
      ensureActive3(this);
      const container = resolvePlacementContainer(target);
      placeComponent(this, { type: "prepend", parent: container });
      return this;
    };
    prototype.prependToWhen = function prependToWhen(state2, target) {
      const container = resolvePlacementContainer(target);
      return controlConditionalPlacement(
        this,
        state2,
        { type: "prepend", parent: container },
        () => resolveConditionalPlacementOwner(target, this)
      );
    };
    prototype.insertTo = function insertTo(where, target) {
      ensureActive3(this);
      const referenceNode = resolvePlacementReferenceNode(target);
      if (!referenceNode) {
        return this;
      }
      const parentNode = DOMTree.parentOf(referenceNode);
      if (!isDOMParent(parentNode)) {
        throw new Error("Insert target was not found.");
      }
      placeComponent(this, { type: where, reference: referenceNode });
      return this;
    };
    prototype.insertToWhen = function insertToWhen(state2, where, target) {
      const referenceNode = resolvePlacementReferenceNode(target);
      if (!referenceNode) {
        const fallbackOwner = getPlacementLifecycleOwner(this);
        return this.place(fallbackOwner, (Place) => toPlaceSource(state2, Place()));
      }
      const parentNode = DOMTree.parentOf(referenceNode);
      if (!isDOMParent(parentNode)) {
        throw new Error("Insert target was not found.");
      }
      return controlConditionalPlacement(
        this,
        state2,
        { type: where, reference: referenceNode },
        () => resolveConditionalPlacementOwner(target, this)
      );
    };
    prototype.place = function place(owner, placer) {
      ensureActive3(this);
      const placementOwner = owner === this ? getPlacementLifecycleOwner(this) : owner;
      const authority = replacePlacementAuthority(this.element, placementOwner);
      const places = /* @__PURE__ */ new Set();
      const Place = function Place2() {
        const marker = Marker("kitsui:place");
        try {
          marker.owner.add(placementOwner, "place");
        } catch (error) {
          cleanupAndRethrow(error, () => marker.remove());
        }
        const place2 = new PlaceClass(placementOwner, marker);
        places.add(place2);
        return place2;
      };
      Place.prototype = PlaceClass.prototype;
      const cleanupPlaces = () => runCleanupSteps([...places].map((place2) => () => place2.remove()));
      let placeState;
      try {
        const placerResult = placer(Place);
        if (!isPlaceState(placerResult)) {
          throw new TypeError("Component.place placer must return a State<Place | null>.");
        }
        placeState = placerResult;
        ensureActive3(this);
      } catch (error) {
        cleanupAndRethrow(error, () => runCleanupSteps([cleanupPlaces, () => authority.release(true)]));
      }
      try {
        return controlPlacement(this, placementOwner, placeState, places, authority);
      } catch (error) {
        cleanupAndRethrow(error, cleanupPlaces);
      }
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
  var AsyncPending = Object.freeze({
    type: "pending"
  });
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
  function createAsyncMappingState(source, owner, mapper) {
    const graphOptions = {
      graph: source.getGraph()
    };
    const asyncState = createOwnedState2(owner, AsyncPending, graphOptions);
    const lastSettled = createOwnedState2(asyncState, null, graphOptions);
    Object.defineProperty(asyncState, "lastSettled", {
      configurable: false,
      enumerable: false,
      value: lastSettled,
      writable: false
    });
    let generation = 0;
    let activeController = null;
    const evaluate = (value) => {
      if (asyncState.disposed) {
        return;
      }
      const currentGeneration = ++generation;
      activeController?.abort();
      const operationController = new AbortController();
      activeController = operationController;
      const signal = AbortSignal.any([
        asyncState.signal,
        operationController.signal
      ]);
      asyncState.set(AsyncPending);
      const acceptsSettlement = () => currentGeneration === generation && activeController === operationController && !signal.aborted && !asyncState.disposed;
      void Promise.resolve().then(() => {
        if (!acceptsSettlement()) {
          return void 0;
        }
        return mapper(value, signal);
      }).then((mappedValue) => {
        if (!acceptsSettlement()) {
          return;
        }
        activeController = null;
        const settled = {
          type: "resolved",
          value: mappedValue
        };
        asyncState.set(settled);
        if (!lastSettled.disposed) {
          lastSettled.set(settled);
        }
      }, (error) => {
        if (!acceptsSettlement()) {
          return;
        }
        activeController = null;
        const settled = {
          error,
          type: "rejected"
        };
        asyncState.set(settled);
        if (!lastSettled.disposed) {
          lastSettled.set(settled);
        }
      });
    };
    const releaseSourceSubscription = source.subscribe(asyncState, (value) => {
      evaluate(value);
    });
    const releaseSourceCleanup = source.onCleanup(() => {
      asyncState.dispose();
    });
    asyncState.onCleanup(() => {
      generation++;
      activeController?.abort();
      activeController = null;
      releaseSourceCleanup();
      releaseSourceSubscription();
    });
    evaluate(source.value);
    return asyncState;
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
    prototype.mapAsync = function mapAsync(owner, mapper) {
      return createAsyncMappingState(this, owner, mapper);
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

  // src/state/extensions/temporalExtension.ts
  var createOwnerlessState2 = State;
  var patched6 = false;
  function validateDuration(milliseconds) {
    if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError("State duration must be a finite non-negative number.");
    }
  }
  function createDebouncedState(source, milliseconds) {
    validateDuration(milliseconds);
    const debounced = createOwnerlessState2(source.value, {
      graph: source.getGraph()
    });
    let latestValue = source.value;
    let timeoutHandle = null;
    const releaseImplicitOwnerPropagation = debounced._registerImplicitOwnerDependent?.(source) ?? (() => void 0);
    const releaseSourceSubscription = source.subscribe(debounced, (value) => {
      if (milliseconds === 0) {
        debounced.set(value);
        return;
      }
      latestValue = value;
      timeoutHandle?.cancel();
      timeoutHandle = scheduleTimeout(() => {
        timeoutHandle = null;
        if (!debounced.disposed) {
          debounced.set(latestValue);
        }
      }, milliseconds);
    });
    const releaseSourceCleanup = source.onCleanup(() => {
      debounced.dispose();
    });
    debounced.onCleanup(() => {
      timeoutHandle?.cancel();
      timeoutHandle = null;
      latestValue = debounced.value;
      releaseImplicitOwnerPropagation();
      releaseSourceCleanup();
      releaseSourceSubscription();
    });
    return debounced;
  }
  function createThrottledState(source, milliseconds) {
    validateDuration(milliseconds);
    const throttled = createOwnerlessState2(source.value, {
      graph: source.getGraph()
    });
    let timeoutHandle = null;
    let trailingValue = source.value;
    let hasTrailingValue = false;
    const beginInterval = () => {
      timeoutHandle = scheduleTimeout(() => {
        timeoutHandle = null;
        if (throttled.disposed || !hasTrailingValue) {
          return;
        }
        const nextValue = trailingValue;
        hasTrailingValue = false;
        throttled.set(nextValue);
        beginInterval();
      }, milliseconds);
    };
    const releaseImplicitOwnerPropagation = throttled._registerImplicitOwnerDependent?.(source) ?? (() => void 0);
    const releaseSourceSubscription = source.subscribe(throttled, (value) => {
      if (milliseconds === 0) {
        throttled.set(value);
        return;
      }
      if (timeoutHandle === null) {
        throttled.set(value);
        beginInterval();
        return;
      }
      trailingValue = value;
      hasTrailingValue = true;
    });
    const releaseSourceCleanup = source.onCleanup(() => {
      throttled.dispose();
    });
    throttled.onCleanup(() => {
      timeoutHandle?.cancel();
      timeoutHandle = null;
      hasTrailingValue = false;
      trailingValue = throttled.value;
      releaseImplicitOwnerPropagation();
      releaseSourceCleanup();
      releaseSourceSubscription();
    });
    return throttled;
  }
  function temporalExtension() {
    if (patched6) {
      return;
    }
    patched6 = true;
    const StateClass2 = State.extend();
    const prototype = StateClass2.prototype;
    prototype.debounce = function debounce(milliseconds) {
      return createDebouncedState(this, milliseconds);
    };
    prototype.throttle = function throttle(milliseconds) {
      return createThrottledState(this, milliseconds);
    };
  }

  // src/component/Draggable.ts
  var noop11 = () => {
  };
  var dragEventOptions = {
    bubbles: true,
    cancelable: false
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
    return component.owner.get() === null && DOMTree.parentOf(component.element) === null;
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
  function defaultPointerInput(component, receiver) {
    let releaseTracking = noop11;
    const releaseCurrentTracking = () => {
      releaseTracking();
      releaseTracking = noop11;
    };
    const releaseCurrentTrackingWithoutCapture = () => {
      releaseTracking(false);
      releaseTracking = noop11;
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
      __publicField(this, "cleanupDisposeEvent", noop11);
      __publicField(this, "cleanupInput", noop11);
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
      this.cleanupInput = (options.input ?? defaultPointerInput)(component, this.createReceiver()) ?? noop11;
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
      this.cleanupDisposeEvent = noop11;
      if (!this.phase.disposed && !this.position.disposed) {
        this.cancelWith({});
      } else {
        this.releaseActiveDrag();
      }
      this.cleanupInput();
      this.cleanupInput = noop11;
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
      this.component.event.emit.DragStartRequested(context, dragEventOptions);
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
      this.component.event.emit.DragMove({
        component: this.component,
        event: input.event,
        position: next,
        target: input.target
      }, dragEventOptions);
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
        this.component.event.emit.DragEnd({
          component: this.component,
          event: input.event,
          position,
          target: input.target
        }, dragEventOptions);
      } else if (position) {
        this.component.event.emit.DragCancel({
          component: this.component,
          event: input.event,
          position,
          target: input.target
        }, dragEventOptions);
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
        this.component.event.emit.DragCancel({
          component: this.component,
          event: input.event,
          position,
          target: input.target
        }, dragEventOptions);
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
      this.component.event.emit.DragStart({
        component: this.component,
        event: input.event,
        position,
        target: input.target
      }, dragEventOptions);
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
      DOMTree.physical.place(
        [preview.element],
        { type: "append", parent: this.component.element.ownerDocument.body },
        () => {
        }
      );
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
  var noop12 = () => {
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
      current = DOMTree.physical.parentOf(current);
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
      __publicField(this, "cleanupRegistration", noop12);
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
      this.cleanupRegistration = noop12;
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
  var noop13 = () => {
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
    return component.owner.get() === null && DOMTree.parentOf(component.element) === null;
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
      current = DOMTree.physical.parentOf(current);
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
      __publicField(this, "cleanupDisposeEvent", noop13);
      __publicField(this, "currentOrder", []);
      __publicField(this, "disposedValue", false);
      __publicField(this, "previewOrder", []);
      __publicField(this, "releaseSourceSubscription", noop13);
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
      this.cleanupDisposeEvent = noop13;
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
      DOMTree.physical.remove(record.component.element);
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
      if (session.placeholder) {
        DOMTree.physical.remove(session.placeholder.element);
      }
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
      DOMTree.physical.place(
        [placeholder.element],
        referenceNode ? { type: "before", reference: referenceNode } : { type: "append", parent: target.component.element },
        () => {
        }
      );
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
  temporalExtension();
  return __toCommonJS(index_exports);
})();

  return __kitsui_factory__;
});
//# sourceMappingURL=kitsui.umd.js.map
