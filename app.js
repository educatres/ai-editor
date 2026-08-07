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
};

const POLISH_MODES = new Set(["full", "marked", "context"]);

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
  editor: document.querySelector("#editor"),
  cursorPosition: document.querySelector("#cursorPosition"),
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
  }
}

function removeAppStorage() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
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
  elements.zoomInBtn.disabled = editorFontSize >= DEFAULTS.maxFontSize;
  elements.zoomOutBtn.disabled = editorFontSize <= DEFAULTS.minFontSize;
  if (persist) saveValue(STORAGE_KEYS.fontSize, String(editorFontSize));
}

function updateCursorPosition() {
  const textBeforeCursor = elements.editor.value.slice(0, elements.editor.selectionStart);
  const lines = textBeforeCursor.split("\n");
  const line = lines.length;
  const character = Array.from(lines.at(-1) ?? "").length + 1;
  elements.cursorPosition.value = `${line}:${character}`;
  elements.cursorPosition.textContent = `${line}:${character}`;
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

function extendSelectionWithArrow(key) {
  const start = elements.editor.selectionStart;
  const end = elements.editor.selectionEnd;
  const direction = elements.editor.selectionDirection;
  const focus = start === end || direction !== "backward" ? end : start;
  const anchor = start === end ? start : direction === "backward" ? end : start;
  const target = getArrowSelectionTarget(elements.editor.value, focus, key);
  if (target === focus) return;

  elements.editor.setSelectionRange(
    Math.min(anchor, target),
    Math.max(anchor, target),
    target < anchor ? "backward" : "forward",
  );
  updateCursorPosition();
}

function handleArrowSelection(event) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;

  if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    extendSelectionWithArrow(event.key);
    return;
  }

  if (!event.shiftKey) return;

  const start = elements.editor.selectionStart;
  const end = elements.editor.selectionEnd;
  window.requestAnimationFrame(() => {
    if (elements.editor.selectionStart === start && elements.editor.selectionEnd === end) {
      extendSelectionWithArrow(event.key);
    }
  });
}

function applyWordWrap(enabled, persist = true) {
  elements.wordWrap.checked = enabled;
  elements.editor.wrap = enabled ? "soft" : "off";
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
  applyFontSize(loadValue(STORAGE_KEYS.fontSize, String(DEFAULTS.fontSize)), false);
  updateCursorPosition();
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

async function runPolish() {
  const originalText = elements.editor.value;
  const settings = getSettings();

  try {
    validateSettings(settings);

    if (activePolishMode === "full") {
      if (!originalText.trim()) throw new Error("沒有可潤飾的文字。");

      saveSettings();
      saveValue(STORAGE_KEYS.editor, originalText);
      setBusy(true);

      const result = await polishText(originalText, settings);
      const output = renderFullPolishedDocument(originalText, result);
      elements.editor.value = output;
      updateCursorPosition();
      saveValue(STORAGE_KEYS.editor, output);
      return;
    }

    const blocks = findPolishBlocks(originalText);
    const nonEmptyBlocks = blocks.filter((block) => block.content.trim());

    if (!blocks.length) {
      throw new Error("找不到 {{ }} 標記的文字。");
    }
    if (!nonEmptyBlocks.length) {
      throw new Error("{{ }} 內沒有可潤飾的文字。");
    }

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
    elements.editor.value = output;
    updateCursorPosition();
    saveValue(STORAGE_KEYS.editor, output);
  } catch (error) {
    reportError(error.message || "潤飾失敗");
    if (!elements.apiKey.value.trim()) elements.settingsDialog.showModal();
  } finally {
    setBusy(false);
    elements.editor.focus();
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
  updateCursorPosition();
  elements.searchInput.value = "";
  elements.searchForm.hidden = true;
  elements.replacePrompt.checked = false;
  applyPolishMode(DEFAULTS.polishMode, false);
  applyWordWrap(false, false);
  elements.systemPrompt.value = DEFAULTS.systemPrompt;
  elements.contextSystemPrompt.value = DEFAULTS.contextSystemPrompt;
  renderProvider(DEFAULTS.provider);
  applyFontSize(DEFAULTS.fontSize, false);
}

let saveTimer;
elements.editor.addEventListener("input", () => {
  updateCursorPosition();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveValue(STORAGE_KEYS.editor, elements.editor.value);
  }, 250);
});

["click", "keyup", "select"].forEach((eventName) => {
  elements.editor.addEventListener(eventName, updateCursorPosition);
});

elements.editor.addEventListener("keydown", handleArrowSelection);

document.addEventListener("selectionchange", () => {
  if (document.activeElement === elements.editor) updateCursorPosition();
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

loadState();
