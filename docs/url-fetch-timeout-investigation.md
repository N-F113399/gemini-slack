# URL外部コンテンツ取得タイムアウト 対応方針

## 1. 現象

Slackメッセージに外部URLを貼って内容の解説を依頼すると、URL取得処理で以下のエラーになる。

~~~text
Failed to process external content: URL request timed out after 10000ms
~~~

再現例:

- Wikipedia: https://ja.wikipedia.org/w/index.php?title=7%E3%82%BB%E3%82%B0%E3%83%A1%E3%83%B3%E3%83%88_(%E3%83%90%E3%83%B3%E3%83%89)&redirect=no
- t.co: https://t.co/rcuqmuhtZw

したがって、特定サイト固有の問題ではなく、外部URL取得経路そのものに問題がある可能性を優先して調査する。

## 2. 現在の実装

対象:

src/services/content/urlResolver.js

現在のURL取得は以下の流れ。

1. URLを validateUrlTarget() で検証
2. DNSを解決し、プライベート/ローカルアドレスを拒否
3. node-fetch でGET
4. リダイレクトは redirect: "manual" でBot側が最大3回追跡
5. Content-Typeを確認
6. response bodyを読み込む
7. URL_TIMEOUT_MS（デフォルト10秒）のAbortControllerでタイムアウト

特に問題になり得る箇所:

~~~js
const records = await dns.lookup(host, {
  all: true,
  verbatim: true,
});

const selected = records[0];
callback(null, selected.address, selected.family);
~~~

DNSにIPv4/IPv6の両方が存在する場合、最初の1アドレスだけを強制的に使用している。

## 3. まず切り分けるべきこと

10秒タイムアウトだけでは、以下を区別できない。

- DNS解決後の接続確立に失敗
- IPv6経路の問題
- IPv4/IPv6のアドレス選択問題
- TLS接続で停止
- HTTPレスポンスヘッダー待ち
- response body読み込み中に停止
- リダイレクト先で停止

現在のcatchでは、元のネットワークエラー情報が十分に残らないため、まず診断情報を増やす。

## 4. 対応方針

### Phase 1: 診断ログを強化

URLごと・リダイレクトごとに以下を記録する。

- hostname
- protocol
- timeout
- DNSで取得した全アドレスとfamily
- 実際に選択したアドレスとfamily
- fetch開始時刻
- response受信時刻
- status
- Content-Type
- body読み込み完了時刻
- 最終URL
- elapsedMs
- error name / code / cause

URLのquery/pathそのものはログに残してよいが、将来的に認証情報等が入り得ることを考慮し、credentials付きURLは既に拒否しているため、追加でAuthorization等の秘密情報をログへ出さない。

### Phase 2: IPv4/IPv6の選択を改善

現状の records[0] 固定は、Render環境のIPv6経路が不調な場合に10秒タイムアウトを誘発し得る。

まずは公開IPv4を優先して選択する。

優先順位:

1. IPv4
2. IPv6

ただしIPv6のみのホストを拒否する仕様にはしない。

### Phase 3: ネットワークエラー時の診断性を改善

node-fetch が返すネットワークエラーについて、

- err.name
- err.code
- err.type
- err.cause

を可能な範囲で保持・ログ出力する。

AbortControllerによる意図的なタイムアウトと、接続側が返すネットワークエラーを区別する。

### Phase 4: 必要なら接続先フォールバックを検討

Phase 1/2でIPv6問題が確認された場合、IPv4/IPv6候補を順番に試すフォールバックを実装する。

ただし、単純なリトライでは同じURLへのGETを複数回発生させるため、以下を守る。

- GETのみ対象
- リダイレクトごとに再検証
- SSRF防御を維持
- 全体のタイムアウト上限を設ける
- HTTPステータスエラーを無条件に再試行しない

現時点では、原因が未確定のためPhase 4を先に入れない。

### Phase 5: タイムアウト値の見直し

10秒を30秒等へ単純に延長するのは最後にする。

理由:

- 接続不能なURLへの待ち時間だけが増える
- Slack応答全体が遅くなる
- 原因を隠してしまう

ただし、正常な大型HTML/PDF等でbody転送に時間がかかることが確認できた場合は、接続タイムアウトとbody読み込みタイムアウトを分離することを検討する。

## 5. セキュリティ上の注意

今回の修正でもSSRF対策は維持する。

特に、

- localhost禁止
- private IPv4禁止
- loopback禁止
- link-local禁止
- private IPv6禁止
- DNS解決結果の検証
- リダイレクト先でも再検証
- 最大リダイレクト数3

を維持する。

IPv4/IPv6の選択改善を理由に、DNSチェックを省略したり、検証済みIPを無期限に再利用したりしない。

## 6. テスト方針

既存の test/urlResolver.test.js に以下を追加する。

### アドレス選択

- IPv4 + IPv6がある場合、IPv4を優先
- IPv6しかない場合、IPv6を使用
- private addressが混在する場合、既存のSSRF防御で拒否

### エラー診断

- AbortErrorが URL_TIMEOUT に変換される
- ネットワークエラーのcode/causeを診断情報として保持できる

### リダイレクト

- リダイレクト先で再度DNS/URL検証される
- 最大3回を超えると拒否

## 7. 実装順序

1. 本ドキュメントを追加
2. URL取得の診断ログを追加
3. DNSアドレス選択をIPv4優先へ変更
4. URL Resolverの単体テストを追加
5. テスト実行
6. Renderへデプロイ
7. Wikipedia / t.co / 通常のHTTPS URLで再現確認
8. それでもタイムアウトする場合、ログから接続・TLS・レスポンス・bodyのどこかを特定
9. 必要なら接続先フォールバックを追加

## 8. 現時点の判断

現時点では「Wikipediaが遅い」「t.coが特殊」というサイト固有の問題とは判断しない。

最も疑うべき実装上の問題は、DNSの複数アドレスから records[0] を無条件に選択している点。

ただし、これはまだ仮説であり、診断ログによって確認してからフォールバック等の追加対応を行う。


## 9. 今回実装した内容

今回の対応では、原因を隠して単純にタイムアウトを延長するのではなく、以下を実装した。

- URL fetch開始時のhostname / protocol / timeout / DNSアドレス一覧 / 選択アドレス / redirectCountをログ出力
- HTTPレスポンス到着時のstatus / elapsedMsをログ出力
- body読み込み完了時のMIME / size / elapsedMs / finalUrlをログ出力
- timeout時にname / code / type / cause / elapsedMsをContentError.detailsへ保持
- 通常のnetwork errorについても診断情報を保持・ログ出力
- DNSアドレス選択をIPv4優先へ変更
- IPv6しかない場合はIPv6を利用する
- URL Resolverの単体テストにIPv4優先・IPv6フォールバック候補の選択テストを追加

この段階では、複数IPを実際に順番に再接続する「接続先フォールバック」までは実装していない。

次のRender実環境でのログ確認結果をもとに、IPv6経路が原因なら接続先フォールバックを追加する。


## 10. Renderログを受けた追加調査

### 10.1 追加ログから分かったこと

Renderで取得したログでは、次の状態まで確認できた。

- DNS解決は成功している
- IPv4アドレス（`208.80.154.224`）が選択されている
- `URL fetch started` は出力されている
- 10秒後にAbortControllerによるタイムアウトが発生している
- `URL response received` は出力されていない

したがって、今回の停止箇所はbody読み込みより前であり、`await fetch()` がHTTPレスポンスヘッダーを受け取る前に停止している。候補はTCP接続、TLSハンドシェイク、HTTPレスポンスヘッダー待ちである。IPv6アドレス選択が直接の原因という仮説は、今回のログでは支持されない。

### 10.2 今回追加した接続フェーズログ

`urlResolver.js` のHTTPS/HTTP Agentが生成するSocketにイベントリスナーを追加し、以下を記録する。

- `socket_lookup`: Socket側のDNS lookupイベント
- `tcp_connected`: TCP接続完了（`connect`）
- `tls_connected`: TLSハンドシェイク完了（HTTPSの`secureConnect`）
- `socket_error`: Socketエラーのname / code / message
- 既存の `URL response received`: HTTPレスポンス受信

各ログには開始からの`elapsedMs`を含める。タイムアウトログには最後に到達したフェーズを`phase`として出力する。

ログの読み方:

| 最後に確認できたイベント | 主に疑う箇所 |
| --- | --- |
| `request_started` のみ | Socket生成前、Agent、または接続開始前 |
| `socket_lookup` のみ | TCP接続確立までのネットワーク経路 |
| `tcp_connected` まで | TLSハンドシェイク |
| `tls_connected` まで | HTTPレスポンスヘッダー待ち |
| `URL response received` まで | HTTP応答後。body読み込み等を調査 |

### 10.3 次の確認

この変更をRenderへデプロイし、以下を確認する。

1. Wikipedia URL
2. t.co URL
3. `https://example.com/` のような単純なHTTPS URL

ログにより停止フェーズを特定した後、Render環境内で可能なら同じURLに対して`curl -4 -v --max-time 10`を実行し、Node.js実装固有の問題か、Renderから外部への接続経路の問題かを比較する。

この段階では、接続先フォールバック、リトライ、タイムアウト延長は追加しない。原因が分かってから最小限の対策を選択する。
