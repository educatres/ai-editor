export function findPolishBlocks(text) {
  const blocks = [];
  const tokenPattern = /\{\{|\}\}/g;
  let openIndex = null;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match[0] === "{{") {
      if (openIndex !== null) {
        throw new Error("偵測到巢狀或重複的 {{，請檢查標記。");
      }
      openIndex = match.index;
      continue;
    }

    if (openIndex === null) {
      throw new Error("偵測到沒有起始符號的 }}，請檢查標記。");
    }

    blocks.push({
      start: openIndex,
      end: match.index + 2,
      content: text.slice(openIndex + 2, match.index),
    });
    openIndex = null;
  }

  if (openIndex !== null) {
    throw new Error("偵測到未完整配對的 {{ }}，請先修正標記。");
  }

  return blocks;
}

export function buildResponsesUrl(endpoint) {
  const clean = endpoint.trim().replace(/\/+$/, "");
  if (/\/responses$/i.test(clean)) return clean;
  return `${clean}/responses`;
}

export function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const texts = [];
  for (const outputItem of data?.output ?? []) {
    for (const contentItem of outputItem?.content ?? []) {
      if (typeof contentItem?.text === "string") texts.push(contentItem.text);
      else if (typeof contentItem?.text?.value === "string") texts.push(contentItem.text.value);
      else if (typeof contentItem?.value === "string") texts.push(contentItem.value);
    }
  }

  const result = texts.join("\n").trim();
  if (!result) throw new Error("API 已回應，但找不到可用的文字內容。");
  return result;
}

export function cleanModelOutput(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:markdown|md|text)?\s*/i, "").replace(/\s*```$/, "");
  cleaned = cleaned.replace(/^(?:潤飾後(?:文字|內容|結果)?|結果)\s*[:：]\s*/i, "");
  return cleaned.trim();
}

export function formatAsCommentLines(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `# ${line}` : "#"))
    .join("\n");
}

export function renderPolishedDocument(originalText, blocks, results) {
  const blockByStart = new Map(blocks.map((block) => [block.start, block]));
  const insertions = new Map();

  for (const block of blocks) {
    const result = results.get(block.start);
    if (!block.content.trim() || !result) continue;

    const lineBreak = originalText.indexOf("\n", block.end);
    const insertionPoint = lineBreak === -1 ? originalText.length : lineBreak + 1;
    const items = insertions.get(insertionPoint) ?? [];
    items.push(cleanModelOutput(result));
    insertions.set(insertionPoint, items);
  }

  let output = "";
  let index = 0;

  while (index <= originalText.length) {
    const pending = insertions.get(index);
    if (pending?.length) {
      if (output && !output.endsWith("\n")) output += "\n";
      output += pending.join("\n");
      if (index < originalText.length) output += "\n";
    }

    if (index === originalText.length) break;

    const block = blockByStart.get(index);
    if (block) {
      output += formatAsCommentLines(block.content);
      index = block.end;
      continue;
    }

    output += originalText[index];
    index += 1;
  }

  return output;
}
