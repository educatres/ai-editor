export function findPolishBlocks(text) {
  const blocks = [];
  const tokenPattern = /\\[{}]|\{\{|\}\}/g;
  let openIndex = null;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match[0][0] === "\\") continue;

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

export function unescapeSpecialBraces(text) {
  return text.replace(/\\([{}])/g, "$1");
}

export function getHistoryShortcutKey(event) {
  const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
  const legacyKeyCode = event.keyCode || event.which;
  const hasUnknownKey = !event.key || event.key === "Unidentified";

  if (key === "z" || event.code === "KeyZ" || legacyKeyCode === 90
    || (hasUnknownKey && legacyKeyCode === 54)) {
    return "z";
  }
  if (key === "y" || event.code === "KeyY" || legacyKeyCode === 89
    || (hasUnknownKey && legacyKeyCode === 53)) {
    return "y";
  }
  return null;
}

export const CONTEXT_MODE_SYSTEM_PROMPT = `你目前正在執行「只潤飾 {{ }} 但含上下文」模式。
使用者訊息會提供完整文章，並以 <<<POLISH_TARGET_START>>> 與 <<<POLISH_TARGET_END>>> 標示本次唯一要潤飾的目標。
完整文章中的其他文字只供理解上下文，不得改寫、摘要或輸出。
只輸出兩個目標標記之間文字的潤飾結果，不得輸出目標標記、{{ }}、完整文章、標題、說明、引號或 Markdown 程式碼框。
保留目標文字的原意、專有名詞、數字、格式與語氣層級；\\{ 與 \\} 應視為一般大括號。`;

export function appendContextModeSystemPrompt(systemPrompt, contextModePrompt = CONTEXT_MODE_SYSTEM_PROMPT) {
  const basePrompt = systemPrompt.trim();
  const modePrompt = contextModePrompt.trim() || CONTEXT_MODE_SYSTEM_PROMPT;
  return `${basePrompt}\n\n===只潤飾 {{ }} 但含上下文：模式專用規則===\n${modePrompt}`;
}

export function buildContextPolishInput(originalText, block, targetIndex, targetCount) {
  const targetStart = block.start + 2;
  const targetEnd = block.end - 2;
  const annotatedText = `${originalText.slice(0, targetStart)}<<<POLISH_TARGET_START>>>${originalText.slice(targetStart, targetEnd)}<<<POLISH_TARGET_END>>>${originalText.slice(targetEnd)}`;

  return `以下是完整文章上下文。本次處理第 ${targetIndex + 1} 組，共 ${targetCount} 組標記。\n只潤飾目標標記之間的文字，其他內容僅供理解。只輸出潤飾後的目標文字。\n\n${annotatedText}`;
}

export function findSearchMatch(text, query, startIndex = 0, direction = 1) {
  if (!query) return null;
  const haystack = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  let index;

  if (direction < 0) {
    const from = startIndex < 0
      ? Math.max(0, haystack.length - 1)
      : Math.min(startIndex, Math.max(0, haystack.length - 1));
    index = haystack.lastIndexOf(needle, from);
    if (index === -1) index = haystack.lastIndexOf(needle);
  } else {
    const from = Math.min(Math.max(0, startIndex), haystack.length);
    index = haystack.indexOf(needle, from);
    if (index === -1 && from > 0) index = haystack.indexOf(needle);
  }

  return index === -1 ? null : { start: index, end: index + query.length };
}

export function buildResponsesUrl(endpoint) {
  const clean = endpoint.trim().replace(/\/+$/, "");
  if (/\/responses$/i.test(clean)) return clean;
  return `${clean}/responses`;
}

export const PROVIDERS = {
  cgu: {
    label: "CGU（現有）",
    endpoint: "https://air.cgu.edu.tw/cgullmapi/v1",
    models: ["gpt-5.6-luna", "gpt-5.6-sol"],
    hint: "OpenAI Responses 相容 API｜推理強度 medium｜速度 default",
  },
  openai: {
    label: "ChatGPT（OpenAI API）",
    endpoint: "https://api.openai.com/v1",
    models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4"],
    hint: "OpenAI Responses API｜推理強度 medium｜速度 default",
  },
  gemini: {
    label: "Gemini（Google AI）",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    models: [
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite",
    ],
    hint: "Google Gemini generateContent API",
  },
  claude: {
    label: "Claude（Anthropic API）",
    endpoint: "https://api.anthropic.com/v1",
    models: [
      "claude-fable-5",
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-haiku-4-5-20251001",
    ],
    hint: "Anthropic Messages API｜版本 2023-06-01",
  },
};

export function getProvider(providerId) {
  return PROVIDERS[providerId] ?? PROVIDERS.cgu;
}

function buildGeminiUrl(endpoint, model) {
  const clean = endpoint.trim().replace(/\/+$/, "");
  if (/:generateContent$/i.test(clean)) return clean;
  if (/\/models$/i.test(clean)) return `${clean}/${encodeURIComponent(model)}:generateContent`;
  return `${clean}/models/${encodeURIComponent(model)}:generateContent`;
}

function buildClaudeUrl(endpoint) {
  const clean = endpoint.trim().replace(/\/+$/, "");
  if (/\/messages$/i.test(clean)) return clean;
  return `${clean}/messages`;
}

export function buildProviderRequest(content, settings) {
  const prompt = `請潤飾以下文字。只回傳潤飾結果：\n\n${content}`;

  if (settings.provider === "gemini") {
    return {
      url: buildGeminiUrl(settings.endpoint, settings.model),
      options: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": settings.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: settings.systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 4096,
          },
        }),
      },
    };
  }

  if (settings.provider === "claude") {
    return {
      url: buildClaudeUrl(settings.endpoint),
      options: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: 4096,
          system: settings.systemPrompt,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      },
    };
  }

  return {
    url: buildResponsesUrl(settings.endpoint),
    options: {
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
                text: prompt,
              },
            ],
          },
        ],
        reasoning: { effort: settings.reasoningEffort },
        service_tier: settings.serviceTier,
        max_output_tokens: 4096,
      }),
    },
  };
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

export function extractProviderText(provider, data) {
  if (provider === "gemini") {
    const result = (data?.candidates ?? [])
      .flatMap((candidate) => candidate?.content?.parts ?? [])
      .filter((part) => !part?.thought && typeof part?.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (result) return result;
    throw new Error("Gemini 已回應，但找不到可用的文字內容。");
  }

  if (provider === "claude") {
    const result = (data?.content ?? [])
      .filter((item) => item?.type === "text" && typeof item?.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (result) return result;
    throw new Error("Claude 已回應，但找不到可用的文字內容。");
  }

  return extractResponseText(data);
}

export function cleanModelOutput(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:markdown|md|text)?\s*/i, "").replace(/\s*```$/, "");
  cleaned = cleaned.replace(/^(?:潤飾後(?:文字|內容|結果)?|結果)\s*[:：]\s*/i, "");
  return cleaned.trim();
}

export const ORIGINAL_MARKER = "#潤飾前------------------";

export function formatOriginalBlock(text) {
  return `${ORIGINAL_MARKER}\n${text.trim()}\n${ORIGINAL_MARKER}`;
}

export function renderFullPolishedDocument(originalText, result) {
  const trailingLineBreak = originalText.endsWith("\n") ? "" : "\n";
  return `${ORIGINAL_MARKER}\n${originalText}${trailingLineBreak}${ORIGINAL_MARKER}\n${cleanModelOutput(result)}`;
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
      output += formatOriginalBlock(block.content);
      index = block.end;
      continue;
    }

    output += originalText[index];
    index += 1;
  }

  return unescapeSpecialBraces(output);
}
