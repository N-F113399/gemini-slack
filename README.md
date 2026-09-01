# gemini-slack

SlackからGeminiを利用するBotです。

通常のメンションによる質問に加えて、会話コンテキスト、Conversation Summary、Message Shortcut、画像/PDF/テキスト/CSV/URL、Web検索、Usage Tracking、Rate Limit、監視まで扱える構成です。

## Features

### Conversation
- SlackメンションからGeminiへ質問
- Thread単位の会話コンテキスト
- Recent messages + Conversation Summary
- Gemini APIのRetry / model fallback

### Slack operations
Message Shortcutで既存回答を加工できます。

- `detail` - 詳細化
- `concise` - 簡潔化
- `summarize` - 要約
- English translation - 自然な英語への翻訳
- `rewrite` - 書き換え

Slack側のShortcut数制約を考慮して機能を厳選しています。

### Content / Multimodal
- Images: PNG / JPEG / WEBP / HEIC / HEIF
- PDF
- Text: TXT / Markdown / JSON / XML
- CSV
- HTTP/HTTPS URL
- 複数コンテンツの混在

### Web Search
検索が必要と判定された質問では、Tavily / Exa / You.comを共通SearchProvider interfaceで利用します。

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

APIキーが設定されたProviderだけを候補とし、retryable / quota系エラーではfallbackします。外部検索結果はuntrusted dataとして扱います。

### Operations
- User単位のRate Limit
- Gemini / Search ProviderのUsage Tracking
- SupabaseへのUsage Event永続化
- Usage Report API
- 無料枠のUsage / Quota確認
- failure rate / latency / quota utilization監視
- Slack Alert通知
- Usage Event Retention

## Usage / Operations

```text
GET /usage
Authorization: Bearer <USAGE_REPORT_TOKEN>
```

```text
GET /usage/quota
Authorization: Bearer <USAGE_REPORT_TOKEN>
```

料金計算は行わず、無料枠の使用量・残量・利用率を確認する方式です。

詳細な運用設定・障害対応・デプロイ後チェックは [`docs/operations.md`](docs/operations.md) を参照してください。

## Architecture

```text
Slack
  ↓
Application Orchestration
  ├─ Conversation Context
  ├─ Content Resolver / Processor
  ├─ Search Decision / Provider Router
  ├─ Usage / Rate Limit
  └─ Monitoring / Alert
  ↓
Gemini Service
  ↓
Slack Reply
```

詳細は [`docs/architecture.md`](docs/architecture.md) を参照してください。

## URL Security

Botサーバーから外部URLを取得するため、SSRF対策を実施します。

- `http` / `https` のみ許可
- localhost / private network addressを拒否
- DNS解決後のIPを検証
- embedded credentialsを拒否
- redirect先を再検証
- redirect回数を制限
- timeoutを設定
- response sizeを制限
- Content-Typeをallowlistで制限

URL取得結果・Web検索結果はユーザー指示とは別の外部コンテンツとして扱います。

## Environment

```env
GEMINI_API_KEY=...
GEMINI_MODEL=...
SLACK_BOT_TOKEN=...
SUPABASE_URL=...
SUPABASE_KEY=...
SYSTEM_PROMPT=...

TAVILY_API_KEY=...
EXA_API_KEY=...
YDC_API_KEY=...
SEARCH_PROVIDER_ORDER=tavily,exa,you

RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
USAGE_TRACKER_MAX_EVENTS=10000
USAGE_REPORT_TOKEN=...
USAGE_ALERT_FAILURE_RATE=0.3
USAGE_ALERT_LATENCY_MS=5000
USAGE_ALERT_QUOTA_UTILIZATION=0.8
ALERT_SLACK_CHANNEL=...
USAGE_MONITOR_INTERVAL_MS=300000
USAGE_RETENTION_DAYS=90
USAGE_RETENTION_INTERVAL_MS=86400000
```

`.env` はGitへコミットしないでください。

## Development

```bash
npm test
npm run check
```

## Database

主要な永続化対象はSupabase PostgreSQLです。

- `public.slack_messages` - 会話履歴
- `public.conversation_summaries` - Conversation Summary
- `public.usage_events` - AI Provider利用状況

会話データは暗号化して保存します。Usage Eventには原則として生成本文や検索本文を保存せず、Provider・token/credit・latency・エラーなどの運用メタデータを記録します。

## Repository documentation

```text
README.md   リポジトリの入口、導入、使い方、現状、ロードマップ

design/     機能・DB・API・データ構造などの設計書

docs/       Architecture・開発・運用・Troubleshootingなどの技術ドキュメント
```

- [`design/feature-design.yaml`](design/feature-design.yaml)
- [`design/usage-quota.yaml`](design/usage-quota.yaml)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/operations.md`](docs/operations.md)

## Roadmap

```text
Phase 0  現状テスト追加                  ✅
Phase 1  責務分離                        ✅
Phase 2  コンテキスト改善                ✅
Phase 3  Slack操作性                     ✅
Phase 4  マルチモーダル / 外部コンテンツ  ✅
Phase 5  Web検索                        ✅ 実装完了 / 実運用調整
Phase 6  運用改善                        ✅ 実装完了
Phase 7  品質・信頼性向上                ⏳ 次フェーズ
```

### Phase 6 completed

- Rate Limit
- Usage Tracking / Persistence
- Usage Report / Free Quota Report
- Monitoring / Alerting
- Slack Alert Notification
- Usage Event Retention

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
5. Usage計測・監視は本処理と疎結合にする。
6. APIキーや認証情報をリポジトリへ保存しない。
7. 将来のProvider / LLM / Storage追加を想定してインターフェースとFactoryを使う。
