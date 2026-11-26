# URL HTML本文抽出・Gemini入力最適化 設計案

## 1. 目的

外部URLのHTMLをGeminiへ渡す際、ページ全体に含まれるナビゲーション、広告、フッター、スクリプト等の不要情報を減らし、回答に必要な本文を維持しながら入力トークン数とGemini処理時間を抑える。

今回の主な改善対象はURL取得時間ではなく、取得済みHTMLをGemini入力へ変換する処理と、その入力サイズである。

## 2. 現状

対象ブランチ: `phase4/content-foundation`

主な対象ファイル:

- `src/services/content/processors/htmlProcessor.js`
- `src/services/content/contentLimits.js`
- `src/services/content/messageContentResolver.js`
- `src/services/content/adapters/geminiContentAdapter.js`
- `src/services/gemini/geminiService.js`

### 2.1 現行HTML処理

現行の `htmlProcessor.js` は、正規表現で `script`、`style`、`noscript`、タグ等を除去してテキスト化している。

問題点:

- DOM構造を解析せず、本文領域を特定していない
- ナビゲーション、サイドバー、広告、Cookie同意UI、フッター等が残り得る
- 見出し、コードブロック、表等の構造を十分に保持できない
- 共通の `maxTextLength`（現状200,000文字）がHTMLにも適用される

### 2.2 現在確認できている実測値

Render上のLaravel URL取得ログ:

- 取得HTMLサイズ: 1,723,989 bytes
- URL取得完了時間: 約353ms
- Gemini入力トークン: 44,619
- Gemini出力トークン: 128

44,619 tokensにはシステムプロンプト、会話履歴、その他の入力も含まれ得るため、URL本文だけのトークン数とは断定できない。改修後はURL本文の文字数とGemini全体の入力トークン数を併せて記録し、寄与を評価する。

## 3. 基本方針

- URL取得、DNS検証、SSRF対策、リダイレクト制御は変更しない。
- HTML取得後の本文抽出処理を独立して改善する。
- HTML以外（PDF、画像、CSV、一般テキスト）の処理には影響させない。
- 抽出品質を優先し、単純な文字数削減だけを目的にしない。
- 抽出結果のサイズ・処理時間・抽出方式をログで計測する。
- 本文抽出に失敗した場合も、可能な範囲で安全なフォールバックを行う。

## 4. HTML解析方式

### 4.1 採用案

CheerioによるDOM解析と、独自の本文抽出ルールを採用する。

記事抽出に特化したReadabilityも候補だが、対象URLにはニュース記事だけでなく、WikipediaやLaravel公式ドキュメントのような技術文書も含まれる。コードブロック、見出し、リスト、表などを扱うため、DOM構造を制御できる方式を優先する。

### 4.2 抽出処理の流れ

1. HTML文字列をDOMとして解析する。
2. 明らかに不要な要素を除去する。
3. 本文候補領域を優先順位に従って選択する。
4. 本文候補から構造を維持してテキスト化する。
5. 空白・改行を正規化する。
6. URL専用の文字数上限を適用する。
7. 抽出メタデータをContentのmetadataへ付与する。

### 4.3 不要要素の除去

まず次の要素を除去する。

- `script`
- `style`
- `noscript`
- `svg`
- `iframe`
- `form`
- `button`
- `input`
- `select`
- `textarea`

加えて、次のような意味的領域・属性を持つ要素を除去候補とする。

- `nav`
- `[role="navigation"]`
- `[role="complementary"]`
- `[aria-hidden="true"]`
- 広告、Cookie同意、共有ボタン、関連記事、サイドバー等を示すclass/id

class/idによる除去はサイトごとの差異が大きいため、汎用的なキーワードルールに限定する。本文を誤って削除する可能性があるため、広範囲な正規表現による一括削除は避ける。

`header` や `footer` は記事タイトルや本文情報を含む場合があるため、タグ名だけを理由に無条件で削除しない。

### 4.4 本文候補の選択

次の順序で本文領域を探索する。

1. `[itemprop="articleBody"]`
2. `main`
3. `[role="main"]`
4. `article`
5. `body`（フォールバック）

候補が複数ある場合は、空でないことを確認し、テキスト量等を用いて候補を選ぶ。本文候補が見つからない場合は、不要要素を除去したbody全体を使用する。

抽出方式は次の値で記録する。

- `article`
- `main`
- `role_main`
- `body_fallback`

### 4.5 テキスト化と構造保持

以下の構造は、可能な範囲でテキスト表現に残す。

- 見出し: 見出しレベルが分かる表現
- 段落: 段落間に改行
- リスト: 項目ごとに改行・箇条書き
- 表: 行・列の情報を失いにくいテキスト表現
- コードブロック: 前後の本文と区別できる表現
- リンク: 原則としてリンクテキストを残す。必要に応じてリンク先URLも残すが、ページ内の全リンクを無条件に列挙しない

HTML属性やCSS、JavaScriptの内容はGeminiに渡さない。

## 5. サイズ制限

### 5.1 初期値案

HTML URLコンテンツ専用の上限を設ける。

| 制限 | 初期値 | 目的 |
| --- | ---: | --- |
| URL単位の抽出後テキスト上限 | 30,000文字 | 1 URLによる入力占有を防ぐ |
| URL複数件の合計上限 | 50,000文字 | 複数URL時の入力肥大化を防ぐ |

これらは初期値であり、実測と回答品質の確認後に調整する。

既存の `MAX_CONTENT_TEXT_LENGTH` / `maxTextLength` はPDFや一般テキスト等にも関係するため、今回HTML URL専用の制限を追加し、既存の共通上限は変更しない。

### 5.2 切り詰め方法

単純な先頭N文字での切り詰めは避ける。

- 見出し・段落・コードブロック等のまとまりを単位にする。
- 上限を超える直前の完全なブロックまでを優先する。
- 1ブロックが上限を超える場合は、そのブロック内で安全に切り詰める。
- 切り詰めが発生したことをmetadataとログに記録する。

URL複数件の合計上限は、URLの順序を維持しながら適用する。上限に達したURLや残り文字数が不足するURLについては、処理結果に切り詰め情報を付与する。入力自体を黙って破棄しない。

### 5.3 文字数とトークン数

文字数はトークン数の厳密な代替指標ではない。特に日本語・コード・URLではトークン化効率が異なるため、Geminiレスポンスの `promptTokenCount` を最終的な評価指標とする。

## 6. Contentモデルとの接続

既存のContentモデルとGemini adapterの責務を維持する。

- `htmlProcessor.js` がHTMLからtext representationを生成する。
- URL専用上限はHTML処理経路に適用する。
- Gemini adapterは既存どおりtext representationをGemini partへ変換する。
- URLの元データや既存metadataを不用意に破壊しない。

URL合計上限の適用位置は、URLごとのprocessor実行後、Geminiへ渡すcontentsを組み立てる段階とする。Slackファイル由来のテキストやPDF等にURL専用上限を誤適用しないこと。

## 7. ログ・計測

URLごとに以下のメタデータを記録する。

| 項目 | 説明 |
| --- | --- |
| `originalHtmlBytes` | 取得HTMLのbyte数 |
| `extractedTextLength` | 本文抽出直後の文字数 |
| `finalTextLength` | 上限適用後の文字数 |
| `truncated` | 切り詰め有無 |
| `extractionMethod` | article/main/role_main/body_fallback |
| `processingTimeMs` | HTML解析・抽出処理時間 |

Gemini側の既存ログにある以下も利用する。

- `inputTokens`
- `outputTokens`
- `totalTokens`
- Geminiリクエスト処理時間

本文、HTML全体、認証情報等の機密情報はログへ出力しない。ログはメタデータに限定する。

## 8. エラー・フォールバック

- HTML解析に失敗した場合、現行の正規表現ベース変換をフォールバックとして残すか、同等の安全なbodyテキスト化へフォールバックする。
- 本文候補が見つからない場合はbody全体を使用する。
- 抽出後のテキストが空の場合は既存のContentErrorの扱いに合わせる。
- 上限超過はエラーにせず、切り詰め情報を付与して処理を継続する。
- 巨大HTMLの解析負荷については、既存のURLレスポンスサイズ上限を維持する。必要であれば別途CPU処理時間の計測・制御を検討する。

## 9. テスト方針

### 9.1 HTML抽出テスト

| ケース | 期待結果 |
| --- | --- |
| 一般的な記事HTML | 記事本文を抽出する |
| Wikipedia形式 | 本文を残し、ナビゲーション等を除去する |
| Laravel等の技術ドキュメント | 見出し、コード、リストを維持する |
| `main` / `article` がないHTML | body fallbackで抽出する |
| 複数の本文候補 | 空でない妥当な候補を選択する |
| script/style/noscriptを含むHTML | 内容を出力しない |
| class/idに広告等を含む要素 | 対象要素を除去する |
| 不正・空HTML | 既存エラー方針に従う |

### 9.2 サイズ制限テスト

- URL単位上限未満では切り詰めない。
- URL単位上限超過ではブロック境界を考慮して切り詰める。
- 複数URLの合計が上限を超える場合、合計上限を守る。
- URLの順序を維持する。
- URL由来ではないPDF・テキスト等にURL専用上限を適用しない。
- 切り詰めmetadataとログ情報が正しい。

### 9.3 回帰テスト

- 既存のURL Resolverテストが通る。
- SSRF対策、DNS検証、リダイレクト検証に変更がない。
- PDF、画像、CSV、Slack添付ファイルの処理が変わらない。
- Gemini adapterの既存入力形式が変わらない。

## 10. 効果測定・受け入れ基準

改修前後で同じURL・同じSlackメッセージ条件を使って比較する。

対象URL:

- Laravel公式ドキュメント
- Wikipedia
- 一般的な記事ページ

比較項目:

- HTML bytes
- 抽出後文字数
- Gemini入力トークン数
- Gemini処理時間
- 抽出本文に重要情報が残っているか
- 回答品質に明らかな劣化がないか

受け入れ基準:

1. 不要なナビゲーション・広告等が抽出結果から除去される。
2. 見出し・コード・リスト等の重要な構造が保持される。
3. URL単位・合計の文字数上限を守る。
4. Gemini入力トークン数が改修前より減少することを実測で確認する。
5. 回答に必要な本文情報の欠落がないことをテストページで確認する。
6. 既存のURL取得・SSRF対策・他形式のコンテンツ処理に回帰がない。

トークン削減率や処理時間の目標値は、複数ページで測定した後に設定する。現段階で未測定の削減率を保証しない。

## 11. 対象ファイルと実装範囲

| ファイル | 変更内容 |
| --- | --- |
| `src/services/content/processors/htmlProcessor.js` | DOM解析、不要要素除去、本文抽出、構造を保ったテキスト化 |
| `src/services/content/contentLimits.js` | URL HTML専用の単位・合計上限設定 |
| `src/services/content/messageContentResolver.js` | URL由来コンテンツへの合計上限適用 |
| `package.json` / lockfile | Cheerio依存追加 |
| `test/` | HTML抽出・上限・回帰テスト |
| `docs/` | 必要に応じて実測結果を追記 |

Gemini adapter、Gemini API呼び出し、URL取得・DNS検証の仕様変更は今回の対象外とする。ただし計測ログの追加が必要な場合は、既存ログとの重複を避けて最小限に行う。

## 12. 実装順序

1. 本設計をレビュー・確定する。
2. Cheerioの依存関係とNode.js互換性を確認する。
3. HTML processorをDOM解析方式へ変更する。
4. URL専用の文字数上限と複数URL合計上限を実装する。
5. 抽出メタデータと処理時間ログを追加する。
6. HTML抽出・サイズ制限・回帰テストを追加する。
7. テストを実行し、失敗があれば修正する。
8. Laravel / Wikipedia / 一般記事の抽出結果を比較する。
9. RenderでGemini入力トークン数と処理時間を実測する。
10. 実測結果に基づき上限値を調整する。

## 13. 今回の対象外

- Readabilityとのハイブリッド抽出
- JavaScript実行を伴うブラウザレンダリング
- ページ内リンク先の再帰取得
- Geminiによる事前要約・二段階要約
- PDFや画像等の入力最適化
- Geminiモデルやプロンプト自体の変更
- URL取得タイムアウトやSSRF対策の変更

これらは今回のHTML本文抽出の効果を確認した後、必要性があれば別途検討する。


## 14. 初回実装時の設計差分・制約

初回実装では、作業環境からnpmレジストリへ接続できず、Cheerioの依存追加とpackage-lockの正規生成・検証ができなかった。そのため、lockfileを不整合な状態にしないことを優先し、依存追加なしの簡易HTMLツリー解析を暫定採用した。

この実装は静的HTMLの基本的なタグ構造を解析し、本文候補選択・不要要素除去・構造を保ったテキスト化を行う。ただし、Cheerio等のHTML5準拠パーサーと同等ではない。特に、壊れたHTML、複雑な属性値、HTML5の省略タグ、全Named Character Referencesのデコードには制約がある。

したがって、初回実装のテストと実ページでの抽出品質確認を必須とする。開発環境でnpmレジストリへ接続できる状態になった段階で、Cheerioを導入して簡易パーサーを置き換えることを推奨する。置き換え時はpackage.jsonとpackage-lock.jsonを同一のnpm操作で更新し、Node.jsバージョンとの互換性も確認する。

初回実装で追加した設定:

- `MAX_URL_HTML_TEXT_LENGTH`: URL HTML単位の上限。デフォルト30,000文字
- `MAX_TOTAL_URL_HTML_TEXT_LENGTH`: URL HTML全体の上限。デフォルト50,000文字

これらはHTML URLコンテンツのみに適用し、Slack添付ファイル由来のテキストやPDF等の既存制限には適用しない。
