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
    Owner: () => Owner,
    State: () => State,
    Style: () => Style
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
    constructor() {
      __publicField(this, "cleanupFunctions", /* @__PURE__ */ new Set());
      __publicField(this, "disposedValue", false);
    }
    get disposed() {
      return this.disposedValue;
    }
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
    beforeDispose() {
    }
    afterDispose() {
    }
  };
  var StateClass = class extends Owner {
    constructor(owner, initialValue, options = {}) {
      super();
      __publicField(this, "owner");
      __publicField(this, "releaseOwner", noop);
      __publicField(this, "currentValue");
      __publicField(this, "equals");
      __publicField(this, "graph");
      __publicField(this, "immediateListeners", /* @__PURE__ */ new Set());
      __publicField(this, "queuedListeners", /* @__PURE__ */ new Set());
      this.owner = owner;
      this.currentValue = initialValue;
      this.equals = options.equals ?? Object.is;
      this.graph = options.graph ?? createStateGraph();
      this.releaseOwner = owner.onCleanup(() => {
        this.dispose();
      });
    }
    getOwner() {
      return this.owner;
    }
    get value() {
      return this.currentValue;
    }
    getGraph() {
      return this.graph;
    }
    set(nextValue) {
      this.ensureActive();
      if (this.equals(this.currentValue, nextValue)) {
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
          listenerRecord.equals = this.equals;
          listenerRecord.graph.pendingListeners.add(listenerRecord);
          scheduleGraphFlush(listenerRecord.graph);
          continue;
        }
        listenerRecord.pendingFinalValue = this.currentValue;
      }
      return this.currentValue;
    }
    update(updater) {
      this.ensureActive();
      return this.set(updater(this.currentValue));
    }
    setEquality(equals) {
      this.ensureActive();
      this.equals = equals;
      return this;
    }
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
    subscribeUnbound(listener) {
      if (this.disposed) {
        return noop;
      }
      const listenerRecord = {
        active: true,
        equals: this.equals,
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
    subscribeImmediate(owner, listener) {
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
    subscribe(owner, listener) {
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
    ensureActive() {
      if (this.disposed) {
        throw new Error("Disposed states cannot be modified.");
      }
    }
  };
  var State = function State2(owner, initialValue, options = {}) {
    return new StateClass(owner, initialValue, options);
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
    constructor(attribute) {
      this.attribute = attribute;
    }
    role(value) {
      return this.set("role", value);
    }
    label(value) {
      return this.set("aria-label", value);
    }
    description(value) {
      return this.set("aria-description", value);
    }
    roleDescription(value) {
      return this.set("aria-roledescription", value);
    }
    labelledBy(value) {
      return this.set("aria-labelledby", toReferenceValueInput(value));
    }
    describedBy(value) {
      return this.set("aria-describedby", toReferenceValueInput(value));
    }
    controls(value) {
      return this.set("aria-controls", toReferenceValueInput(value));
    }
    details(value) {
      return this.set("aria-details", toReferenceValueInput(value));
    }
    owns(value) {
      return this.set("aria-owns", toReferenceValueInput(value));
    }
    flowTo(value) {
      return this.set("aria-flowto", toReferenceValueInput(value));
    }
    hidden(value) {
      return this.set("aria-hidden", value);
    }
    disabled(value) {
      return this.set("aria-disabled", value);
    }
    expanded(value) {
      return this.set("aria-expanded", value);
    }
    busy(value) {
      return this.set("aria-busy", value);
    }
    selected(value) {
      return this.set("aria-selected", value);
    }
    checked(value) {
      return this.set("aria-checked", value);
    }
    pressed(value) {
      return this.set("aria-pressed", value);
    }
    current(value) {
      return this.set("aria-current", value);
    }
    live(value) {
      return this.set("aria-live", value);
    }
    set(name, value) {
      this.attribute.set(name, value);
      return this;
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
    constructor(owner, element) {
      this.owner = owner;
      this.element = element;
      __publicField(this, "attributeDeterminers", /* @__PURE__ */ new Map());
    }
    add(...attributes) {
      this.ensureActive();
      for (const attribute of attributes) {
        this.installAttributePresence(attribute, () => "", isStateSource(attribute));
      }
      return this;
    }
    set(...argumentsList) {
      this.ensureActive();
      const entries = this.resolveSetEntries(argumentsList);
      for (const entry of entries) {
        this.installAttributeValue(entry);
      }
      return this;
    }
    remove(...attributes) {
      this.ensureActive();
      for (const attribute of attributes) {
        this.installAttributePresence(attribute, () => null, isStateSource(attribute));
      }
      return this;
    }
    bind(state, ...inputs) {
      this.ensureActive();
      if (inputs.some(isAttributeEntry)) {
        const cleanups2 = inputs.map((entry) => this.installAttributeValue(entry, {
          getPresence: () => state.value,
          logDynamicReplacement: true,
          subscribePresenceChanges: (listener) => state.subscribe(this.owner, () => {
            listener();
          })
        }));
        return () => {
          for (const cleanup of cleanups2) {
            cleanup();
          }
        };
      }
      const cleanups = inputs.map((attribute) => this.installAttributePresence(attribute, () => state.value ? "" : null, true, {
        subscribePresenceChanges: (listener) => state.subscribe(this.owner, () => {
          listener();
        })
      }));
      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
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
  function serializeDefinition(definition) {
    return Object.entries(definition).filter((entry) => entry[1] !== void 0 && entry[1] !== null).sort(([left], [right]) => left.localeCompare(right)).map(([propertyName, value]) => `${toCssPropertyName(propertyName)}: ${String(expandVariableAccessShorthand(value))}`).join("; ");
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
      return `${styleValue}px`;
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
      throw new Error("Style registration requires a document.");
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
    getStyleElement().textContent = styleOrder.map((style) => `.${style.className} { ${style.cssText} }`).join("\n");
    if (styleOrder.length > 0) {
      getStyleElement().append(document.createTextNode("\n"));
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
    const cssText = serializeDefinition(definition);
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
  var Style = function Style2(className, definition) {
    return createStyle(className, definition);
  };
  Style.prototype = StyleClass.prototype;
  Style.after = function after(...classes) {
    return {
      create(className, definition) {
        return createStyle(className, definition, classes);
      }
    };
  };

  // src/component/ClassManipulator.ts
  var noop3 = () => {
  };
  function isStyleInputState(value) {
    return value instanceof State;
  }
  function isIterableStyleSelection(value) {
    return value !== null && value !== void 0 && typeof value === "object" && Symbol.iterator in value && !(value instanceof Style);
  }
  function resolveStyleSelection(selection) {
    const styles = /* @__PURE__ */ new Map();
    if (!selection) {
      return styles;
    }
    if (selection instanceof Style) {
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
      if (!(item instanceof Style)) {
        throw new TypeError("Unsupported style selection item.");
      }
      styles.set(item.className, item);
    }
    return styles;
  }
  var ClassManipulator = class {
    constructor(owner, element) {
      this.owner = owner;
      this.element = element;
      __publicField(this, "styleDeterminers", /* @__PURE__ */ new Map());
    }
    add(...classes) {
      this.ensureActive();
      for (const style of classes) {
        this.installAddInput(style);
      }
      return this;
    }
    remove(...classes) {
      this.ensureActive();
      for (const style of classes) {
        this.installRemoveInput(style);
      }
      return this;
    }
    bind(state, ...classes) {
      this.ensureActive();
      const cleanups = classes.filter((style) => Boolean(style)).map((style) => {
        if (isStyleInputState(style)) {
          return this.installStateDrivenStyles(style, () => state.value, {
            logStateReplacement: true,
            subscribePresenceChanges: (listener) => state.subscribe(this.owner, () => {
              listener();
            })
          });
        }
        return this.replaceDeterminer(style, (applyIfCurrent) => {
          applyIfCurrent(state.value);
          const cleanup = state.subscribe(this.owner, (value) => {
            applyIfCurrent(value);
          });
          return () => {
            cleanup();
            this.element.classList.remove(style.className);
          };
        });
      });
      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    }
    addFrom(owner, ...classes) {
      this.ensureActive();
      const cleanups = classes.filter((style) => Boolean(style)).map((style) => {
        if (isStyleInputState(style)) {
          const cleanup = this.installStateDrivenStyles(style, () => true, {
            logStateReplacement: true
          });
          const releaseOwner = owner.onCleanup(cleanup);
          return () => {
            releaseOwner();
            cleanup();
          };
        }
        return this.replaceDeterminer(style, (applyIfCurrent) => {
          applyIfCurrent(true);
          const releaseOwner = owner.onCleanup(() => {
            applyIfCurrent(false);
          });
          return () => {
            releaseOwner();
            this.element.classList.remove(style.className);
          };
        });
      });
      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
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

  // src/component/Component.ts
  var noop4 = () => {
  };
  var orphanedComponentErrorMessage = "Components must be mounted or owned before the next tick.";
  var elementComponents = /* @__PURE__ */ new WeakMap();
  var componentMoveHandlers = /* @__PURE__ */ new Set();
  var componentOwnerResolvers = /* @__PURE__ */ new Set();
  var componentAccessorInstalled = false;
  function isMoveParent(value) {
    return value !== null && typeof value.insertBefore === "function";
  }
  function moveNode(parent, node, beforeNode) {
    if (typeof parent.moveBefore === "function") {
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
  function isInsertableIterable(value) {
    return typeof value === "object" && value !== null && !(value instanceof Node) && !(value instanceof ComponentClass) && !(value instanceof State) && Symbol.iterator in value;
  }
  function applyComponentMoveHandlers(component) {
    for (const handler of componentMoveHandlers) {
      handler(component);
    }
  }
  function registerComponentMoveHandler(handler) {
    componentMoveHandlers.add(handler);
    return () => {
      componentMoveHandlers.delete(handler);
    };
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
  function resolveHost(target) {
    const host = typeof target === "string" ? document.querySelector(target) : target;
    if (!(host instanceof HTMLElement)) {
      throw new Error("Mount target was not found.");
    }
    return host;
  }
  var ComponentClass = class _ComponentClass extends Owner {
    constructor(tagNameOrElement, options = {}) {
      super();
      __publicField(this, "element");
      __publicField(this, "owner", null);
      __publicField(this, "releaseOwner", noop4);
      __publicField(this, "structuralCleanups", /* @__PURE__ */ new Set());
      __publicField(this, "orphanCheckId", null);
      installNodeComponentAccessor();
      this.element = typeof tagNameOrElement === "string" ? document.createElement(tagNameOrElement) : tagNameOrElement;
      if (getLiveComponent(this.element)) {
        throw new Error("This node already has a component. Use node.component to retrieve it.");
      }
      if (options.className) {
        this.element.className = options.className;
      }
      if (options.textContent !== void 0) {
        this.element.textContent = options.textContent;
      }
      elementComponents.set(this.element, new WeakRef(this));
      this.refreshOrphanCheck();
    }
    static wrap(element) {
      return new _ComponentClass(element);
    }
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
    get aria() {
      this.ensureActive();
      const manipulator = new AriaManipulator(this.attribute);
      Object.defineProperty(this, "aria", {
        configurable: true,
        enumerable: true,
        value: manipulator,
        writable: false
      });
      return manipulator;
    }
    append(...children) {
      this.ensureActive();
      for (const child of children) {
        if (isComponentSelectionState(child)) {
          this.attachStatefulChildren(child, {
            getContainer: () => this.element,
            getOwner: () => this,
            getReferenceNode: () => null
          });
          continue;
        }
        this.element.append(this.resolveChildNode(child, this));
      }
      return this;
    }
    prepend(...children) {
      this.ensureActive();
      const referenceNode = this.element.firstChild;
      for (const child of children) {
        if (isComponentSelectionState(child)) {
          this.attachStatefulChildren(child, {
            getContainer: () => this.element,
            getOwner: () => this,
            getReferenceNode: () => referenceNode
          });
          continue;
        }
        this.element.insertBefore(this.resolveChildNode(child, this), referenceNode);
      }
      return this;
    }
    insert(where, ...nodes) {
      this.ensureActive();
      const insertables = this.expandInsertableChildren(nodes);
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
            getOwner: () => this.resolveEffectiveOwner(),
            getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling
          });
          continue;
        }
        const staticNode = node;
        moveNode(parentNode, this.resolveInsertableNode(staticNode, this.resolveEffectiveOwner()), where === "before" ? this.element : this.element.nextSibling);
      }
      return this;
    }
    appendWhen(state, child) {
      this.ensureActive();
      return this.attachConditionalNode(state, child, {
        getContainer: () => this.element,
        getOwner: () => this,
        getReferenceNode: () => null
      });
    }
    prependWhen(state, child) {
      this.ensureActive();
      return this.attachConditionalNode(state, child, {
        getContainer: () => this.element,
        getOwner: () => this,
        getReferenceNode: () => this.element.firstChild
      });
    }
    insertWhen(state, where, ...nodes) {
      this.ensureActive();
      const insertables = this.expandConditionalNodes(nodes);
      const orderedInsertables = where === "before" ? insertables : [...insertables].reverse();
      const cleanups = orderedInsertables.map((node) => this.attachConditionalNode(state, node, {
        getContainer: () => this.element.parentNode,
        getOwner: () => this.resolveEffectiveOwner(),
        getReferenceNode: () => where === "before" ? this.element : this.element.nextSibling
      }));
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
    setAttribute(name, value) {
      this.ensureActive();
      this.element.setAttribute(name, value);
      return this;
    }
    setText(text) {
      this.ensureActive();
      this.releaseStructuralCleanups();
      for (const childNode of Array.from(this.element.childNodes)) {
        disposeManagedNode(childNode);
      }
      this.element.textContent = text;
      return this;
    }
    mount(target) {
      this.ensureActive();
      applyComponentMoveHandlers(this);
      const host = resolveHost(target);
      moveNode(host, this.element, null);
      this.refreshOrphanCheck();
      return this;
    }
    bindState(state, render) {
      this.ensureActive();
      render(state.value, this);
      return state.subscribe(this, (value) => {
        render(value, this);
      });
    }
    remove() {
      super.dispose();
    }
    setOwner(owner) {
      this.ensureActive();
      if (this.owner === owner) {
        return this;
      }
      this.releaseOwner();
      this.releaseOwner = noop4;
      this.owner = owner;
      if (owner) {
        this.releaseOwner = owner.onCleanup(() => {
          this.remove();
        });
      }
      this.refreshOrphanCheck();
      return this;
    }
    getOwner() {
      return this.owner;
    }
    beforeDispose() {
      this.clearOrphanCheck();
      this.releaseStructuralCleanups();
      this.releaseOwner();
      this.releaseOwner = noop4;
      this.owner = null;
      if (getLiveComponent(this.element) === this) {
        elementComponents.delete(this.element);
      }
    }
    afterDispose() {
      this.element.remove();
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
        if (!this.disposed && !this.isManaged()) {
          throw new Error(orphanedComponentErrorMessage);
        }
      }, 0);
    }
    isManaged() {
      if (this.element.isConnected) {
        return true;
      }
      if (this.ownerResolves(this.owner)) {
        return true;
      }
      for (const resolver of componentOwnerResolvers) {
        if (this.ownerResolves(resolver(this))) {
          return true;
        }
      }
      return false;
    }
    resolveEffectiveOwner() {
      if (this.owner) {
        return this.owner;
      }
      for (const resolver of componentOwnerResolvers) {
        const owner = resolver(this);
        if (owner) {
          return owner;
        }
      }
      return null;
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
    resolveChildNode(child, owner) {
      if (child instanceof _ComponentClass) {
        child.ensureActive();
        applyComponentMoveHandlers(child);
        child.setOwner(owner);
        return child.element;
      }
      if (typeof child === "string") {
        return this.element.ownerDocument.createTextNode(child);
      }
      return child;
    }
    resolveInsertableNode(node, owner) {
      if (!node) {
        throw new Error("Insert target was not found.");
      }
      if (typeof node === "string") {
        return this.element.ownerDocument.createTextNode(node);
      }
      if (node instanceof _ComponentClass) {
        if (node === this) {
          return this.element;
        }
        node.ensureActive();
        applyComponentMoveHandlers(node);
        node.setOwner(owner);
        return node.element;
      }
      return node;
    }
    expandInsertableChildren(children) {
      const expanded = [];
      for (const child of children) {
        if (!child) {
          continue;
        }
        if (isInsertableIterable(child)) {
          for (const entry of child) {
            if (!entry) {
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
    expandConditionalNodes(nodes) {
      const expanded = [];
      for (const node of nodes) {
        if (!node) {
          continue;
        }
        if (isInsertableIterable(node)) {
          for (const entry of node) {
            if (!entry) {
              continue;
            }
            expanded.push(entry);
          }
          continue;
        }
        expanded.push(node);
      }
      return expanded;
    }
    trackStructuralCleanup(cleanup) {
      let active = true;
      let releaseOwnerCleanup = noop4;
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
    attachConditionalNode(state, node, options) {
      if (!node) {
        return noop4;
      }
      const resolvedNode = this.resolveInsertableNode(node, options.getOwner());
      const placeholder = this.element.ownerDocument.createComment("kitsui:conditional");
      const storage = createStorageElement(this.element.ownerDocument);
      const childComponent = node instanceof _ComponentClass ? node : null;
      let active = true;
      let releaseChildCleanup = noop4;
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
      const stateCleanup = state.subscribe(this, (nextVisible) => {
        if (nextVisible) {
          placeVisible();
          return;
        }
        placeHidden();
      });
      if (state.value) {
        placeVisible();
      } else {
        placeHidden();
      }
      return cleanup;
    }
    attachStatefulChildren(state, options) {
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
        const owner = options.getOwner();
        for (const component of nextComponents) {
          component.ensureActive();
          applyComponentMoveHandlers(component);
          component.setOwner(owner);
          moveNode(container, component.element, marker);
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
      const stateCleanup = state.subscribe(this, (selection) => {
        renderSelection(selection);
      });
      renderSelection(state.value);
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
  var Component = function Component2(tagNameOrElement = "span", options = {}) {
    if (tagNameOrElement instanceof HTMLElement) {
      return ComponentClass.wrap(tagNameOrElement);
    }
    return new ComponentClass(tagNameOrElement, options);
  };
  Component.prototype = ComponentClass.prototype;
  Component.wrap = function wrap(element) {
    return ComponentClass.wrap(element);
  };
  Component.extend = function extend2() {
    return ComponentClass;
  };

  // src/component/extensions/placeExtension.ts
  var noop5 = () => {
  };
  var placementControllers = /* @__PURE__ */ new WeakMap();
  var placementOwners = /* @__PURE__ */ new WeakMap();
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
    if (typeof parent.moveBefore === "function") {
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
  function setPlacementController(component, cleanup) {
    clearPlacement(component);
    let active = true;
    let releaseDisposeCleanup = noop5;
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
    appendTo(component) {
      ensureActive(component);
      moveNode2(component.element, this.marker, null);
      return this;
    }
    prependTo(component) {
      ensureActive(component);
      moveNode2(component.element, this.marker, component.element.firstChild);
      return this;
    }
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
  function resolvePlacementOwner(target) {
    if (!target) {
      return null;
    }
    if (isComponent(target)) {
      return target.getOwner() ?? placementOwners.get(target) ?? null;
    }
    if (target instanceof PlaceClass) {
      return target.owner;
    }
    return null;
  }
  function toPlaceSource(state, place) {
    return {
      get value() {
        return state.value ? place : null;
      },
      subscribe(owner, listener) {
        return state.subscribe(owner, (value) => {
          listener(value ? place : null);
        });
      }
    };
  }
  function placeExtension() {
    if (patched) {
      return;
    }
    patched = true;
    registerComponentOwnerResolver((component) => {
      return placementOwners.get(component) ?? null;
    });
    registerComponentMoveHandler((component) => {
      clearPlacement(component);
    });
    const ComponentClass2 = getComponentClass();
    const prototype = ComponentClass2.prototype;
    prototype.appendTo = function appendTo(component) {
      ensureActive(this);
      ensureActive(component);
      clearPlacement(this);
      this.setOwner(component);
      moveNode2(component.element, this.element, null);
      return this;
    };
    prototype.appendToWhen = function appendToWhen(state, component) {
      ensureActive(component);
      return this.place(component, (Place) => {
        const place = Place().appendTo(component);
        return toPlaceSource(state, place);
      });
    };
    prototype.prependTo = function prependTo(component) {
      ensureActive(this);
      ensureActive(component);
      clearPlacement(this);
      this.setOwner(component);
      moveNode2(component.element, this.element, component.element.firstChild);
      return this;
    };
    prototype.prependToWhen = function prependToWhen(state, component) {
      ensureActive(component);
      return this.place(component, (Place) => {
        const place = Place().prependTo(component);
        return toPlaceSource(state, place);
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
      clearPlacement(this);
      this.setOwner(resolvePlacementOwner(target));
      moveNode2(parentNode, this.element, where === "before" ? referenceNode : referenceNode.nextSibling);
      return this;
    };
    prototype.insertToWhen = function insertToWhen(state, where, target) {
      const targetOwner = resolvePlacementOwner(target) ?? this;
      return this.place(targetOwner, (Place) => {
        const place = Place().insertTo(where, target);
        return toPlaceSource(state, place);
      });
    };
    prototype.place = function place(owner, placer) {
      ensureActive(this);
      this.setOwner(null);
      placementOwners.set(this, owner);
      const documentRef = this.element.ownerDocument;
      const storage = createStorageElement2(documentRef);
      const places = /* @__PURE__ */ new Set();
      const Place = function Place2() {
        const place2 = new PlaceClass(owner, documentRef.createComment("kitsui:place"));
        places.add(place2);
        return place2;
      };
      Place.prototype = PlaceClass.prototype;
      const placeState = placer(Place);
      let releaseOwnerCleanup = noop5;
      let releaseStateCleanup = noop5;
      const cleanup = setPlacementController(this, () => {
        releaseOwnerCleanup();
        releaseStateCleanup();
        if (isMoveParent2(storage)) {
          moveNode2(storage, this.element, null);
        }
        for (const place2 of places) {
          place2.remove();
        }
        storage.remove();
      });
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
      };
      releaseStateCleanup = placeState.subscribe(this, (place2) => {
        syncPlace(place2);
      });
      syncPlace(placeState.value);
      releaseOwnerCleanup = owner.onCleanup(cleanup);
      return cleanup;
    };
  }

  // src/state/extensions/mappingExtension.ts
  var truthyStates = /* @__PURE__ */ new WeakMap();
  var falsyStates = /* @__PURE__ */ new WeakMap();
  var patched2 = false;
  function createMappedState(source, owner, mapValue) {
    const mapped = State(owner, mapValue(source.value), {
      graph: source.getGraph()
    });
    const releaseSourceSubscription = source.subscribeImmediate(mapped, (value) => {
      mapped.set(mapValue(value));
    });
    const releaseSourceCleanup = source.onCleanup(() => {
      mapped.dispose();
    });
    mapped.onCleanup(() => {
      releaseSourceCleanup();
      releaseSourceSubscription();
    });
    return mapped;
  }
  function mappingExtension() {
    if (patched2) {
      return;
    }
    patched2 = true;
    const StateClass2 = State.extend();
    const prototype = StateClass2.prototype;
    prototype.map = function map(owner, mapValue) {
      return createMappedState(this, owner, mapValue);
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
  }

  // src/index.ts
  placeExtension();
  mappingExtension();
  return __toCommonJS(index_exports);
})();


  return __kitsui_factory__;
});
