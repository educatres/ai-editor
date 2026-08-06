import assert from "node:assert/strict";
import {
  buildResponsesUrl,
  extractResponseText,
  findPolishBlocks,
  formatAsCommentLines,
  renderPolishedDocument,
} from "./core.js";

assert.equal(
  buildResponsesUrl("https://air.cgu.edu.tw/cgullmapi/v1/"),
  "https://air.cgu.edu.tw/cgullmapi/v1/responses",
);
assert.equal(
  buildResponsesUrl("https://example.com/v1/responses"),
  "https://example.com/v1/responses",
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
  "前文\n原文一\n# 潤飾一\n中段 原文二 後段\n# 潤飾二\n結尾",
);

assert.equal(formatAsCommentLines("第一行\n\n第二行"), "# 第一行\n#\n# 第二行");
assert.equal(formatAsCommentLines("```text\n結果：修正版\n```"), "# 修正版");
assert.equal(extractResponseText({ output_text: "完成" }), "完成");
assert.equal(
  extractResponseText({ output: [{ content: [{ type: "output_text", text: "完成二" }] }] }),
  "完成二",
);

assert.throws(() => findPolishBlocks("{{未結束"));
assert.throws(() => findPolishBlocks("錯誤}}"));
assert.throws(() => findPolishBlocks("{{外{{內}}"));

console.log("All tests passed.");
