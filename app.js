import {
  buildResponsesUrl,
  extractResponseText,
  findPolishBlocks,
  renderPolishedDocument,
} from "./core.js?v=2";

const STORAGE_KEYS = {
  editor: "cguAiEditor.content",
  apiKey: "cguAiEditor.apiKey",
  endpoint: "cguAiEditor.endpoint",
  model: "cguAiEditor.model",
  systemPrompt: "cguAiEditor.systemPrompt",
};

const DEFAULTS = {
  endpoint: "https://air.cgu.edu.tw/cgullmapi/v1",
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  serviceTier: "default",
  systemPrompt: [
    "你是繁體中文文字編輯助手。",
    "請在不改變原意、不新增未提供事實的前提下，將文字潤飾得通順、精簡、清楚。",
    "保留原文的專有名詞、數字、格式與語氣層級。",
    "只輸出潤飾後的文字，不要加入標題、說明、引號或 Markdown 程式碼框。",
  ].join("\n"),
};

const elements = {
  editor: document.querySelector("#editor"),
  polishBtn: document.querySelector("#polishBtn"),
  settingsBtn: document.querySelector("#settingsBtn"),
  promptBtn: document.querySelector("#promptBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  settingsDialog: document.querySelector("#settingsDialog"),
  promptDialog: document.querySelector("#promptDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  promptForm: document.querySelector("#promptForm"),
  apiKey: document.querySelector("#apiKey"),
  endpoint: document.querySelector("#endpoint"),
  model: document.querySelector("#model"),
  systemPrompt: document.querySelector("#systemPrompt"),
  toggleKeyBtn: document.querySelector("#toggleKeyBtn"),
  resetPromptBtn: document.querySelector("#resetPromptBtn"),
};

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

function getSettings() {
  return {
    apiKey: elements.apiKey.value.trim(),
    endpoint: (elements.endpoint.value.trim() || DEFAULTS.endpoint).replace(/\/+$/, ""),
    model: elements.model.value,
    systemPrompt: elements.systemPrompt.value.trim() || DEFAULTS.systemPrompt,
    reasoningEffort: DEFAULTS.reasoningEffort,
    serviceTier: DEFAULTS.serviceTier,
  };
}

function loadState() {
  elements.editor.value = loadValue(STORAGE_KEYS.editor, "");
  elements.apiKey.value = loadValue(STORAGE_KEYS.apiKey, "");
  elements.endpoint.value = loadValue(STORAGE_KEYS.endpoint, DEFAULTS.endpoint);

  const storedModel = loadValue(STORAGE_KEYS.model, DEFAULTS.model);
  elements.model.value = ["gpt-5.6-luna", "gpt-5.6-sol"].includes(storedModel)
    ? storedModel
    : DEFAULTS.model;

  elements.systemPrompt.value = loadValue(STORAGE_KEYS.systemPrompt, DEFAULTS.systemPrompt);
}

function saveSettings() {
  const settings = getSettings();
  saveValue(STORAGE_KEYS.apiKey, settings.apiKey);
  saveValue(STORAGE_KEYS.endpoint, settings.endpoint || DEFAULTS.endpoint);
  saveValue(STORAGE_KEYS.model, settings.model);
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
  elements.clearBtn.disabled = busy;
  elements.polishBtn.textContent = busy ? "潤飾中…" : "潤飾";
}

async function polishText(content, settings) {
  const response = await fetch(buildResponsesUrl(settings.endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      instructions: settings.systemPrompt,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `請潤飾以下文字。只回傳潤飾結果：\n\n${content}`,
            },
          ],
        },
      ],
      reasoning: { effort: settings.reasoningEffort },
      service_tier: settings.serviceTier,
      max_output_tokens: 4096,
    }),
  });

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

  return extractResponseText(data);
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
      const result = await polishText(block.content.trim(), settings);
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
  const confirmed = window.confirm("確定清除文章、API Key、Endpoint、模型與 System prompt？");
  if (!confirmed) return;

  removeAppStorage();
  elements.editor.value = "";
  elements.apiKey.value = "";
  elements.endpoint.value = DEFAULTS.endpoint;
  elements.model.value = DEFAULTS.model;
  elements.systemPrompt.value = DEFAULTS.systemPrompt;
}

let saveTimer;
elements.editor.addEventListener("input", () => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveValue(STORAGE_KEYS.editor, elements.editor.value);
  }, 250);
});

elements.settingsBtn.addEventListener("click", () => elements.settingsDialog.showModal());
elements.promptBtn.addEventListener("click", () => elements.promptDialog.showModal());
elements.polishBtn.addEventListener("click", runPolish);
elements.copyBtn.addEventListener("click", copyEditor);
elements.downloadBtn.addEventListener("click", downloadEditor);
elements.clearBtn.addEventListener("click", clearRecords);

elements.settingsForm.addEventListener("submit", () => {
  saveSettings();
});

elements.promptForm.addEventListener("submit", () => {
  saveValue(STORAGE_KEYS.systemPrompt, elements.systemPrompt.value.trim() || DEFAULTS.systemPrompt);
});

elements.resetPromptBtn.addEventListener("click", () => {
  elements.systemPrompt.value = DEFAULTS.systemPrompt;
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
