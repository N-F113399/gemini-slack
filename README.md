# gemini-slack

SlackからGeminiを利用するBotです。

現在は、通常のメンションによる質問だけでなく、スレッド単位の会話履歴、Conversation Summary、Message Shortcut、画像/PDF/テキスト/CSV/URLの処理、Web検索、Usage Tracking、Rate Limitまで対応しています。

## Features

### Conversation

- SlackメンションからGeminiへ質問
- Thread単位の会話コンテキスト
- Recent messages + Conversation Summary
- Gemini APIのRetry / model fallback

### Slack operations

Message Shortcutから既存の回答を加工できます。

- `detail` - 詳細化
- `concise` - 簡潔化
- `summarize` - 要約
- English translation - 自然な英語への翻訳
- `rewrite` - 書き換え

Slack側のMessage Shortcut数制約を考慮して機能を厳選しています。

### Content / Multimodal

メッセージ本文だけでなく、添付ファイルやURLをGeminiへの入力として扱えます。

- Images: PNG / JPEG / WEBP / HEIC / HEIF
- PDF
- Text: TXT / Markdown / JSON / XML
- CSV
- HTTP/HTTPS URL
- 複数コンテンツの混在

例:

```text
@Gemini この画像について説明して
[image.png]
```

```text
@Gemini このPDFを要約して
[manual.pdf]
```

```text
@Gemini このCSVの傾向を分析して
[data.csv]
```

```text
@Gemini https://example.com/article
この記事を要約して
```

画像 + URLなどの複数入力も同一メッセージで利用できます。

### Web Search

検索が必要と判定された質問では、複数の検索Providerを利用します。

```text
Search Decision
  ↓
Provider Router
  ├─ Tavily
  ├─ Exa
  └─ You.com
  ↓
Evidence Selection
  ↓
Gemini
  ↓
Sources
```

ProviderはAPIキーが設定されているものだけを候補とし、retryable / quota系障害時は次のProviderへfallbackします。

検索結果はEvidenceとして選択・重複排除し、Geminiへは外部のuntrusted dataとして渡します。回答には参照したSourcesを表示します。

### Operations

- User単位のRate Limit
- Gemini / Search ProviderのUsage Tracking
- SupabaseへのUsage Event永続化
- 保護されたUsage Report API

Usage Report:

```text
GET /usage
Authorization: Bearer <USAGE_REPORT_TOKEN>
```

## Architecture

アプリ内部では、外部コンテンツを `Content`、検索を `SearchResponse / Evidence`、利用状況を `Usage Event` として共通化します。

```text
Slack
  ↓
Application Orchestration
  ├─ Conversation Context
  ├─ Content Resolver / Processor
  ├─ Search Decision / Provider Router
  ├─ Usage / Rate Limit
  ↓
Gemini Service
  ↓
Slack Reply
```

Content:

```text
Slack File ─┐
URL ────────┼→ Resolver → Content → Processor → Gemini Adapter
Text ───────┘
```

検索:

```text
User message
    ↓
Search Decision
    ↓
SearchService
    ↓
Tavily / Exa / You.com
    ↓
Evidence Selector
    ↓
Search Context + Sources
    ↓
Gemini
```

詳細は [`docs/architecture.md`](docs/architecture.md) を参照してください。

## URL Security

URLはBotサーバーから取得するため、SSRF対策を入れています。

- `http` / `https` のみ許可
- localhost / private network addressを拒否
- DNS解決後のIPを検証
- embedded credentialsを拒否
- redirect先を再検証
- redirect回数を制限
- timeoutを設定
- response sizeを制限
- Content-Typeをallowlistで制限

URL取得結果とWeb検索結果は、ユーザー指示とは別の外部コンテンツとして扱います。外部テキスト中の命令をシステム命令として信頼しません。

## Limits

主な制限値は環境変数で調整できます。

| Environment variable | Default |
| --- | ---: |
| `MAX_MESSAGE_CONTENTS` | 10 |
| `MAX_SLACK_FILE_SIZE` | 10 MB |
| `SLACK_FILE_TIMEOUT_MS` | 10 秒 |
| `MAX_URL_RESPONSE_SIZE` | 10 MB |
| `URL_TIMEOUT_MS` | 10 秒 |
| `MAX_CONTENT_TEXT_LENGTH` | 200,000文字 |
| `MAX_CSV_ROWS` | 10,000行 |
| `SEARCH_MAX_QUERY_LENGTH` | 500 |
| `SEARCH_MAX_RESULTS` | 5 |
| `SEARCH_MAX_DOMAINS` | 5 |
| `SEARCH_MAX_PROVIDER_ATTEMPTS` | 3 |
| `RATE_LIMIT_MAX_REQUESTS` | 10 |
| `RATE_LIMIT_WINDOW_MS` | 60 秒 |
| `USAGE_TRACKER_MAX_EVENTS` | 10,000 |

## Environment

```env
GEMINI_API_KEY=...
GEMINI_MODEL=...
SLACK_BOT_TOKEN=...
SUPABASE_URL=...
SUPABASE_KEY=...

TAVILY_API_KEY=...
EXA_API_KEY=...
YDC_API_KEY=...
SEARCH_PROVIDER_ORDER=tavily,exa,you

RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
USAGE_TRACKER_MAX_EVENTS=10000
USAGE_REPORT_TOKEN=...
```

`.env` はGitへコミットしないでください。

## Development

```bash
npm test
npm run check
```

ローカルの統合動作確認では `.env` に必要な認証情報を設定してください。

## Database

現在の主要な永続化対象はSupabase PostgreSQLです。

- `public.slack_messages` - 会話履歴
- `public.conversation_summaries` - Conversation Summary
- `public.usage_events` - AI Provider利用状況

メッセージ本文などの会話データは暗号化して保存します。Usage Eventには原則として生成本文や検索本文を保存せず、Provider・token/credit・latency・エラーなどの運用メタデータを記録します。

ファイルbinary自体はDBへ保存しません。永続化が必要になった場合はObject Storage + metadata方式を想定します。

## Repository documentation

```text
README.md   リポジトリの入口、導入、使い方、現状、ロードマップ

design/     機能・データ・API・DBなどの設計書

 docs/       Architecture、開発手順、運用、Troubleshootingなどの技術ドキュメント
```

主な設計一覧は [`design/feature-design.yaml`](design/feature-design.yaml) に、アーキテクチャ説明は [`docs/architecture.md`](docs/architecture.md) にまとめています。

## Roadmap

```text
Phase 0  現状テスト追加                     ✅
Phase 1  責務分離                           ✅
Phase 2  コンテキスト改善                   ✅
Phase 3  Slack操作性                        ✅
Phase 4  マルチモーダル / 外部コンテンツ     ✅
Phase 5  Web検索                             ✅ 実装完了 / 実運用調整
Phase 6  運用改善                            🚧 実装中
Phase 7  品質・信頼性向上                    ⏳
```

### Phase 6 remaining

- Cost Calculator / pricing table
- Monitoring / Alerting
- Usage retention / aggregation policy
- Rate Limitの分散環境対応
- Usage Reportの運用強化

### Phase 7 planned

- Search Decisionの精度改善
- Source quality / conflict handling
- Prompt Injection hardening
- Hallucination reduction
- Answer quality evaluation

## Design principles

1. 外部サービス固有の形式をドメインモデルへ直接持ち込まない。
2. Resolverは取得、Processorは変換、AdapterはLLM形式変換に限定する。
3. 元データと派生Representationを区別する。
4. 外部URL・検索結果は信頼しない。
5. Usage計測は本処理と疎結合にし、永続化失敗でユーザー向け処理を壊さない。
6. APIキーや認証情報をリポジトリへ保存しない。
7. 将来のProvider / LLM / Storage追加を想定してインターフェースとFactoryを使う。
