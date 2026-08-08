import { buildPreviewRows } from "./core.js?v=13";

const STORAGE_KEYS = {
  content: "cguAiEditor.content",
  wrap: "cguAiEditor.previewWrap",
  fontSize: "cguAiEditor.previewFontSize",
  theme: "cguAiEditor.theme",
};
const SNAPSHOT_KEY = "cguAiEditor.previewSnapshot";
const WRAP_OPTIONS = new Set(["20", "40", "60", "screen", "none"]);
const FONT_SIZE = { default: 16, min: 12, max: 40, step: 2 };
const THEMES = new Set([
  "default",
  "soft",
  "retro-green",
  "retro-gray",
  "retro-orange",
  "retro-yellow",
  "amber",
  "blue",
  "pale-scanline",
  "eye-care",
]);
const THEME_COLORS = {
  default: "#ffffff",
  soft: "#F4F1E8",
  "retro-green": "#050805",
  "retro-gray": "#070707",
  "retro-orange": "#090500",
  "retro-yellow": "#080808",
  amber: "#080808",
  blue: "#17164A",
  "pale-scanline": "#EEF1E8",
  "eye-care": "#D7E2DE",
};

const elements = {
  wrapWidth: document.querySelector("#wrapWidth"),
  fontSmallerBtn: document.querySelector("#fontSmallerBtn"),
  fontLargerBtn: document.querySelector("#fontLargerBtn"),
  fontSizeOutput: document.querySelector("#fontSizeOutput"),
  previewContent: document.querySelector("#previewContent"),
  themeBtn: document.querySelector("#themeBtn"),
  themeMenu: document.querySelector("#themeMenu"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
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
  const wrapMode = elements.wrapWidth.value;
  const width = ["screen", "none"].includes(wrapMode) ? null : Number(wrapMode);
  const rows = buildPreviewRows(previewText, width);
  const fragment = document.createDocumentFragment();
  const physicalLineCount = previewText.replace(/\r\n?/g, "\n").split("\n").length;
  elements.previewContent.style.setProperty("--line-number-digits", String(physicalLineCount).length);
  elements.previewContent.classList.toggle("is-screen-wrap", wrapMode === "screen");

  rows.forEach(({ text, lineNumber }) => {
    const row = document.createElement("div");
    row.className = "preview-line";

    const number = document.createElement("span");
    number.className = "preview-line-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = lineNumber === null ? "" : String(lineNumber);

    const content = document.createElement("span");
    content.className = "preview-line-text";
    content.textContent = text || "\u200b";
    row.append(number, content);
    fragment.append(row);
  });

  elements.previewContent.replaceChildren(fragment);
}

function closeThemeMenu({ restoreFocus = false } = {}) {
  elements.themeMenu.hidden = true;
  elements.themeBtn.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.themeBtn.focus({ preventScroll: true });
}

function openThemeMenu({ focusFirst = false } = {}) {
  elements.themeMenu.hidden = false;
  elements.themeBtn.setAttribute("aria-expanded", "true");
  if (focusFirst) elements.themeMenu.querySelector("button")?.focus({ preventScroll: true });
}

function applyTheme(theme, persist = true) {
  const selectedTheme = THEMES.has(theme) ? theme : "default";
  if (selectedTheme === "default") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = selectedTheme;

  elements.themeMenu.querySelectorAll("[data-theme]").forEach((button) => {
    button.setAttribute("aria-checked", String(button.dataset.theme === selectedTheme));
  });
  elements.themeColor.content = THEME_COLORS[selectedTheme];
  if (persist) saveStorage(STORAGE_KEYS.theme, selectedTheme);
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
elements.themeBtn.addEventListener("click", () => {
  if (elements.themeMenu.hidden) openThemeMenu();
  else closeThemeMenu();
});
elements.themeBtn.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown") return;
  event.preventDefault();
  openThemeMenu({ focusFirst: true });
});
elements.themeMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-theme]");
  if (!option) return;
  applyTheme(option.dataset.theme);
  closeThemeMenu({ restoreFocus: true });
});
elements.themeMenu.addEventListener("keydown", (event) => {
  const options = [...elements.themeMenu.querySelectorAll("[data-theme]")];
  const currentIndex = options.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    closeThemeMenu({ restoreFocus: true });
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  let nextIndex = event.key === "Home" ? 0 : options.length - 1;
  if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % options.length;
  if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + options.length) % options.length;
  options[nextIndex].focus({ preventScroll: true });
});
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".theme-picker")) closeThemeMenu();
});
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEYS.theme && event.newValue !== null) {
    applyTheme(event.newValue, false);
  }
});

applyTheme(loadStorage(STORAGE_KEYS.theme, "default"), false);
applyFontSize(previewFontSize, false);
renderPreview();
