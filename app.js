import {
  CONTEXT_MODE_SYSTEM_PROMPT,
  PROVIDERS,
  appendContextModeSystemPrompt,
  buildContextPolishInput,
  buildProviderRequest,
  extractProviderText,
  findPolishBlocks,
  findSearchMatch,
  getProvider,
  renderFullPolishedDocument,
  renderPolishedDocument,
  unescapeSpecialBraces,
} from "./core.js?v=9";
import { PROMPT_PRESETS, mergePromptText } from "./prompt-presets.js?v=3";

const STORAGE_KEYS = {
  editor: "cguAiEditor.content",
  provider: "cguAiEditor.provider",
  providerConfigs: "cguAiEditor.providerConfigs",
  apiKey: "cguAiEditor.apiKey",
  endpoint: "cguAiEditor.endpoint",
  model: "cguAiEditor.model",
  systemPrompt: "cguAiEditor.systemPrompt",
  contextSystemPrompt: "cguAiEditor.contextSystemPrompt",
  searchTerm: "cguAiEditor.searchTerm",
  fontSize: "cguAiEditor.fontSize",
  replacePrompt: "cguAiEditor.replacePrompt",
  fullPolish: "cguAiEditor.fullPolish",
  polishMode: "cguAiEditor.polishMode",
  wordWrap: "cguAiEditor.wordWrap",
  toolbarHidden: "cguAiEditor.toolbarHidden",
};

const POLISH_MODES = new Set(["full", "marked", "context"]);
const LOCAL_STORAGE_ESTIMATED_QUOTA_BYTES = 5 * 1024 * 1024;

const DEFAULTS = {
  provider: "cgu",
  fontSize: 16,
  minFontSize: 12,
  maxFontSize: 32,
  fontSizeStep: 2,
  reasoningEffort: "medium",
  serviceTier: "default",
  polishMode: "marked",
  systemPrompt: PROMPT_PRESETS.general.content,
  contextSystemPrompt: CONTEXT_MODE_SYSTEM_PROMPT,
};

const elements = {
  app: document.querySelector(".app"),
  toolbar: document.querySelector(".toolbar"),
  editor: document.querySelector("#editor"),
  lineNumbers: document.querySelector("#lineNumbers"),
  lineNumberContent: document.querySelector("#lineNumberContent"),
  polishBtn: document.querySelector("#polishBtn"),
  settingsBtn: document.querySelector("#settingsBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  searchBtn: document.querySelector("#searchBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  zoomInBtn: document.querySelector("#zoomInBtn"),
  zoomOutBtn: document.querySelector("#zoomOutBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  modeBtn: document.querySelector("#modeBtn"),
  wordWrap: document.querySelector("#wordWrap"),
  storageUsage: document.querySelector("#storageUsage"),
  hideToolbarBtn: document.querySelector("#hideToolbarBtn"),
  showToolbarBtn: document.querySelector("#showToolbarBtn"),
  modeDialog: document.querySelector("#modeDialog"),
  settingsDialog: document.querySelector("#settingsDialog"),
  searchForm: document.querySelector("#searchForm"),
  modeForm: document.querySelector("#modeForm"),
  settingsForm: document.querySelector("#settingsForm"),
  searchInput: document.querySelector("#searchInput"),
  searchPrevBtn: document.querySelector("#searchPrevBtn"),
  searchCloseBtn: document.querySelector("#searchCloseBtn"),
  provider: document.querySelector("#provider"),
  apiKey: document.querySelector("#apiKey"),
  endpoint: document.querySelector("#endpoint"),
  model: document.querySelector("#model"),
  providerHint: document.querySelector("#providerHint"),
  systemPrompt: document.querySelector("#systemPrompt"),
  contextSystemPrompt: document.querySelector("#contextSystemPrompt"),
  replacePrompt: document.querySelector("#replacePrompt"),
  applyDefaultContextPromptBtn: document.querySelector("#applyDefaultContextPromptBtn"),
  toggleKeyBtn: document.querySelector("#toggleKeyBtn"),
  appendGeneralPromptBtn: document.querySelector("#appendGeneralPromptBtn"),
  appendCodexPromptBtn: document.querySelector("#appendCodexPromptBtn"),
  appendCodexSectionPromptBtn: document.querySelector("#appendCodexSectionPromptBtn"),
};

let activeProvider = DEFAULTS.provider;
let providerConfigs = {};
let editorFontSize = DEFAULTS.fontSize;
let activePolishMode = DEFAULTS.polishMode;

function loadValue(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    reportError(`無法儲存至瀏覽器：${error.message}`);
  } finally {
    updateLocalStorageUsage();
  }
}

function removeAppStorage() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  updateLocalStorageUsage();
}

function getLocalStorageUsageBytes() {
  try {
    let bytes = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) ?? "";
      const value = localStorage.getItem(key) ?? "";
      bytes += (key.length + value.length) * 2;
    }
    return bytes;
  } catch {
    return null;
  }
}

function formatStorageBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function updateLocalStorageUsage() {
  const bytes = getLocalStorageUsageBytes();
  if (bytes === null) {
    elements.storageUsage.textContent = "已用容量 --";
    elements.storageUsage.title = "無法讀取 LocalStorage 使用容量";
    return;
  }

  const percentage = (bytes / LOCAL_STORAGE_ESTIMATED_QUOTA_BYTES) * 100;
  const percentageLabel = bytes > 0 && percentage < 0.01
    ? "<0.01%"
    : `${percentage < 10 ? percentage.toFixed(2) : percentage.toFixed(1)}%`;
  elements.storageUsage.textContent = `已用容量 ${percentageLabel}`;
  elements.storageUsage.title = `估算已使用 ${formatStorageBytes(bytes)} / 5 MiB`;
}

function syncVisualViewport() {
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty(
    "--visual-viewport-left",
    `${viewport?.offsetLeft ?? 0}px`,
  );
  document.documentElement.style.setProperty(
    "--visual-viewport-top",
    `${viewport?.offsetTop ?? 0}px`,
  );
  document.documentElement.style.setProperty(
    "--visual-viewport-width",
    `${viewport?.width ?? window.innerWidth}px`,
  );
}

function applyToolbarHidden(hidden, persist = true) {
  elements.toolbar.hidden = hidden;
  elements.showToolbarBtn.hidden = !hidden;
  elements.app.classList.toggle("toolbar-hidden", hidden);
  scheduleLineNumberRender();
  if (persist) saveValue(STORAGE_KEYS.toolbarHidden, String(hidden));
}

function loadProviderConfigs() {
  try {
    const stored = JSON.parse(loadValue(STORAGE_KEYS.providerConfigs, "{}"));
    providerConfigs = stored && typeof stored === "object" ? stored : {};
  } catch {
    providerConfigs = {};
  }

  if (!providerConfigs.cgu) {
    const definition = PROVIDERS.cgu;
    providerConfigs.cgu = {
      apiKey: loadValue(STORAGE_KEYS.apiKey, ""),
      endpoint: loadValue(STORAGE_KEYS.endpoint, definition.endpoint),
      model: loadValue(STORAGE_KEYS.model, definition.models[0]),
    };
  }
}

function getProviderConfig(providerId) {
  const definition = getProvider(providerId);
  const stored = providerConfigs[providerId] ?? {};
  return {
    apiKey: stored.apiKey ?? "",
    endpoint: stored.endpoint || definition.endpoint,
    model: definition.models.includes(stored.model) ? stored.model : definition.models[0],
  };
}

function captureProviderConfig() {
  providerConfigs[activeProvider] = {
    apiKey: elements.apiKey.value.trim(),
    endpoint: elements.endpoint.value.trim().replace(/\/+$/, ""),
    model: elements.model.value,
  };
}

function renderProvider(providerId) {
  const definition = getProvider(providerId);
  const config = getProviderConfig(providerId);
  activeProvider = providerId;
  elements.provider.value = providerId;
  elements.apiKey.value = config.apiKey;
  elements.endpoint.value = config.endpoint;
  elements.model.replaceChildren(
    ...definition.models.map((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      return option;
    }),
  );
  elements.model.value = config.model;
  elements.providerHint.textContent = definition.hint;
}

function getSettings() {
  return {
    provider: activeProvider,
    apiKey: elements.apiKey.value.trim(),
    endpoint: (elements.endpoint.value.trim() || getProvider(activeProvider).endpoint).replace(/\/+$/, ""),
    model: elements.model.value,
    systemPrompt: elements.systemPrompt.value.trim() || DEFAULTS.systemPrompt,
    contextSystemPrompt: elements.contextSystemPrompt.value.trim() || DEFAULTS.contextSystemPrompt,
    reasoningEffort: DEFAULTS.reasoningEffort,
    serviceTier: DEFAULTS.serviceTier,
  };
}

function applyFontSize(value, persist = true) {
  const numeric = Number(value);
  editorFontSize = Math.min(
    DEFAULTS.maxFontSize,
    Math.max(DEFAULTS.minFontSize, Number.isFinite(numeric) ? numeric : DEFAULTS.fontSize),
  );
  document.documentElement.style.setProperty("--editor-font-size", `${editorFontSize}px`);
  document.documentElement.style.setProperty("--editor-line-height", `${editorFontSize * 1.65}px`);
  elements.zoomInBtn.disabled = editorFontSize >= DEFAULTS.maxFontSize;
  elements.zoomOutBtn.disabled = editorFontSize <= DEFAULTS.minFontSize;
  scheduleLineNumberRender();
  if (persist) saveValue(STORAGE_KEYS.fontSize, String(editorFontSize));
}

function updateActiveLineFromCursor() {
  const textBeforeCursor = elements.editor.value.slice(0, elements.editor.selectionStart);
  updateActiveLineNumber(textBeforeCursor.split("\n").length);
}

function offsetAtCharacter(lineText, character) {
  return Array.from(lineText).slice(0, character).join("").length;
}

function getArrowSelectionTarget(text, offset, key) {
  if (key === "ArrowLeft") {
    if (offset <= 0) return 0;
    return offset - (Array.from(text.slice(0, offset)).at(-1)?.length ?? 1);
  }

  if (key === "ArrowRight") {
    if (offset >= text.length) return text.length;
    return offset + (Array.from(text.slice(offset))[0]?.length ?? 1);
  }

  const lineStart = offset === 0 ? 0 : text.lastIndexOf("\n", offset - 1) + 1;
  const character = Array.from(text.slice(lineStart, offset)).length;

  if (key === "ArrowUp") {
    if (lineStart === 0) return offset;
    const previousLineEnd = lineStart - 1;
    const previousLineStart = previousLineEnd === 0
      ? 0
      : text.lastIndexOf("\n", previousLineEnd - 1) + 1;
    const previousLine = text.slice(previousLineStart, previousLineEnd);
    return previousLineStart + offsetAtCharacter(previousLine, character);
  }

  const lineEnd = text.indexOf("\n", offset);
  if (lineEnd === -1) return offset;
  const nextLineStart = lineEnd + 1;
  const nextLineEnd = text.indexOf("\n", nextLineStart);
  const nextLine = text.slice(nextLineStart, nextLineEnd === -1 ? text.length : nextLineEnd);
  return nextLineStart + offsetAtCharacter(nextLine, character);
}

function getExtendedSelection(key, start, end, direction) {
  const focus = start === end || direction !== "backward" ? end : start;
  const anchor = start === end ? start : direction === "backward" ? end : start;
  const target = getArrowSelectionTarget(elements.editor.value, focus, key);
  if (target === focus) return null;

  return {
    start: Math.min(anchor, target),
    end: Math.max(anchor, target),
    direction: target < anchor ? "backward" : "forward",
  };
}

function applySelection(selection) {
  if (!selection) return;
  elements.editor.setSelectionRange(selection.start, selection.end, selection.direction);
  updateActiveLineFromCursor();
}

function extendSelectionWithArrow(key) {
  applySelection(getExtendedSelection(
    key,
    elements.editor.selectionStart,
    elements.editor.selectionEnd,
    elements.editor.selectionDirection,
  ));
}

const LEGACY_ARROW_KEYS = {
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown",
  19: "ArrowUp",
  20: "ArrowDown",
  21: "ArrowLeft",
  22: "ArrowRight",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
};

let physicalShiftPressed = false;
let physicalControlPressed = false;

function hasUnknownKeyboardKey(event) {
  return !event.key || event.key === "Unidentified";
}

function normalizeArrowKey(event) {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return event.key;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) {
    return event.code;
  }
  if (LEGACY_ARROW_KEYS[event.key]) return LEGACY_ARROW_KEYS[event.key];
  if (!hasUnknownKeyboardKey(event)) return null;
  return LEGACY_ARROW_KEYS[event.keyCode]
    || LEGACY_ARROW_KEYS[event.which] || null;
}

function isShiftKeyEvent(event) {
  if (event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight") return true;
  const keyCode = event.keyCode || event.which;
  return keyCode === 16 || (hasUnknownKeyboardKey(event) && [59, 60].includes(keyCode));
}

function isControlKeyEvent(event) {
  if (event.key === "Control" || event.key === "Ctrl"
    || event.code === "ControlLeft" || event.code === "ControlRight") return true;
  const keyCode = event.keyCode || event.which;
  return keyCode === 17 || (hasUnknownKeyboardKey(event) && [113, 114].includes(keyCode));
}

function hasShiftModifier(event) {
  return event.shiftKey || physicalShiftPressed || event.getModifierState?.("Shift") === true;
}

function hasControlModifier(event) {
  return event.ctrlKey || physicalControlPressed
    || event.getModifierState?.("Control") === true;
}

function getPreviousCharacterStart(text, offset) {
  if (offset <= 0) return 0;
  return offset - (Array.from(text.slice(0, offset)).at(-1)?.length ?? 1);
}

function getNextCharacterEnd(text, offset) {
  if (offset >= text.length) return text.length;
  return offset + (Array.from(text.slice(offset))[0]?.length ?? 1);
}

function isTokenSeparator(text, offset) {
  const character = Array.from(text.slice(offset))[0];
  return !character || /[\s\p{P}\p{S}]/u.test(character);
}

function getTokenRangeAt(text, offset, lowerBound = 0, upperBound = text.length) {
  if (offset < lowerBound || offset >= upperBound || isTokenSeparator(text, offset)) return null;

  let start = offset;
  while (start > lowerBound) {
    const previous = getPreviousCharacterStart(text, start);
    if (isTokenSeparator(text, previous)) break;
    start = previous;
  }

  let end = getNextCharacterEnd(text, offset);
  while (end < upperBound && !isTokenSeparator(text, end)) {
    end = getNextCharacterEnd(text, end);
  }
  return { start, end };
}

function findHorizontalToken(text, cursor, direction) {
  let offset = cursor;

  if (direction < 0) {
    while (offset > 0) {
      offset = getPreviousCharacterStart(text, offset);
      if (!isTokenSeparator(text, offset)) return getTokenRangeAt(text, offset);
    }
    return null;
  }

  while (offset < text.length && isTokenSeparator(text, offset)) {
    offset = getNextCharacterEnd(text, offset);
  }
  return offset < text.length ? getTokenRangeAt(text, offset) : null;
}

function createEditorMirror() {
  const editorStyle = window.getComputedStyle(elements.editor);
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${elements.editor.clientWidth}px`,
    height: "auto",
    minHeight: "0",
    boxSizing: editorStyle.boxSizing,
    padding: editorStyle.padding,
    border: editorStyle.border,
    font: editorStyle.font,
    letterSpacing: editorStyle.letterSpacing,
    lineHeight: editorStyle.lineHeight,
    textAlign: editorStyle.textAlign,
    textIndent: editorStyle.textIndent,
    textTransform: editorStyle.textTransform,
    wordSpacing: editorStyle.wordSpacing,
    tabSize: editorStyle.tabSize,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: editorStyle.wordBreak,
    direction: editorStyle.direction,
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(mirror);
  return mirror;
}

let lineNumberFrame = null;
let activeLineNumber = 1;

function updateActiveLineNumber(line = activeLineNumber) {
  activeLineNumber = line;
  elements.lineNumberContent.querySelector(".is-active")?.classList.remove("is-active");
  elements.lineNumberContent
    .querySelector(`[data-line="${activeLineNumber}"]`)
    ?.classList.add("is-active");
}

function syncLineNumberScroll() {
  elements.lineNumberContent.style.transform = `translateY(${-elements.editor.scrollTop}px)`;
}

function renderLineNumbers() {
  lineNumberFrame = null;
  const lines = elements.editor.value.split("\n");
  const digits = String(lines.length).length;
  elements.lineNumbers.style.setProperty("--line-number-digits", String(digits));

  const mirror = createEditorMirror();
  if (!elements.wordWrap.checked) {
    mirror.style.whiteSpace = "pre";
    mirror.style.overflowWrap = "normal";
  }
  const markers = [];
  lines.forEach((line, index) => {
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    markers.push(marker);
    mirror.append(marker, document.createTextNode(line));
    if (index < lines.length - 1) mirror.append(document.createTextNode("\n"));
  });

  const fragment = document.createDocumentFragment();
  markers.forEach((marker, index) => {
    const number = document.createElement("span");
    number.className = "line-number";
    number.dataset.line = String(index + 1);
    number.style.top = `${marker.offsetTop}px`;
    number.textContent = String(index + 1);
    fragment.append(number);
  });
  mirror.remove();

  elements.lineNumberContent.replaceChildren(fragment);
  syncLineNumberScroll();
  updateActiveLineNumber();
}

function scheduleLineNumberRender() {
  if (lineNumberFrame !== null) return;
  lineNumberFrame = window.requestAnimationFrame(renderLineNumbers);
}

function getVisualLineArrowTarget(text, offset, key) {
  if (!elements.wordWrap.checked || !window.getSelection()?.modify) {
    return getArrowSelectionTarget(text, offset, key);
  }

  const mirror = createEditorMirror();
  const textNode = document.createTextNode(text || "\u200b");
  mirror.appendChild(textNode);

  const selection = window.getSelection();
  const range = document.createRange();
  const safeOffset = Math.min(Math.max(0, offset), text.length);
  let target = safeOffset;

  try {
    range.setStart(textNode, safeOffset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    selection.modify("move", key === "ArrowUp" ? "backward" : "forward", "line");

    if (selection.focusNode && mirror.contains(selection.focusNode)) {
      const offsetRange = document.createRange();
      offsetRange.selectNodeContents(mirror);
      offsetRange.setEnd(selection.focusNode, selection.focusOffset);
      target = offsetRange.toString().length;
    }
  } finally {
    selection.removeAllRanges();
    mirror.remove();
  }

  return Math.min(Math.max(0, target), text.length);
}

function scrollNavigationOffsetIntoView(offset, key, skippedLineCount = 0) {
  const text = elements.editor.value;
  if (!text || offset < 0 || offset >= text.length) return;

  const mirror = createEditorMirror();
  const marker = document.createElement("span");
  const character = Array.from(text.slice(offset))[0] ?? "\u200b";
  marker.textContent = character;
  mirror.append(
    document.createTextNode(text.slice(0, offset)),
    marker,
    document.createTextNode(text.slice(offset + character.length)),
  );

  const editorStyle = window.getComputedStyle(elements.editor);
  const lineHeight = Number.parseFloat(editorStyle.lineHeight)
    || Number.parseFloat(editorStyle.fontSize) * 1.65;
  const paddingTop = Number.parseFloat(editorStyle.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(editorStyle.paddingBottom) || 0;
  const targetTop = marker.offsetTop;
  const targetBottom = targetTop + lineHeight;
  const contextMargin = skippedLineCount > 0
    && (key === "ArrowUp" || key === "ArrowDown")
    ? lineHeight
    : 0;
  const visibleTop = elements.editor.scrollTop + paddingTop + contextMargin;
  const visibleBottom = elements.editor.scrollTop
    + elements.editor.clientHeight
    - paddingBottom
    - contextMargin;

  if (targetTop < visibleTop) {
    elements.editor.scrollTop = Math.max(
      0,
      targetTop - paddingTop - contextMargin,
    );
  } else if (targetBottom > visibleBottom) {
    elements.editor.scrollTop = targetBottom
      - elements.editor.clientHeight
      + paddingBottom
      + contextMargin;
  }

  mirror.remove();
}

function findTokenNearVerticalTarget(text, target) {
  const lineStart = target === 0 ? 0 : text.lastIndexOf("\n", target - 1) + 1;
  const newlineIndex = text.indexOf("\n", lineStart);
  const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;

  if (target < lineEnd && !isTokenSeparator(text, target)) {
    return getTokenRangeAt(text, target, lineStart, lineEnd);
  }

  let offset = Math.min(target, lineEnd);
  while (offset < lineEnd && isTokenSeparator(text, offset)) {
    offset = getNextCharacterEnd(text, offset);
  }
  if (offset < lineEnd) return getTokenRangeAt(text, offset, lineStart, lineEnd);

  offset = Math.min(target, lineEnd);
  while (offset > lineStart) {
    offset = getPreviousCharacterStart(text, offset);
    if (!isTokenSeparator(text, offset)) return getTokenRangeAt(text, offset, lineStart, lineEnd);
  }
  return null;
}

function findVerticalToken(text, source, key) {
  let navigationOffset = source;
  let skippedLineCount = 0;
  const visitedOffsets = new Set([source]);

  while (true) {
    const target = getVisualLineArrowTarget(text, navigationOffset, key);
    if (target === navigationOffset || visitedOffsets.has(target)) return null;
    visitedOffsets.add(target);

    const range = findTokenNearVerticalTarget(text, target);
    if (range) {
      return {
        ...range,
        navigationOffset: target,
        skippedLineCount,
      };
    }
    skippedLineCount += 1;
    navigationOffset = target;
  }
}

let lastControlNavigation = null;

function getTokenSelection(key) {
  const text = elements.editor.value;
  if (!text) return null;

  const start = elements.editor.selectionStart;
  const end = elements.editor.selectionEnd;
  const continuesPreviousNavigation = lastControlNavigation
    && lastControlNavigation.start === start
    && lastControlNavigation.end === end;
  let range;

  if (key === "ArrowLeft") range = findHorizontalToken(text, start, -1);
  else if (key === "ArrowRight") range = findHorizontalToken(text, end, 1);
  else {
    const source = continuesPreviousNavigation ? lastControlNavigation.offset : start;
    range = findVerticalToken(text, source, key);
  }

  if (!range) return null;
  return {
    ...range,
    direction: key === "ArrowLeft" || key === "ArrowUp" ? "backward" : "forward",
    navigationOffset: range.navigationOffset ?? range.start,
    skippedLineCount: range.skippedLineCount ?? 0,
  };
}

function selectTokenWithArrow(key) {
  const selection = getTokenSelection(key);
  if (!selection) return;
  applySelection(selection);
  lastControlNavigation = {
    start: selection.start,
    end: selection.end,
    offset: selection.navigationOffset,
  };
  scrollNavigationOffsetIntoView(
    selection.navigationOffset,
    key,
    selection.skippedLineCount,
  );
}

const handledControlArrowKeys = new Set();

function handleArrowSelection(event) {
  const arrowKey = normalizeArrowKey(event);
  if (!arrowKey) return;
  const arrowId = arrowKey;

  if (event.type === "keyup" && handledControlArrowKeys.has(arrowId)) {
    handledControlArrowKeys.delete(arrowId);
    return;
  }

  if (hasControlModifier(event) && !event.shiftKey) {
    event.preventDefault();
    selectTokenWithArrow(arrowKey);
    if (event.type === "keydown") handledControlArrowKeys.add(arrowId);
    return;
  }

  if (event.type === "keyup") return;
  if (!hasShiftModifier(event)) return;

  const start = elements.editor.selectionStart;
  const end = elements.editor.selectionEnd;
  const direction = elements.editor.selectionDirection;
  const expectedSelection = getExtendedSelection(arrowKey, start, end, direction);
  if (!expectedSelection) return;

  if (!event.shiftKey && physicalShiftPressed) {
    event.preventDefault();
    applySelection(expectedSelection);
    return;
  }

  window.requestAnimationFrame(() => {
    const currentStart = elements.editor.selectionStart;
    const currentEnd = elements.editor.selectionEnd;
    const matchesExpected = currentStart === expectedSelection.start
      && currentEnd === expectedSelection.end;
    if (matchesExpected) return;

    const nativeChangedSelection = currentStart !== currentEnd
      && (currentStart !== start || currentEnd !== end);
    if (nativeChangedSelection) return;

    applySelection(expectedSelection);
  });
}

function applyWordWrap(enabled, persist = true) {
  elements.wordWrap.checked = enabled;
  elements.editor.wrap = enabled ? "soft" : "off";
  scheduleLineNumberRender();
  if (persist) saveValue(STORAGE_KEYS.wordWrap, String(enabled));
}

function applyPolishMode(mode, persist = true) {
  activePolishMode = POLISH_MODES.has(mode) ? mode : DEFAULTS.polishMode;
  const selected = elements.modeForm.querySelector(`[name="polishMode"][value="${activePolishMode}"]`);
  if (selected) selected.checked = true;

  const selectedLabel = selected?.closest("label")?.querySelector("strong")?.textContent ?? "潤飾模式";
  elements.modeBtn.title = selectedLabel;
  elements.modeBtn.setAttribute("aria-label", `潤飾模式：${selectedLabel}`);
  if (persist) saveValue(STORAGE_KEYS.polishMode, activePolishMode);
}

function loadModePromptFields() {
  elements.systemPrompt.value = loadValue(STORAGE_KEYS.systemPrompt, DEFAULTS.systemPrompt);
  elements.contextSystemPrompt.value = loadValue(
    STORAGE_KEYS.contextSystemPrompt,
    DEFAULTS.contextSystemPrompt,
  );
  elements.replacePrompt.checked = loadValue(STORAGE_KEYS.replacePrompt, "false") === "true";
}

function loadState() {
  elements.editor.value = loadValue(STORAGE_KEYS.editor, "");
  loadProviderConfigs();
  const storedProvider = loadValue(STORAGE_KEYS.provider, DEFAULTS.provider);
  renderProvider(PROVIDERS[storedProvider] ? storedProvider : DEFAULTS.provider);
  loadModePromptFields();
  elements.searchInput.value = loadValue(STORAGE_KEYS.searchTerm, "");
  const storedPolishMode = loadValue(STORAGE_KEYS.polishMode, "");
  const migratedPolishMode = loadValue(STORAGE_KEYS.fullPolish, "false") === "true" ? "full" : DEFAULTS.polishMode;
  applyPolishMode(POLISH_MODES.has(storedPolishMode) ? storedPolishMode : migratedPolishMode, false);
  applyWordWrap(loadValue(STORAGE_KEYS.wordWrap, "false") === "true", false);
  applyToolbarHidden(loadValue(STORAGE_KEYS.toolbarHidden, "false") === "true", false);
  applyFontSize(loadValue(STORAGE_KEYS.fontSize, String(DEFAULTS.fontSize)), false);
  updateActiveLineFromCursor();
  updateLocalStorageUsage();
}

function saveSettings() {
  const settings = getSettings();
  captureProviderConfig();
  saveValue(STORAGE_KEYS.provider, activeProvider);
  saveValue(STORAGE_KEYS.providerConfigs, JSON.stringify(providerConfigs));
  saveValue(STORAGE_KEYS.systemPrompt, settings.systemPrompt);
  saveValue(STORAGE_KEYS.contextSystemPrompt, settings.contextSystemPrompt);
}

function reportError(message) {
  window.alert(message);
}

function setBusy(busy) {
  elements.polishBtn.disabled = busy;
  elements.editor.disabled = busy;
  elements.settingsBtn.disabled = busy;
  elements.searchBtn.disabled = busy;
  elements.modeBtn.disabled = busy;
  elements.clearBtn.disabled = busy;
  elements.polishBtn.textContent = busy ? "潤飾中…" : "潤飾";
}

async function polishText(content, settings) {
  const request = buildProviderRequest(content, settings);
  const response = await fetch(request.url, request.options);

  const rawText = await response.text();
  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.error?.message || data?.message || rawText || `HTTP ${response.status}`;
    throw new Error(`${response.status}：${detail}`);
  }

  return extractProviderText(settings.provider, data);
}

function validateSettings(settings) {
  if (!settings.apiKey) throw new Error("請先在 API 設定中輸入 API Key。");
  if (!settings.endpoint) throw new Error("請輸入 API Endpoint。");
  try {
    new URL(settings.endpoint);
  } catch {
    throw new Error("API Endpoint 格式不正確。");
  }
}

function captureEditorViewport() {
  return {
    scrollTop: elements.editor.scrollTop,
    scrollLeft: elements.editor.scrollLeft,
    selectionStart: elements.editor.selectionStart,
    selectionEnd: elements.editor.selectionEnd,
    selectionDirection: elements.editor.selectionDirection,
  };
}

function restoreEditorViewport(viewport) {
  elements.editor.scrollTop = viewport.scrollTop;
  elements.editor.scrollLeft = viewport.scrollLeft;
  syncLineNumberScroll();
}

function replaceEditorValuePreservingViewport(value, viewport) {
  elements.editor.value = value;
  const selectionStart = Math.min(viewport.selectionStart, value.length);
  const selectionEnd = Math.min(viewport.selectionEnd, value.length);
  elements.editor.setSelectionRange(
    selectionStart,
    selectionEnd,
    viewport.selectionDirection,
  );
  restoreEditorViewport(viewport);
  window.requestAnimationFrame(() => restoreEditorViewport(viewport));
}

async function runPolish() {
  const originalText = elements.editor.value;
  const settings = getSettings();
  const editorViewport = captureEditorViewport();

  try {
    if (activePolishMode === "full") {
      if (!originalText.trim()) throw new Error("沒有可潤飾的文字。");
      validateSettings(settings);

      saveSettings();
      saveValue(STORAGE_KEYS.editor, originalText);
      setBusy(true);

      const result = await polishText(originalText, settings);
      const output = renderFullPolishedDocument(originalText, result);
      replaceEditorValuePreservingViewport(output, editorViewport);
      updateActiveLineFromCursor();
      scheduleLineNumberRender();
      saveValue(STORAGE_KEYS.editor, output);
      return;
    }

    const blocks = findPolishBlocks(originalText);
    if (blocks.length > 1) {
      throw new Error("文件中只能有一組 {{ }} 標記，請移除多餘的標記後再潤飾。");
    }
    const nonEmptyBlocks = blocks.filter((block) => block.content.trim());

    if (!blocks.length) {
      throw new Error("找不到 {{ }} 標記的文字。");
    }
    if (!nonEmptyBlocks.length) {
      throw new Error("{{ }} 內沒有可潤飾的文字。");
    }
    validateSettings(settings);

    saveSettings();
    saveValue(STORAGE_KEYS.editor, originalText);
    setBusy(true);

    const results = new Map();
    const polishSettings = activePolishMode === "context"
      ? {
        ...settings,
        systemPrompt: appendContextModeSystemPrompt(
          settings.systemPrompt,
          settings.contextSystemPrompt,
        ),
      }
      : settings;

    for (let index = 0; index < nonEmptyBlocks.length; index += 1) {
      const block = nonEmptyBlocks[index];
      const content = activePolishMode === "context"
        ? buildContextPolishInput(originalText, block, index, nonEmptyBlocks.length)
        : unescapeSpecialBraces(block.content.trim());
      const result = await polishText(content, polishSettings);
      results.set(block.start, result);
    }

    const output = renderPolishedDocument(originalText, blocks, results);
    replaceEditorValuePreservingViewport(output, editorViewport);
    updateActiveLineFromCursor();
    scheduleLineNumberRender();
    saveValue(STORAGE_KEYS.editor, output);
  } catch (error) {
    reportError(error.message || "潤飾失敗");
    if (!elements.apiKey.value.trim()) elements.settingsDialog.showModal();
  } finally {
    setBusy(false);
    elements.editor.focus({ preventScroll: true });
  }
}

async function copyEditor() {
  try {
    await navigator.clipboard.writeText(elements.editor.value);
  } catch {
    elements.editor.select();
    document.execCommand("copy");
  }
}

function runSearch(direction = 1) {
  const query = elements.searchInput.value;
  if (!query) {
    reportError("請輸入要搜尋的字串。");
    return;
  }

  const startIndex = direction < 0
    ? elements.editor.selectionStart - 1
    : elements.editor.selectionEnd;
  const match = findSearchMatch(elements.editor.value, query, startIndex, direction);

  if (!match) {
    reportError(`找不到「${query}」。`);
    return;
  }

  saveValue(STORAGE_KEYS.searchTerm, query);
  elements.editor.focus();
  elements.editor.setSelectionRange(match.start, match.end);
}

function changeFontSize(delta) {
  applyFontSize(editorFontSize + delta);
  elements.editor.focus();
}

function appendPromptPreset(preset) {
  elements.systemPrompt.value = mergePromptText(
    elements.systemPrompt.value,
    preset.content,
    elements.replacePrompt.checked,
  );
  elements.systemPrompt.focus();
  const end = elements.systemPrompt.value.length;
  elements.systemPrompt.setSelectionRange(end, end);
  elements.systemPrompt.scrollTop = elements.systemPrompt.scrollHeight;
}

function downloadEditor() {
  const blob = new Blob([elements.editor.value], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `ai-polished-${stamp}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearRecords() {
  const confirmed = window.confirm("確定清除文章、API 設定、搜尋字串、字體大小與 System prompt？");
  if (!confirmed) return;

  removeAppStorage();
  providerConfigs = {};
  activeProvider = DEFAULTS.provider;
  elements.editor.value = "";
  updateActiveLineFromCursor();
  elements.searchInput.value = "";
  elements.searchForm.hidden = true;
  elements.replacePrompt.checked = false;
  applyPolishMode(DEFAULTS.polishMode, false);
  applyWordWrap(false, false);
  applyToolbarHidden(false, false);
  elements.systemPrompt.value = DEFAULTS.systemPrompt;
  elements.contextSystemPrompt.value = DEFAULTS.contextSystemPrompt;
  renderProvider(DEFAULTS.provider);
  applyFontSize(DEFAULTS.fontSize, false);
}

let saveTimer;
elements.editor.addEventListener("input", () => {
  updateActiveLineFromCursor();
  scheduleLineNumberRender();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveValue(STORAGE_KEYS.editor, elements.editor.value);
  }, 250);
});

["click", "keyup", "select"].forEach((eventName) => {
  elements.editor.addEventListener(eventName, updateActiveLineFromCursor);
});

elements.editor.addEventListener("scroll", syncLineNumberScroll);
window.addEventListener("resize", () => {
  syncVisualViewport();
  scheduleLineNumberRender();
});
window.visualViewport?.addEventListener("resize", () => {
  syncVisualViewport();
  scheduleLineNumberRender();
});
window.visualViewport?.addEventListener("scroll", syncVisualViewport);

window.addEventListener("keydown", (event) => {
  if (isShiftKeyEvent(event)) physicalShiftPressed = true;
  if (isControlKeyEvent(event)) physicalControlPressed = true;
}, true);

window.addEventListener("keyup", (event) => {
  if (isShiftKeyEvent(event)) physicalShiftPressed = false;
  if (isControlKeyEvent(event)) physicalControlPressed = false;
}, true);

window.addEventListener("blur", () => {
  physicalShiftPressed = false;
  physicalControlPressed = false;
});

elements.editor.addEventListener("keydown", handleArrowSelection);
elements.editor.addEventListener("keyup", handleArrowSelection);

document.addEventListener("selectionchange", () => {
  if (document.activeElement === elements.editor) updateActiveLineFromCursor();
});

elements.searchInput.addEventListener("input", () => {
  saveValue(STORAGE_KEYS.searchTerm, elements.searchInput.value);
});

elements.settingsBtn.addEventListener("click", () => elements.settingsDialog.showModal());
elements.searchBtn.addEventListener("click", () => {
  elements.searchForm.hidden = false;
  elements.searchInput.focus();
  elements.searchInput.select();
});
elements.provider.addEventListener("change", () => {
  captureProviderConfig();
  renderProvider(elements.provider.value);
});
elements.modeBtn.addEventListener("click", () => {
  loadModePromptFields();
  applyPolishMode(activePolishMode, false);
  elements.modeDialog.showModal();
});
elements.polishBtn.addEventListener("click", runPolish);
elements.copyBtn.addEventListener("click", copyEditor);
elements.downloadBtn.addEventListener("click", downloadEditor);
elements.zoomInBtn.addEventListener("click", () => changeFontSize(DEFAULTS.fontSizeStep));
elements.zoomOutBtn.addEventListener("click", () => changeFontSize(-DEFAULTS.fontSizeStep));
elements.clearBtn.addEventListener("click", clearRecords);
elements.hideToolbarBtn.addEventListener("click", () => {
  applyToolbarHidden(true);
  elements.showToolbarBtn.focus({ preventScroll: true });
});
elements.showToolbarBtn.addEventListener("click", () => {
  applyToolbarHidden(false);
  elements.hideToolbarBtn.focus({ preventScroll: true });
});

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(1);
});

elements.searchPrevBtn.addEventListener("click", () => runSearch(-1));
elements.searchCloseBtn.addEventListener("click", () => {
  elements.searchForm.hidden = true;
  elements.editor.focus();
});

elements.modeForm.addEventListener("submit", () => {
  const selectedMode = new FormData(elements.modeForm).get("polishMode");
  applyPolishMode(String(selectedMode));
  elements.systemPrompt.value = elements.systemPrompt.value.trim() || DEFAULTS.systemPrompt;
  elements.contextSystemPrompt.value = elements.contextSystemPrompt.value.trim()
    || DEFAULTS.contextSystemPrompt;
  saveValue(STORAGE_KEYS.systemPrompt, elements.systemPrompt.value);
  saveValue(STORAGE_KEYS.contextSystemPrompt, elements.contextSystemPrompt.value);
  saveValue(STORAGE_KEYS.replacePrompt, String(elements.replacePrompt.checked));
});

elements.wordWrap.addEventListener("change", () => {
  applyWordWrap(elements.wordWrap.checked);
});

elements.settingsForm.addEventListener("submit", () => {
  saveSettings();
});

elements.appendGeneralPromptBtn.addEventListener("click", () => {
  appendPromptPreset(PROMPT_PRESETS.general);
});

elements.appendCodexPromptBtn.addEventListener("click", () => {
  appendPromptPreset(PROMPT_PRESETS.codex);
});

elements.appendCodexSectionPromptBtn.addEventListener("click", () => {
  appendPromptPreset(PROMPT_PRESETS.codexSection);
});

elements.applyDefaultContextPromptBtn.addEventListener("click", () => {
  elements.contextSystemPrompt.value = DEFAULTS.contextSystemPrompt;
  elements.contextSystemPrompt.focus();
});

elements.modeDialog.addEventListener("close", () => {
  loadModePromptFields();
});

elements.toggleKeyBtn.addEventListener("click", () => {
  const showing = elements.apiKey.type === "text";
  elements.apiKey.type = showing ? "password" : "text";
  elements.toggleKeyBtn.textContent = showing ? "顯示" : "隱藏";
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.close}`).close();
  });
});

window.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key === "Enter") {
    event.preventDefault();
    if (!elements.polishBtn.disabled) runPolish();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service Worker 註冊失敗：", error);
    });
  });
}

syncVisualViewport();
loadState();
