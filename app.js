import {
  PROVIDERS,
  buildProviderRequest,
  extractProviderText,
  findPolishBlocks,
  findSearchMatch,
  getProvider,
  renderPolishedDocument,
  unescapeSpecialBraces,
} from "./core.js?v=4";
import { PROMPT_PRESETS, appendPromptText } from "./prompt-presets.js?v=1";

const STORAGE_KEYS = {
  editor: "cguAiEditor.content",
  provider: "cguAiEditor.provider",
  providerConfigs: "cguAiEditor.providerConfigs",
  apiKey: "cguAiEditor.apiKey",
  endpoint: "cguAiEditor.endpoint",
  model: "cguAiEditor.model",
  systemPrompt: "cguAiEditor.systemPrompt",
  searchTerm: "cguAiEditor.searchTerm",
  fontSize: "cguAiEditor.fontSize",
};

const DEFAULTS = {
  provider: "cgu",
  fontSize: 16,
  minFontSize: 12,
  maxFontSize: 32,
  fontSizeStep: 2,
  reasoningEffort: "medium",
  serviceTier: "default",
  systemPrompt: PROMPT_PRESETS.general.content,
};

const elements = {
  editor: document.querySelector("#editor"),
  polishBtn: document.querySelector("#polishBtn"),
  settingsBtn: document.querySelector("#settingsBtn"),
  promptBtn: document.querySelector("#promptBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  searchBtn: document.querySelector("#searchBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  zoomInBtn: document.querySelector("#zoomInBtn"),
  zoomOutBtn: document.querySelector("#zoomOutBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  searchDialog: document.querySelector("#searchDialog"),
  settingsDialog: document.querySelector("#settingsDialog"),
  promptDialog: document.querySelector("#promptDialog"),
  searchForm: document.querySelector("#searchForm"),
  settingsForm: document.querySelector("#settingsForm"),
  promptForm: document.querySelector("#promptForm"),
  searchInput: document.querySelector("#searchInput"),
  searchPrevBtn: document.querySelector("#searchPrevBtn"),
  provider: document.querySelector("#provider"),
  apiKey: document.querySelector("#apiKey"),
  endpoint: document.querySelector("#endpoint"),
  model: document.querySelector("#model"),
  providerHint: document.querySelector("#providerHint"),
  systemPrompt: document.querySelector("#systemPrompt"),
  toggleKeyBtn: document.querySelector("#toggleKeyBtn"),
  appendGeneralPromptBtn: document.querySelector("#appendGeneralPromptBtn"),
  appendCodexPromptBtn: document.querySelector("#appendCodexPromptBtn"),
};

let activeProvider = DEFAULTS.provider;
let providerConfigs = {};
let editorFontSize = DEFAULTS.fontSize;

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

function loadState() {
  elements.editor.value = loadValue(STORAGE_KEYS.editor, "");
  loadProviderConfigs();
  const storedProvider = loadValue(STORAGE_KEYS.provider, DEFAULTS.provider);
  renderProvider(PROVIDERS[storedProvider] ? storedProvider : DEFAULTS.provider);
  elements.systemPrompt.value = loadValue(STORAGE_KEYS.systemPrompt, DEFAULTS.systemPrompt);
  elements.searchInput.value = loadValue(STORAGE_KEYS.searchTerm, "");
  applyFontSize(loadValue(STORAGE_KEYS.fontSize, String(DEFAULTS.fontSize)), false);
}

function saveSettings() {
  const settings = getSettings();
  captureProviderConfig();
  saveValue(STORAGE_KEYS.provider, activeProvider);
  saveValue(STORAGE_KEYS.providerConfigs, JSON.stringify(providerConfigs));
  saveValue(STORAGE_KEYS.systemPrompt, settings.systemPrompt);
}

function reportError(message) {
  window.alert(message);
}

function setBusy(busy) {
  elements.polishBtn.disabled = busy;
  elements.editor.disabled = busy;
  elements.settingsBtn.disabled = busy;
  elements.promptBtn.disabled = busy;
  elements.searchBtn.disabled = busy;
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
    for (let index = 0; index < nonEmptyBlocks.length; index += 1) {
      const block = nonEmptyBlocks[index];
      const result = await polishText(unescapeSpecialBraces(block.content.trim()), settings);
      results.set(block.start, result);
    }

    const output = renderPolishedDocument(originalText, blocks, results);
    elements.editor.value = output;
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
  elements.searchDialog.close();
  elements.editor.focus();
  elements.editor.setSelectionRange(match.start, match.end);
}

function changeFontSize(delta) {
  applyFontSize(editorFontSize + delta);
  elements.editor.focus();
}

function appendPromptPreset(preset) {
  elements.systemPrompt.value = appendPromptText(elements.systemPrompt.value, preset.content);
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
  elements.searchInput.value = "";
  elements.systemPrompt.value = DEFAULTS.systemPrompt;
  renderProvider(DEFAULTS.provider);
  applyFontSize(DEFAULTS.fontSize, false);
}

let saveTimer;
elements.editor.addEventListener("input", () => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveValue(STORAGE_KEYS.editor, elements.editor.value);
  }, 250);
});

elements.searchInput.addEventListener("input", () => {
  saveValue(STORAGE_KEYS.searchTerm, elements.searchInput.value);
});

elements.settingsBtn.addEventListener("click", () => elements.settingsDialog.showModal());
elements.searchBtn.addEventListener("click", () => {
  elements.searchDialog.showModal();
  elements.searchInput.focus();
  elements.searchInput.select();
});
elements.provider.addEventListener("change", () => {
  captureProviderConfig();
  renderProvider(elements.provider.value);
});
elements.promptBtn.addEventListener("click", () => elements.promptDialog.showModal());
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

elements.settingsForm.addEventListener("submit", () => {
  saveSettings();
});

elements.promptForm.addEventListener("submit", () => {
  saveValue(STORAGE_KEYS.systemPrompt, elements.systemPrompt.value.trim() || DEFAULTS.systemPrompt);
});

elements.appendGeneralPromptBtn.addEventListener("click", () => {
  appendPromptPreset(PROMPT_PRESETS.general);
});

elements.appendCodexPromptBtn.addEventListener("click", () => {
  appendPromptPreset(PROMPT_PRESETS.codex);
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
