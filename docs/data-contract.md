# データの契約

`data/machines/**/*.json` は外部リポジトリ **`777site-scraper`** の
`make_evlive_data.py` が生成する。サイトはこれを読むだけで、書き換えない。
この文書は「生成側が満たすべき形」をサイト側から示したもの。

## 置き場

```
data/machines/*.json              既定店舗（新宿）
data/machines/<店舗id>/*.json     他店。店舗idは site/lib/halls.ts と揃える
```

店舗idは生成側の `halls.py` の「データ小分け」と同じ値にすること。
ズレると、サイトには店舗が出るのにデータが無い状態になり、しかも黙って
空表示になるので気づきにくい。

## 各JSONが満たすこと

- `site/lib/ev/validate.ts` の `validateMachine` を通る形であること
- `baseAnchors` の各要素は `{ g, ev, rtp, n? }`

| キー | 意味 |
|---|---|
| `g` | 現在G（AT間機種は AT・RB 間のハマりG） |
| `ev` | 期待値（円） |
| `rtp` | 機械割（%）。**不変条件 `(rtp >= 100) == (ev >= 0)` を必ず維持する** |
| `n` | そのGの推定に使ったサンプル数（任意） |

`rtp` と `ev` の符号がねじれると、表で「機械割100%超なのに期待値マイナス」という
あり得ない行が出る。生成側で丸めた結果ねじれることがあるので、そこは寄せてから出す。

## 巻き戻さないこと

期待値データは毎晩の収集で前へ進むだけの資産で、後ろへは動かない。
古い土台で再生成したJSONを新しい `main` へマージすると1日ぶんが黙って消えるため、
`data-guard` workflow が PR と `main` への push で止める。
詳しくは [CLAUDE.md の「データは巻き戻さない」](../CLAUDE.md) を参照。

## 更新の流れ（現在）

収集PCで `collect_and_push.bat` が動き、収集 → 期待値表の生成 → この
リポジトリへ commit/push まで行う。push を `nextjs.yml` が検知してサイトを再デプロイする。

将来このリポジトリへ生成スクリプトを統合する場合は、`.github/workflows/` に
`schedule`＋`workflow_dispatch` のジョブを置いて同じことをさせる想定。

## 公開画面のサンプル更新

ビルド時に `/live-data/index.json` と `/live-data/<店舗id>/<機種id>.json` を静的出力する。
一覧は機種の表示用情報と更新判定用の `revision`、詳細は検証済みの `machine` と
掲載中の `savedTargets` を持つ。`intervalExplorer` や掲載対象外の狙い目は含めない。
`revision` は公開する内容全体のSHA-256とし、同じ更新日内のサンプル増加・再計算も検知する。

画面表示中は60秒ごと、および画面に戻ったときに一覧を取得し、変更のあった機種の詳細だけを
取得する。選択中の狙い方・レート・利用可能な絞り込みは保持する。通信失敗や一覧と詳細の
版が揃わない場合は表示中のデータを保持し、次回に再試行する。

## 手動で掲載する狙い目

`data/saved-targets/targets.json` が掲載対象・名称の正本。狙い目探しツールで利用者が
追加・取り外しを選んだときに更新し、私用の保存一覧とは分ける。全条件を公開しない。
カタログは `{ schema: "evlive-saved-targets/v1", updatedAt, targets: [...] }`。

各項目は `id`（UUID）、自由入力の `name`、`machineId`、`hallId`、`conditionKey`、
`publicationKey`、`definition`、`machine`、`profile`、`conditions`、`stopping`、
`rate: "46/52"`、`dataThrough`、`sourceRevision`、`updatedAt`、`rows` を持つ。
`conditions` と `stopping` は表示用の文字列。`assumedPayout?: boolean` は想定出玉の注記。
`conditionKey` は正規化した条件定義のSHA-256、`publicationKey` は公開するID・名称・
条件定義のSHA-256。更新日付は `YYYY-MM-DD`、版は64文字の小文字16進数。

`definition` は `schema: "interval-target/v1"`、機種・店舗、`profileKey`、`startG`、
`endG`（未指定はnull）、`filters`、`rate: "46/52"`、`stopRule: "evlive"`。
フィルターは軸キーごとの `{ mode: "all" | "range" | "missing", lo, hi }`。
上下限は数値文字列／空文字列で、`hi` は排他的上限。空のrangeは「記録あり」を意味し、
allやmissingとは異なる。現在の店舗は新宿（`shinjuku`）。

公開する集計行は `{ g, ev, n, days }` のみ。`ev` は推定平均収支（円）またはnull、
`n` は該当区間数、`days` は収集日数。開始Gの昇順・重複なしで、終了G未満の行を持つ。
通常の `baseAnchors` と違い機械割・時給は持たないため、専用の「狙い目」欄で表示する。

収集側は機種JSONの任意フィールド `savedTargets` に
`{ id, conditionKey, sourceRevision, dataThrough, rows }[]` を出力できる。
サイトはカタログに載るIDと条件キーが一致し、集計日が古くない結果だけ採用する。
取り外したIDが機種JSONに残っていても表示しない。一致する更新がなければ、カタログの
追加時集計と日付を表示する。空の更新結果も有効で、古い非空の表へ戻さない。

ビルド時に `site/scripts/export-saved-targets.mjs` が検証・許可項目への絞り込みを行い、
公開状態確認用の `/ev-live/saved-targets.json` を出力する。生履歴・イベント・秘密鍵は
カタログや集計結果に含めない。公開リンクは
`/ev-live/machines/<machineId>/shinjuku/?target=<id>`。
