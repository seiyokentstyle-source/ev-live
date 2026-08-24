# ev-live

パチスロ期待値の**データ中心**リポジトリ。主役は `data/machines/*.json`（スクレイパー生成物）。
表示用の Next.js サイトは従属物として `site/` に置き、GitHub Pages のプロジェクトページ
（basePath=`/ev-live`）として公開する。

## リポジトリ構成（データ中心）
- `data/machines/*.json` … 主役。期待値データ（スクレイパーが毎晩生成・上書き）。
- `scraper/` … データ生成スクリプト（独立。サイトとは分離）。※統合予定
- `site/` … 表示用 Next.js（おまけ）。ビルド/テスト/設定は全て `site/` 配下で完結。
- `.github/workflows/nextjs.yml` … `site/` をビルドして Pages へデプロイ。
- `.github/workflows/data-guard.yml` … データの巻き戻りを止める（下記）。
- `scripts/check-data-regression.mjs` … 同上の実体。ローカルでも走らせられる。

## UIを見せるとき（重要）
ユーザーにUIを見せる・確認してもらうときは、**ローカルの dev サーバ起動手順やスクショではなく、
公開中のライブURLを案内する**こと:

- トップ（機種一覧）: https://seiyokentstyle-source.github.io/ev-live/
- 機種詳細: https://seiyokentstyle-source.github.io/ev-live/machines/<id>/ （例: `.../machines/hokuto/`）

注意: ライブサイトは `main` ブランチのデプロイ結果。PR の変更を実機で見せたい場合はマージ後に反映される。

## データは巻き戻さない（重要）
`data/machines/**/*.json` は毎晩の収集で**前へ進むだけ**の資産。後ろへ動くことはない。
古い土台で再生成したJSONを新しい `main` へマージすると、1日ぶんが黙って消える
（実際に一度、8/22のCSVから作ったJSONを8/23ぶんが入った `main` へマージしかけた）。

**ブランチで作業して `main` が進んでいたら、データは `main` 側を採用してコードの変更だけ残すこと:**
```
git fetch origin main
git checkout origin/main -- data/machines
```
`make_evlive_data.py` の「大幅減なら上書きしない」ガードは再生成時にしか効かず、
gitのマージは素通りする。そのため `data-guard` workflow が PR と `main` への push で
`scripts/check-data-regression.mjs` を走らせて止める。手元でも確認できる:
```
node scripts/check-data-regression.mjs
```
- `lastUpdated` が古くなったら**必ず失敗**（意図して古くする場面が無いため、合図でも通さない）
- 件数の1割超の減少・機種JSONの消失は、コミットメッセージに `[allow-data-regression]` が
  あれば通る（スペック変更で正しく減る／獲得データ不良の機種を外した場合）

## 制約
- `data/machines/*.json` は編集しない（スクレイパーが毎晩上書きする）。表示の都合はサイト側で吸収する。
- `site/lib/ev/validate.ts` のバリデーションを壊さない。
- `site/tests/`（vitest）が通ること。テストはスクレイプ値に依存しない形で書く。
- データはリポジトリ root の `data/`、サイトは `site/`。`site/lib/machines.ts` は root の `data/` を解決して読む。
- 公開は静的書き出し（`site/` で `next build` → `site/out/`）。basePath / `output: export` は
  デプロイ workflow が env（`PAGES_BASE_PATH=/ev-live` / `STATIC_EXPORT=true`）で注入し、
  `next.config.mjs` が読む。ローカル `next dev` は env 未設定で `/` で動く。

## よく使うコマンド（すべて `site/` で）
- 開発: `cd site && npm run dev`
- テスト: `cd site && npm test`
- 本番相当ビルド: `cd site && PAGES_BASE_PATH=/ev-live STATIC_EXPORT=true npm run build`
