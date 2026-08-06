# CGU AI 文字潤飾編輯器

可直接部署到 GitHub Pages 的純前端文字編輯器。使用 `{{ }}` 標記要交給 AI 潤飾的文字；完成後移除雙大括號，將潤飾前的原文逐行改為以 `# ` 開頭，並在下方插入不含標記的潤飾結果。

## 功能

- 自訂 API Key、Endpoint 與模型
- 預設 Endpoint：`https://air.cgu.edu.tw/cgullmapi/v1`
- 預設模型：`gpt-5.6-luna`
- 可選模型：`gpt-5.6-sol`
- Responses API：`POST /responses`
- `reasoning.effort: medium`
- `service_tier: default`
- 自訂 System prompt
- 多組 `{{ }}` 依序潤飾
- 文章與設定自動保存至 LocalStorage
- 清除所有本機記錄
- 複製全文、下載 Markdown
- 手機版精簡介面
- 無外部套件、無建置步驟

## 使用方式

1. 開啟頁面，按「API」。
2. 輸入 API Key，確認 Endpoint 與模型。
3. 在編輯器輸入：

```text
這是前文。

{{這是一段需要幫忙改好一點的文字。}}

這是後文。
```

4. 按「潤飾」或按 `Ctrl/Cmd + Enter`。
5. 結果會變成：

```text
這是前文。

# 這是一段需要幫忙改好一點的文字。
這是一段需要協助潤飾的文字。

這是後文。
```

## GitHub Pages 部署

1. 將本專案推送至 GitHub Repository。
2. 進入 `Settings → Pages`。
3. `Build and deployment` 選擇 `Deploy from a branch`。
4. 選擇 `main` 分支與 `/ (root)`。
5. 儲存後即可使用網站網址。

## 本機測試

可直接開啟 `index.html`。若瀏覽器限制本機檔案呼叫 API，可在專案目錄執行：

```bash
python3 -m http.server 8080
```

然後開啟 `http://localhost:8080`。

## 安全提醒

本專案依需求將 API Key、Endpoint、模型、System prompt 與文章保存於瀏覽器 LocalStorage。這些資料不會被寫入 GitHub Repository，但同一裝置與瀏覽器的使用者可能取得它們。請勿在公用或共用裝置保存正式 API Key；若要公開給多人使用，建議改為後端代理 API，避免將 Key 交給前端。
