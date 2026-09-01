# 運用ガイド

## 1. 概要

`gemini-slack` の運用系機能は、Rate Limit、Usage Tracking、無料枠監視、Alert、Usage Event Retentionで構成します。

## 2. 必須設定

```env
SLACK_BOT_TOKEN=...
GEMINI_API_KEY=...
SYSTEM_PROMPT=...
SUPABASE_URL=...
SUPABASE_KEY=...
```

検索Providerを利用する場合:

```env
TAVILY_API_KEY=...
EXA_API_KEY=...
YDC_API_KEY=...
SEARCH_PROVIDER_ORDER=tavily,exa,you
```

## 3. Rate Limit

ユーザー単位で一定時間内のリクエスト数を制限します。

```env
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
```

現在はインメモリ方式です。複数アプリインスタンスで共有する場合はRedis等への移行が必要です。

## 4. Usage Tracking

Geminiと検索Providerの利用イベントを共通形式で記録します。Providerのfallbackが発生した場合も、各試行を個別イベントとして記録します。

Supabaseの `public.usage_events` に永続化します。

保存対象はProvider、operation、success、latency、token/credit、HTTP error等の運用情報です。生成本文や検索本文はUsage Eventに保存しません。

## 5. Usage Report

管理用API:

```text
GET /usage
Authorization: Bearer <USAGE_REPORT_TOKEN>
```

`USAGE_REPORT_TOKEN` が未設定の場合は利用できません。

## 6. 無料枠監視

無料枠の使用量・残量・利用率を確認できます。

```text
GET /usage/quota
Authorization: Bearer <USAGE_REPORT_TOKEN>
```

料金計算は行わず、無料利用枠の消費状況のみを管理します。Providerごとの制限値は設定で変更可能です。

## 7. Monitoring / Alerting

監視対象:

- failure rate
- average latency
- free quota utilization

デフォルト閾値:

```env
USAGE_ALERT_FAILURE_RATE=0.3
USAGE_ALERT_LATENCY_MS=5000
USAGE_ALERT_QUOTA_UTILIZATION=0.8
```

AlertはSlackへ通知できます。

```env
ALERT_SLACK_CHANNEL=C1234567890
```

既存の `SLACK_BOT_TOKEN` を使用するため、Alert専用のAPIキーは不要です。

## 8. 定期監視

Usage Monitorはデフォルト5分間隔で実行します。

```env
USAGE_MONITOR_INTERVAL_MS=300000
```

重複実行はScheduler側で防止します。

## 9. Usage Event Retention

Usage Eventはデフォルト90日で削除します。

```env
USAGE_RETENTION_DAYS=90
USAGE_RETENTION_INTERVAL_MS=86400000
```

削除対象は `occurred_at` が保持期間より古いイベントです。

## 10. 障害時の考え方

Usage永続化や監視通知に失敗しても、ユーザー向けAI処理そのものを失敗扱いにしないことを基本方針とします。

外部APIの認証失敗、quota超過、timeout、rate limit等は既存のProvider fallbackやエラーハンドリングで処理します。

## 11. デプロイ後チェック

```bash
npm test
npm run check
```

本番環境では次を確認します。

1. Slack Botがイベントを受信できること
2. Usage EventがSupabaseへ保存されること
3. `/usage` と `/usage/quota` が認証付きで参照できること
4. 監視Schedulerが起動していること
5. Alert通知先チャンネルが正しいこと
6. Retention Schedulerが起動していること

## 12. セキュリティ

`.env` やAPIキーをGitへコミットしないでください。Usage Reportのtokenも十分に長いランダム値を利用します。

監視対象の外部コンテンツやURLは信頼できない入力として扱い、Prompt Injection対策を維持します。
