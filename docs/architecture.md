# gemini-slack 開発・アーキテクチャガイド

## 1. 概要

`gemini-slack` は Slack から Gemini を利用する Bot です。

現在は、単純なメンションからの質問だけでなく、会話コンテキスト、要約、Message Shortcut、添付ファイル、URL参照まで扱える構成になっています。

このドキュメントでは、Phase 0〜4で実装した内容と、今後の拡張方針をまとめます。

---

## 2. 開発ロードマップ

```text
Phase 0  現状テスト追加
    ↓
Phase 1  責務分離
 ・Slack
 ・Conversation
 ・Gemini
 ・Retry
 ・Prompt
 ・DB
    ↓
Phase 2  コンテキスト改善
 ・Thread単位
 ・Conversation Summary
 ・履歴 + Summary
    ↓
Phase 3  Slack操作性
 ・detail
 ・concise
 ・summarize
 ・English translation
 ・rewrite
    ↓
Phase 4  マルチモーダル / 外部コンテンツ
 ・画像
 ・PDF
 ・テキスト系
 ・CSV
 ・URL
 ・複数コンテンツ
    ↓
Phase 5  Web検索
    ↓
Phase 6  運用改善
 ・Rate Limit
 ・使用量
 ・コスト
 ・監視
```

---

## 3. Phase 0〜2

### Phase 0: テスト追加

既存機能を変更する前に、主要なサービスを単体テストで保護する方針を採用しています。

テストは Node.js の `node:test` を中心に構成しています。

### Phase 1: 責務分離

主な責務を次のように分離しています。

```text
Slack
  ↓
Conversation
  ↓
Prompt
  ↓
Gemini Service
  ↓
Gemini Client
```

DBアクセス、Retry、Shortcutなどもそれぞれ独立したサービスとして扱います。

### Phase 2: コンテキスト改善

会話は Slack の `channel_id + thread_ts` を基本単位として扱います。

コンテキストは、概念的には次の順序です。

```text
System Prompt
Conversation Summary
Recent Messages
Current User Message
```

Summary は長期間の履歴を圧縮して保持するための情報で、直近履歴と併用します。

---

## 4. Phase 3: Slack操作性

Message Shortcut を利用して、メッセージに対する操作を提供しています。

現在の主な操作は次の通りです。

| Shortcut | 用途 |
| --- | --- |
| `detail` | 詳細化 |
| `concise` | 簡潔化 |
| `summarize` | 要約 |
| `translate` / English系操作 | 自然な英語への翻訳 |
| `rewrite` | 回答の書き換え |

Slack側には最大5個のMessage Shortcutという制約があるため、機能は厳選しています。

再生成や日本語翻訳専用操作は別Shortcutとして追加せず、現在の構成では採用していません。

---

## 5. Phase 4: Content Architecture

### 5.1 基本思想

ファイルやURLを個別機能として扱うのではなく、アプリ内部ではすべて `Content` として統一します。

```text
Slack File ─┐
URL ────────┼→ Resolver → Content → Processor → Gemini Adapter
Text ───────┘
```

これにより、将来的に Google Drive、Notion、GitHub、Storage などの新しい入力元を追加しても、既存のGemini処理を大きく変更せずに済みます。

### 5.2 Contentモデル

現在の基本構造は次の考え方です。

```js
{
  version,
  id,
  kind,
  source,
  original,
  representations,
  metadata
}
```

#### `version`

内部データ形式のバージョン。将来のスキーマ変更を吸収するために保持します。

#### `id`

Contentを一意に識別するためのID。

#### `kind`

大分類です。現在は `text`, `file`, `remote` を利用します。

#### `source`

どこから来たContentかを表します。

例:

```js
{ type: "slack_file", ref: "F123" }
{ type: "url", ref: "https://example.com" }
```

#### `original`

元コンテンツの情報を保持します。MIME type、サイズ、URLなどを想定しています。

#### `representations`

同じContentの異なる表現を保持します。

例:

```text
PDF(binary)
  ↓
text(text)
```

元の形式を失わず、派生データを追加できます。

現在の代表的なRepresentationは、`original`, `binary`, `text`, `structured` です。

#### `metadata`

処理結果や取得日時、行数など、Content本体ではない追加情報を保持します。

---

## 6. Resolver / Processor / Adapter

責務は3段階に分けます。

### Resolver

入力元から安全にContentを取得・正規化します。

```text
Slack file → SlackFileResolver
URL        → UrlResolver
```

### Processor

取得したContentを解析し、必要なRepresentationを生成します。

```text
Image → ImageProcessor
PDF   → PdfProcessor
Text  → TextProcessor
CSV   → CsvProcessor
HTML  → HtmlProcessor
```

### Adapter

アプリ内部のContentをGemini APIの入力形式へ変換します。

```text
Content
  ↓
Gemini Content Adapter
  ↓
Gemini Part
```

アプリ内部のモデルとGemini API固有形式を分離することで、将来の別LLM対応も可能にします。

---

## 7. Representation選択

1つのContentに複数のRepresentationが存在する場合、Geminiへは原則として最適なRepresentationを1つだけ渡します。

現在の優先順位は概念的に次の通りです。

```text
structured
   ↓
text
   ↓
Geminiが直接扱えるbinary
```

例えばHTML URLは、元HTMLのbinaryではなく、HTML Processorが抽出したテキストをGeminiへ渡します。

これにより、1つのContentの派生データが重複投入される問題を防ぎます。

---

## 8. 対応コンテンツ

### 画像

現在の対象形式:

- PNG
- JPEG
- WEBP
- HEIC
- HEIF

Slackから取得したbinaryをGeminiのinline dataとして利用します。

### PDF

`application/pdf` を対象とし、GeminiへPDF binaryとして渡せる構造を採用しています。

### Text系

現在の対象MIMEには、以下を含みます。

```text
text/plain
text/markdown
text/x-markdown
application/json
application/xml
text/xml
```

UTF-8として読み込み、text representationを生成します。

### CSV

CSVはテキストと構造化表現の両方を生成します。

```text
text/csv
    ↓
text representation
structured representation
```

構造化表現には列情報と行データを保持します。

### URL

HTTP/HTTPS URLを取得し、レスポンスのContent-Typeに応じて対応Processorへ流します。

例えば:

```text
HTML → HtmlProcessor
PDF  → PdfProcessor
Image → ImageProcessor
CSV → CsvProcessor
Text → TextProcessor
```

---

## 9. URL Security

URLはBotサーバーから外部へHTTPアクセスするため、SSRF対策が必要です。

現在のResolverでは、概念的に次を制御します。

```text
scheme validation
DNS resolution
private/local address blocking
embedded credential blocking
redirect validation
redirect count limit
request timeout
response size limit
Content-Type allowlist
```

特に重要なのは、URL文字列だけでなく、DNS解決後のIPアドレスも検証することです。

Redirect後のURLも再検証します。

### 外部コンテンツとPrompt Injection

URLから取得した本文はユーザーの指示とは別の外部データとして扱う必要があります。

外部ページ内の文章を「システム命令」として信頼しない設計を維持します。

---

## 10. ファイル保存方針

現在、Slackから取得したファイル本体をSupabase DBへ保存する設計にはしていません。

基本フローは次です。

```text
Slack
 ↓
Download
 ↓
Process
 ↓
Gemini
```

将来的にファイルを再利用・永続保存したくなった場合は、DBへbinaryを格納するのではなく、Object Storageを利用し、DBにはmetadataだけを持つ構成を想定します。

```text
DB
 └─ metadata

Object Storage
 └─ binary
```

---

## 11. 複数コンテンツ

1つのメッセージに複数のContentを添付できます。

例:

```text
text
+ image
+ PDF
+ CSV
+ URL
```

各Contentを独立して処理し、その結果を1つのGemini入力へまとめます。

```text
Content[]
  ↓
Gemini Parts[]
```

現在はメッセージあたりのContent数に上限を設けています。

---

## 12. 制限値

主な制限値は `contentLimits.js` に集約しています。

| 環境変数 | デフォルト |
| --- | ---: |
| `MAX_MESSAGE_CONTENTS` | 10 |
| `MAX_SLACK_FILE_SIZE` | 10 MB |
| `SLACK_FILE_TIMEOUT_MS` | 10 秒 |
| `MAX_URL_RESPONSE_SIZE` | 10 MB |
| `URL_TIMEOUT_MS` | 10 秒 |
| `MAX_CONTENT_TEXT_LENGTH` | 200,000文字 |
| `MAX_CSV_ROWS` | 10,000行 |

運用環境では、LLMのコンテキストサイズやワークロードに応じて調整してください。

---

## 13. データベース

現在利用しているメッセージテーブルは `public.slack_messages` です。

主なカラム:

```text
id
channel_id
thread_ts
message_ts
user_id
role
text_cipher
iv
auth_tag
enc_version
created_at
```

スレッド単位の検索用indexと `message_ts` のunique indexを利用しています。

ファイルbinaryは現状このテーブルへ保存しません。

---

## 14. 環境変数

最低限、Gemini / Slack / Supabase接続に必要な環境変数が必要です。

例:

```env
GEMINI_API_KEY=...
GEMINI_MODEL=...
SLACK_BOT_TOKEN=...
SUPABASE_URL=...
SUPABASE_KEY=...
```

Phase 4では、上記の制限用環境変数も利用できます。

ローカルテストでは実サービスを必要としない単体テストを優先し、環境変数依存が必要なサービスについては `.env` を用意します。

`.env` 自体はGitへコミットしません。

---

## 15. テストと静的チェック

基本的な確認コマンド:

```bash
npm test
npm run check
```

`npm run check` ではNode.jsのsyntax checkを行います。

Windows環境でUnix系コマンドが使えない場合は、`check` スクリプト自体の見直しが必要になる可能性があります。

---

## 16. Phase 5以降の拡張

### Phase 5: Web検索

Phase 4の `Content` モデルを再利用します。

```text
Search Engine
    ↓
Search Results
    ↓
Content[]
    ↓
Gemini
```

「ユーザーが明示したURLを読む」ことと「検索エンジンで調査する」ことは別責務として扱います。

### Phase 6: 運用改善

以下を追加予定です。

```text
Rate Limit
Usage Tracking
Cost Tracking
Monitoring / Alerting
```

---

## 17. 開発上の原則

1. 外部サービス固有の形式をドメインモデルへ直接持ち込まない。
2. Resolverは取得、Processorは変換、AdapterはLLM形式変換に限定する。
3. 元データと派生Representationを区別する。
4. 1 ContentからGeminiへは適切なRepresentationを1つ選択する。
5. 外部URLは常に信頼しない。
6. binaryはDBへ直接保存せず、必要になったらStorageを検討する。
7. 新機能追加時には単体テストを追加する。
