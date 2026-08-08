import { wrapPreviewLines } from "./core.js?v=12";

const STORAGE_KEYS = {
  content: "cguAiEditor.content",
  wrap: "cguAiEditor.previewWrap",
  fontSize: "cguAiEditor.previewFontSize",
};
const SNAPSHOT_KEY = "cguAiEditor.previewSnapshot";
const WRAP_OPTIONS = new Set(["20", "40", "60", "none"]);
const FONT_SIZE = { default: 16, min: 12, max: 40, step: 2 };

const elements = {
  wrapWidth: document.querySelector("#wrapWidth"),
  fontSmallerBtn: document.querySelector("#fontSmallerBtn"),
  fontLargerBtn: document.querySelector("#fontLargerBtn"),
  fontSizeOutput: document.querySelector("#fontSizeOutput"),
  previewContent: document.querySelector("#previewContent"),
};

function loadStorage(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preview remains usable when persistent storage is unavailable.
  }
}

function loadPreviewText() {
  try {
    const snapshot = sessionStorage.getItem(SNAPSHOT_KEY);
    if (snapshot !== null) {
      sessionStorage.removeItem(SNAPSHOT_KEY);
      return snapshot;
    }
  } catch {
    // Fall back to the last saved editor content.
  }
  return loadStorage(STORAGE_KEYS.content, "");
}

let previewText = loadPreviewText();
let previewFontSize = Number.parseInt(loadStorage(STORAGE_KEYS.fontSize, ""), 10);
if (!Number.isFinite(previewFontSize)) previewFontSize = FONT_SIZE.default;
previewFontSize = Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, previewFontSize));

const storedWrap = loadStorage(STORAGE_KEYS.wrap, "40");
elements.wrapWidth.value = WRAP_OPTIONS.has(storedWrap) ? storedWrap : "40";

function renderPreview() {
  const width = elements.wrapWidth.value === "none"
    ? null
    : Number(elements.wrapWidth.value);
  const lines = wrapPreviewLines(previewText, width);
  const fragment = document.createDocumentFragment();
  elements.previewContent.style.setProperty("--line-number-digits", String(lines.length).length);

  lines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = "preview-line";

    const number = document.createElement("span");
    number.className = "preview-line-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = String(index + 1);

    const content = document.createElement("span");
    content.className = "preview-line-text";
    content.textContent = line || "\u200b";
    row.append(number, content);
    fragment.append(row);
  });

  elements.previewContent.replaceChildren(fragment);
}

function applyFontSize(value, persist = true) {
  previewFontSize = Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, value));
  document.documentElement.style.setProperty("--preview-font-size", `${previewFontSize}px`);
  elements.fontSizeOutput.value = `${previewFontSize}px`;
  elements.fontSmallerBtn.disabled = previewFontSize <= FONT_SIZE.min;
  elements.fontLargerBtn.disabled = previewFontSize >= FONT_SIZE.max;
  if (persist) saveStorage(STORAGE_KEYS.fontSize, String(previewFontSize));
}

elements.wrapWidth.addEventListener("change", () => {
  saveStorage(STORAGE_KEYS.wrap, elements.wrapWidth.value);
  renderPreview();
});
elements.fontSmallerBtn.addEventListener("click", () => applyFontSize(previewFontSize - FONT_SIZE.step));
elements.fontLargerBtn.addEventListener("click", () => applyFontSize(previewFontSize + FONT_SIZE.step));

applyFontSize(previewFontSize, false);
renderPreview();
