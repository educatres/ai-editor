import assert from "node:assert/strict";
import {
  ORIGINAL_MARKER,
  PROVIDERS,
  CONTEXT_MODE_SYSTEM_PROMPT,
  appendContextModeSystemPrompt,
  buildPreviewRows,
  buildContextPolishInput,
  buildProviderRequest,
  buildResponsesUrl,
  extractProviderText,
  extractResponseText,
  findPolishBlocks,
  findSearchMatch,
  formatOriginalBlock,
  getHistoryShortcutKey,
  renderFullPolishedDocument,
  renderPolishedDocument,
  unescapeSpecialBraces,
  wrapPreviewLines,
} from "./core.js";
import { PROMPT_PRESETS, PROMPT_SEPARATOR, mergePromptText } from "./prompt-presets.js";

assert.equal(
  buildResponsesUrl("https://air.cgu.edu.tw/cgullmapi/v1/"),
  "https://air.cgu.edu.tw/cgullmapi/v1/responses",
);
assert.equal(
  buildResponsesUrl("https://example.com/v1/responses"),
  "https://example.com/v1/responses",
);

assert.equal(PROVIDERS.openai.models.length, 5);
assert.equal(PROVIDERS.gemini.models.length, 5);
assert.equal(PROVIDERS.claude.models.length, 5);

assert.equal(getHistoryShortcutKey({ key: "z" }), "z");
assert.equal(getHistoryShortcutKey({ code: "KeyY" }), "y");
assert.equal(getHistoryShortcutKey({ key: "Unidentified", keyCode: 54 }), "z");
assert.equal(getHistoryShortcutKey({ key: "Unidentified", keyCode: 53 }), "y");
assert.equal(getHistoryShortcutKey({ key: "Undo" }), "z");
assert.equal(getHistoryShortcutKey({ key: "Redo" }), "y");
assert.equal(getHistoryShortcutKey({ keyIdentifier: "U+005A" }), "z");
assert.equal(getHistoryShortcutKey({ keyIdentifier: "U+0059" }), "y");
assert.equal(getHistoryShortcutKey({ key: "Unidentified", keyCode: 55 }), null);

const sharedSettings = {
  apiKey: "test-key",
  systemPrompt: "只輸出結果",
  reasoningEffort: "medium",
  serviceTier: "default",
};

const openAiRequest = buildProviderRequest("原文", {
  ...sharedSettings,
  provider: "openai",
  endpoint: PROVIDERS.openai.endpoint,
  model: PROVIDERS.openai.models[0],
});
assert.equal(openAiRequest.url, "https://api.openai.com/v1/responses");
assert.equal(openAiRequest.options.headers.Authorization, "Bearer test-key");
assert.equal(JSON.parse(openAiRequest.options.body).model, "gpt-5.6-sol");

const geminiRequest = buildProviderRequest("原文", {
  ...sharedSettings,
  provider: "gemini",
  endpoint: PROVIDERS.gemini.endpoint,
  model: PROVIDERS.gemini.models[0],
});
const geminiBody = JSON.parse(geminiRequest.options.body);
assert.equal(
  geminiRequest.url,
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
);
assert.equal(geminiRequest.options.headers["x-goog-api-key"], "test-key");
assert.equal(geminiBody.systemInstruction.parts[0].text, "只輸出結果");

const claudeRequest = buildProviderRequest("原文", {
  ...sharedSettings,
  provider: "claude",
  endpoint: PROVIDERS.claude.endpoint,
  model: PROVIDERS.claude.models[0],
});
const claudeBody = JSON.parse(claudeRequest.options.body);
assert.equal(claudeRequest.url, "https://api.anthropic.com/v1/messages");
assert.equal(claudeRequest.options.headers["x-api-key"], "test-key");
assert.equal(claudeRequest.options.headers["anthropic-version"], "2023-06-01");
assert.equal(claudeBody.model, "claude-fable-5");

assert.equal(
  extractProviderText("gemini", {
    candidates: [{ content: { parts: [{ text: "內部思考", thought: true }, { text: "Gemini 完成" }] } }],
  }),
  "Gemini 完成",
);
assert.equal(
  extractProviderText("claude", {
    content: [{ type: "thinking", thinking: "內部思考" }, { type: "text", text: "Claude 完成" }],
  }),
  "Claude 完成",
);

const sample = "前文\n{{原文一}}\n中段\n{{原文二}}\n結尾";
const blocks = findPolishBlocks(sample);
assert.equal(blocks.length, 2);
assert.equal(blocks[0].content, "原文一");
assert.equal(blocks[1].content, "原文二");

const results = new Map([
  [blocks[0].start, "潤飾一"],
  [blocks[1].start, "潤飾二"],
]);
assert.equal(
  renderPolishedDocument(sample, blocks, results),
  `前文
${ORIGINAL_MARKER}
原文一
${ORIGINAL_MARKER}
潤飾一
中段
${ORIGINAL_MARKER}
原文二
${ORIGINAL_MARKER}
潤飾二
結尾`,
);

assert.equal(
  formatOriginalBlock("第一行\n\n第二行"),
  `${ORIGINAL_MARKER}\n第一行\n\n第二行\n${ORIGINAL_MARKER}`,
);

const multilineSample = "開頭\n{{第一行\n\n第二行}}\n結尾";
const multilineBlocks = findPolishBlocks(multilineSample);
const multilineResults = new Map([[multilineBlocks[0].start, "```text\n結果：新版第一行\n新版第二行\n```"]]);
const multilineOutput = renderPolishedDocument(multilineSample, multilineBlocks, multilineResults);
assert.equal(
  multilineOutput,
  `開頭
${ORIGINAL_MARKER}
第一行

第二行
${ORIGINAL_MARKER}
新版第一行
新版第二行
結尾`,
);
assert.equal(multilineOutput.includes("{{"), false);
assert.equal(multilineOutput.includes("}}"), false);

const escapedSample = String.raw`字面 \{\{不是標記\}\}
{{內容 \{大括號\} 與路徑 C:\temp}}`;
const escapedBlocks = findPolishBlocks(escapedSample);
assert.equal(escapedBlocks.length, 1);
assert.equal(escapedBlocks[0].content, String.raw`內容 \{大括號\} 與路徑 C:\temp`);
const escapedResults = new Map([
  [escapedBlocks[0].start, String.raw`完成 \{結果\} 與 C:\new`],
]);
assert.equal(
  renderPolishedDocument(escapedSample, escapedBlocks, escapedResults),
  String.raw`字面 {{不是標記}}
#潤飾前------------------
內容 {大括號} 與路徑 C:\temp
#潤飾前------------------
完成 {結果} 與 C:\new`,
);
assert.equal(
  unescapeSpecialBraces(String.raw`\{文字\} \n \* \\`),
  String.raw`{文字} \n \* \\`,
);

const contextSample = "前文內容\n{{第一個目標}}\n中間上下文\n{{第二個目標}}\n結尾內容";
const contextBlocks = findPolishBlocks(contextSample);
const contextInput = buildContextPolishInput(contextSample, contextBlocks[1], 1, 2);
assert.equal(contextInput.includes("前文內容"), true);
assert.equal(contextInput.includes("中間上下文"), true);
assert.equal(contextInput.includes("結尾內容"), true);
assert.equal(
  contextInput.includes("{{<<<POLISH_TARGET_START>>>第二個目標<<<POLISH_TARGET_END>>>}}"),
  true,
);
assert.equal(contextInput.includes("第 2 組，共 2 組"), true);
assert.equal(CONTEXT_MODE_SYSTEM_PROMPT.includes("其他文字只供理解上下文，不得改寫"), true);
assert.equal(
  appendContextModeSystemPrompt("原本的 System prompt"),
  `原本的 System prompt\n\n===只潤飾 {{ }} 但含上下文：模式專用規則===\n${CONTEXT_MODE_SYSTEM_PROMPT}`,
);
assert.equal(
  appendContextModeSystemPrompt("原本的 System prompt", "自訂含上下文規則"),
  "原本的 System prompt\n\n===只潤飾 {{ }} 但含上下文：模式專用規則===\n自訂含上下文規則",
);
assert.equal(
  appendContextModeSystemPrompt("原本的 System prompt", "   "),
  `原本的 System prompt\n\n===只潤飾 {{ }} 但含上下文：模式專用規則===\n${CONTEXT_MODE_SYSTEM_PROMPT}`,
);

assert.deepEqual(findSearchMatch("Alpha beta ALPHA", "alpha", 0, 1), { start: 0, end: 5 });
assert.deepEqual(findSearchMatch("Alpha beta ALPHA", "alpha", 5, 1), { start: 11, end: 16 });
assert.deepEqual(findSearchMatch("Alpha beta ALPHA", "alpha", 16, 1), { start: 0, end: 5 });
assert.deepEqual(findSearchMatch("Alpha beta ALPHA", "alpha", -1, -1), { start: 11, end: 16 });
assert.equal(findSearchMatch("Alpha", "missing", 0, 1), null);

assert.deepEqual(wrapPreviewLines("12345", 2), ["12", "34", "5"]);
assert.deepEqual(wrapPreviewLines("第一行\n\n第二行", 20), ["第一行", "", "第二行"]);
assert.deepEqual(wrapPreviewLines("第一行\r\n第二行\r第三行", 20), ["第一行", "第二行", "第三行"]);
assert.deepEqual(wrapPreviewLines("文字\n", 20), ["文字", ""]);
assert.deepEqual(wrapPreviewLines("不換行\n第二行", null), ["不換行", "第二行"]);
assert.deepEqual(wrapPreviewLines("A👨‍👩‍👧‍👦B", 2), ["A👨‍👩‍👧‍👦", "B"]);
assert.deepEqual(buildPreviewRows("12345\n第二行", 2), [
  { text: "12", lineNumber: 1 },
  { text: "34", lineNumber: null },
  { text: "5", lineNumber: null },
  { text: "第二", lineNumber: 2 },
  { text: "行", lineNumber: null },
]);
assert.deepEqual(buildPreviewRows("第一行\n\n第三行", null), [
  { text: "第一行", lineNumber: 1 },
  { text: "", lineNumber: 2 },
  { text: "第三行", lineNumber: 3 },
]);

assert.equal(PROMPT_PRESETS.general.content.startsWith("你是繁體中文文字編輯助手。"), true);
assert.equal(PROMPT_PRESETS.codex.content.includes("## 基本原則"), true);
assert.equal(PROMPT_PRESETS.codex.content.includes("### 十二、完成後交付內容"), true);
assert.equal(PROMPT_PRESETS.codexSection.label, "逐段潤飾模式");
assert.equal(PROMPT_PRESETS.codexSection.content.includes("## 上下文處理"), true);
assert.equal(PROMPT_PRESETS.codexSection.content.includes("不要自行整理成完整專案規格書"), true);
assert.equal(PROMPT_PRESETS.codexSection.content.includes("```markdown"), true);
assert.equal(
  mergePromptText("既有內容", PROMPT_PRESETS.general.content),
  `既有內容\n${PROMPT_SEPARATOR}\n${PROMPT_PRESETS.general.content}`,
);
assert.equal(
  mergePromptText("既有內容\n", "新增內容"),
  `既有內容\n${PROMPT_SEPARATOR}\n新增內容`,
);
assert.equal(mergePromptText("既有內容", "新增內容", true), "新增內容");
assert.equal(mergePromptText("", PROMPT_PRESETS.general.content), PROMPT_PRESETS.general.content);

const fullOriginal = String.raw`全文 {{不解析}} \{不跳脫\}`;
assert.equal(
  renderFullPolishedDocument(fullOriginal, "```text\n結果：全文完成\n```"),
  `${ORIGINAL_MARKER}\n${fullOriginal}\n${ORIGINAL_MARKER}\n全文完成`,
);

assert.equal(extractResponseText({ output_text: "完成" }), "完成");
assert.equal(
  extractResponseText({ output: [{ content: [{ type: "output_text", text: "完成二" }] }] }),
  "完成二",
);

assert.throws(() => findPolishBlocks("{{未結束"));
assert.throws(() => findPolishBlocks("錯誤}}"));
assert.throws(() => findPolishBlocks("{{外{{內}}"));

console.log("All tests passed.");
