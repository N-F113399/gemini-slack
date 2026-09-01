# gemini-slack

SlackからGeminiを利用するBotです。

現在は、通常のメンションによる質問に加えて、スレッド単位の会話履歴・Conversation Summary・Message Shortcut・画像/PDF/テキスト/CSV/URLのコンテンツ処理に対応しています。

## Features

### Conversation

- SlackメンションからGeminiへ質問
- Thread単位の会話コンテキスト
- Recent messages + Conversation Summary
- Gemini APIのRetry / fallback

### Slack operations

Message Shortcutから既存の回答を加工できます。

- `detail` - 詳細化
- `concise` - 簡潔化
- `summarize` - 要約
- English translation
- `rewrite` - 書き換え

SlackのMessage Shortcut数の制約を考慮し、操作数は厳選しています。

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

## Architecture

外部コンテンツは `Content` を中心とした共通モデルで扱います。

```text
Slack File ─┐
URL ────────┼→ Resolver → Content → Processor → Gemini Adapter
Text ───────┘
```

- **Resolver**: Slack File / URLなどからコンテンツを取得
- **Processor**: MIME typeに応じて解析・変換
- **Content**: アプリ内部の標準表現
- **Gemini Adapter**: ContentをGemini APIのinput partへ変換

元データと派生Representationを分離し、将来の新しい入力形式やLLMへの拡張を考慮しています。

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

URLから取得した内容は外部コンテンツとして扱い、ユーザー指示とは区別します。

## Limits

主なContent制限値は環境変数で調整できます。

| Environment variable | Default |
| --- | ---: |
| `MAX_MESSAGE_CONTENTS` | 10 |
| `MAX_SLACK_FILE_SIZE` | 10 MB |
| `SLACK_FILE_TIMEOUT_MS` | 10 秒 |
| `MAX_URL_RESPONSE_SIZE` | 10 MB |
| `URL_TIMEOUT_MS` | 10 秒 |
| `MAX_CONTENT_TEXT_LENGTH` | 200,000文字 |
| `MAX_CSV_ROWS` | 10,000行 |

## Environment

```env
GEMINI_API_KEY=...
GEMINI_MODEL=...
SLACK_BOT_TOKEN=...
SUPABASE_URL=...
SUPABASE_KEY=...
```

`.env` はGitへコミットしないでください。

## Development

```bash
npm test
npm run check
```

ローカルの統合動作確認では `.env` に必要な認証情報を設定してください。

## Database

現在のメッセージ保存先はSupabase PostgreSQLの `public.slack_messages` です。

メッセージ本文は暗号化された形式で保存し、スレッド検索用indexと `message_ts` のunique indexを利用しています。

ファイルbinary自体は現在DBへ保存しません。必要になった場合はObject Storageを利用し、DBにはmetadataを保持する方針です。

## Roadmap

```text
Phase 0  現状テスト追加                     ✅
Phase 1  責務分離                           ✅
Phase 2  コンテキスト改善                   ✅
Phase 3  Slack操作性                        ✅
Phase 4  マルチモーダル / 外部コンテンツ     ✅
Phase 5  Web検索                             ⏳
Phase 6  運用改善                            ⏳
```

Phase 5ではWeb検索、Phase 6ではRate Limit・使用量・コスト・監視を予定しています。
