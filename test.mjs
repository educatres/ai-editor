import assert from "node:assert/strict";
import {
  PROVIDERS,
  buildProviderRequest,
  buildResponsesUrl,
  extractProviderText,
  extractResponseText,
  findPolishBlocks,
  findSearchMatch,
  formatAsCommentLines,
  renderPolishedDocument,
  unescapeSpecialBraces,
} from "./core.js";
import { PROMPT_PRESETS, appendPromptText } from "./prompt-presets.js";

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

const sample = "前文\n{{原文一}}\n中段 {{原文二}} 後段\n結尾";
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
  "前文\n# 原文一\n潤飾一\n中段 # 原文二 後段\n潤飾二\n結尾",
);

assert.equal(formatAsCommentLines("第一行\n\n第二行"), "# 第一行\n#\n# 第二行");
assert.equal(formatAsCommentLines("結果：原文"), "# 結果：原文");

const multilineSample = "開頭\n{{第一行\n\n第二行}}\n結尾";
const multilineBlocks = findPolishBlocks(multilineSample);
const multilineResults = new Map([[multilineBlocks[0].start, "```text\n結果：新版第一行\n新版第二行\n```"]]);
const multilineOutput = renderPolishedDocument(multilineSample, multilineBlocks, multilineResults);
assert.equal(multilineOutput, "開頭\n# 第一行\n#\n# 第二行\n新版第一行\n新版第二行\n結尾");
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
# 內容 {大括號} 與路徑 C:\temp
完成 {結果} 與 C:\new`,
);
assert.equal(
  unescapeSpecialBraces(String.raw`\{文字\} \n \* \\`),
  String.raw`{文字} \n \* \\`,
);

assert.deepEqual(findSearchMatch("Alpha beta ALPHA", "alpha", 0, 1), { start: 0, end: 5 });
assert.deepEqual(findSearchMatch("Alpha beta ALPHA", "alpha", 5, 1), { start: 11, end: 16 });
assert.deepEqual(findSearchMatch("Alpha beta ALPHA", "alpha", 16, 1), { start: 0, end: 5 });
assert.deepEqual(findSearchMatch("Alpha beta ALPHA", "alpha", -1, -1), { start: 11, end: 16 });
assert.equal(findSearchMatch("Alpha", "missing", 0, 1), null);

assert.equal(PROMPT_PRESETS.general.content.startsWith("你是繁體中文文字編輯助手。"), true);
assert.equal(PROMPT_PRESETS.codex.content.includes("## 基本原則"), true);
assert.equal(PROMPT_PRESETS.codex.content.includes("### 十二、完成後交付內容"), true);
assert.equal(
  appendPromptText("既有內容", PROMPT_PRESETS.general.content),
  `既有內容\n\n${PROMPT_PRESETS.general.content}`,
);
assert.equal(appendPromptText("", PROMPT_PRESETS.general.content), PROMPT_PRESETS.general.content);

assert.equal(extractResponseText({ output_text: "完成" }), "完成");
assert.equal(
  extractResponseText({ output: [{ content: [{ type: "output_text", text: "完成二" }] }] }),
  "完成二",
);

assert.throws(() => findPolishBlocks("{{未結束"));
assert.throws(() => findPolishBlocks("錯誤}}"));
assert.throws(() => findPolishBlocks("{{外{{內}}"));

console.log("All tests passed.");
