# Botレスポンスが文章途中で切れる問題 修正方針

## 1. 問題

Slack上でGemini Botが返すレスポンスが、まれに文章の途中で突然終了することがある。

例:

```text
これは今回の問題について詳しく説明すると、まず最初に
```

のように、文の途中で終了してしまう。

現時点では、

- Gemini APIが生成途中で終了している
- Slack APIへの送信時にメッセージが切り詰められている
- その他のAPI/アプリケーション側の問題

のいずれかを確実には判別できない。

---

## 2. 現状コード上の問題

### 2.1 Geminiの `finishReason` を確認していない

現在の `geminiService.js` は、Geminiレスポンスから以下のテキストだけを取り出している。

```js
const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
```

その後、テキストが存在すれば正常なレスポンスとして扱っている。

一方、Gemini APIのレスポンスには候補の終了理由である `finishReason` が存在する。

例えば、

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "途中まで生成された文章"
          }
        ]
      },
      "finishReason": "MAX_TOKENS"
    }
  ]
}
```

のようなレスポンスの場合、テキスト自体は存在するため、現在の実装では正常回答としてSlackへ送信してしまう。

### 2.2 `MAX_TOKENS` 等による途中終了を正常回答として扱ってしまう

特に以下の `finishReason` は確認が必要。

- `STOP`
- `MAX_TOKENS`
- `SAFETY`
- `RECITATION`
- その他の終了理由

`STOP` 以外の場合、少なくとも「通常の生成完了ではない」ことをログに残す必要がある。

---

### 2.3 Slack API側の切り詰めを検出していない

Slackへの送信は現在、

```js
await sendSlackMessage(channelId, threadTs, displayReply);
```

で回答全文を送っている。

Slack APIレスポンスにメッセージ切り詰め等の警告が含まれていた場合、それを検出できない。

そのため、

```text
Gemini → 正常に長文を生成
        ↓
Slack API → メッセージを切り詰める
        ↓
Bot → 途中で切れたように見える
```

というケースを現在は判別できない。

---

# 3. 修正方針

## Phase 1: 原因を観測可能にする

まず、実際にどこで切れているのかを確実に判定できるようにする。

### Gemini側

`generateContent()` / `generate()` で以下を取得・記録する。

- `finishReason`
- `modelVersion`
- `usageMetadata`
- 生成されたテキスト長

例えば、

```text
Gemini response:
model=gemini-xxx
finishReason=STOP
outputLength=1234
```

のようなログを残す。

特に、

```text
finishReason=MAX_TOKENS
finishReason=SAFETY
```

などの場合は警告ログにする。

---

### Slack側

Slack APIレスポンスから、

- `ok`
- `error`
- `response_metadata.warnings`
- メッセージの実際の送信結果

を確認できるようにする。

特にメッセージ切り詰めを示す警告が存在する場合は、

```text
Slack message was truncated
```

など明確にログへ記録する。

---

# 4. Phase 2: Gemini側の途中終了への対応

`finishReason` を確認し、通常の `STOP` 以外の場合を適切に扱う。

### `MAX_TOKENS`

最も重要。

これは、

> 「Geminiが回答途中で出力トークン上限に到達した」

可能性を示す。

対応候補は以下。

1. Geminiの出力トークン上限を適切に設定する
2. 必要に応じて回答を続ける追加生成を行う
3. 明らかな途中終了の場合はユーザーにその事実を伝える

ただし、単純に自動で「続きを生成」する場合、文章の重複や文脈不整合が発生する可能性がある。

そのため、まず実際の発生状況をログで確認し、`MAX_TOKENS` が原因として確認できた場合に続き生成を導入する。

---

### `SAFETY` / `RECITATION` 等

これらは `MAX_TOKENS` とは意味が異なるため、単純な再試行はしない。

安全性・著作権関連の制約による終了であれば、別モデルへのリトライで回避するような実装は適切ではない。

まず終了理由をログに残し、必要に応じてユーザー向けのエラー応答を返す。

---

# 5. Phase 3: Slack側の長文問題への対応

Slack側でメッセージ長による切り詰めが確認された場合は、回答を複数メッセージに分割して送信する。

単純な文字数による分割ではなく、可能な限り以下を優先する。

1. Markdownの段落境界
2. 改行
3. 文末
4. それでも無理なら最大文字数

特にコードブロックについては、途中で分割するとSlack上の表示が壊れる可能性があるため注意する。

また、

```text
Sources:
...
---
使用モデル: ...
```

のメタ情報を本文と同じ制限に含めることも考慮する。

---

# 6. Phase 4: Geminiの回答とSlack送信結果を分離して検証する

原因切り分けを容易にするため、

```text
Gemini生成結果
    ↓
生成完了理由を確認
    ↓
最終送信文字列を作成
    ↓
Slackへ送信
    ↓
Slack APIレスポンスを確認
```

という流れを明確にする。

ログ上でも、

```text
Gemini output length = XXXX
Slack payload length = XXXX
Slack response truncated = true/false
```

を確認できるようにする。

これにより、

### ケースA

```text
Gemini output
↓
途中で終了
↓
finishReason=MAX_TOKENS
```

ならGemini側の問題。

### ケースB

```text
Gemini output
↓
最後まで正常
↓
Slack送信時にtruncated
```

ならSlack側の問題。

### ケースC

```text
Gemini output
↓
STOP
↓
Slackもtruncated=false
```

なのに画面上では途中で切れている場合は、別の原因を調査する。

---

# 7. テスト方針

## Geminiレスポンス

`finishReason` ごとにテストする。

### 正常

```text
finishReason = STOP
```

→ 通常の回答として処理。

### トークン上限

```text
finishReason = MAX_TOKENS
```

→ 途中終了として検出。

### Safety

```text
finishReason = SAFETY
```

→ 通常の成功レスポンスとして扱わない。

---

## Slack送信

Slack APIのモックレスポンスを用意して、

### 通常

```json
{
  "ok": true
}
```

→ 正常終了。

### 警告あり

```json
{
  "ok": true,
  "response_metadata": {
    "warnings": ["..."]
  }
}
```

→ 警告を検出・記録。

### APIエラー

```json
{
  "ok": false,
  "error": "..."
}
```

→ 既存のエラー処理を行う。

---

# 8. 今回は行わないこと

原因が確定していない段階では、以下をいきなり実施しない。

- Geminiのトークン上限を適当に増やす
- 全レスポンスを無条件に分割する
- `MAX_TOKENS` を無視する
- Safety系の終了を別モデルで無条件に再試行する
- 「たぶんSlackの制限」と決めつけてSlack側だけ修正する

まず観測可能にし、実際の原因を特定してから必要な対策を追加する。

---

# 9. 実装順序

以下の順番で実装する。

1. Gemini `finishReason` の取得・ログ出力
2. Geminiの途中終了判定を追加
3. Slack APIレスポンスの警告検出
4. Gemini生成文字数 / Slack送信文字数のログ追加
5. 上記のユニットテスト追加
6. 実際のログから原因を確認
7. 原因に応じて追加修正
   - `MAX_TOKENS` → Gemini側対策
   - Slack truncation → Slackメッセージ分割
   - その他 → 個別調査

---

# 10. 完了条件

以下を満たした状態を今回の修正完了とする。

- Botレスポンスが途中終了した場合、その原因をログから判別できる
- Gemini `MAX_TOKENS` を正常終了と誤認しない
- Slack側でメッセージが切り詰められた場合、それを検出できる
- Gemini生成結果とSlack送信結果を個別に確認できる
- 各終了パターンのテストが存在する
- 原因が特定できた場合、その原因に対する恒久対策を追加する

なお、**現時点では原因そのものはまだ確定していない**ため、最初の変更は「原因特定のための観測・判定強化」を中心とする。
