# ev-live

パチスロ期待値表示サイト。GitHub Pages のプロジェクトページ（basePath=`/ev-live`）として公開。
データ（`data/machines/*.json`）は別リポジトリのスクレイパーが毎晩自動生成して push する。

## UIを見せるとき（重要）
ユーザーにUIを見せる・確認してもらうときは、**ローカルの dev サーバ起動手順やスクショではなく、
公開中のライブURLを案内する**こと:

- トップ（機種一覧）: https://seiyokentstyle-source.github.io/ev-live/
- 機種詳細: https://seiyokentstyle-source.github.io/ev-live/machines/<id>/ （例: `.../machines/hokuto/`）

注意: ライブサイトは `main` ブランチのデプロイ結果。PR の変更を実機で見せたい場合はマージ後に反映される。

## 制約
- `data/machines/*.json` は編集しない（スクレイパーが毎晩上書きする）。表示の都合はサイト側で吸収する。
- `lib/ev/validate.ts` のバリデーションを壊さない。
- `tests/`（vitest）が通ること。テストはスクレイプ値に依存しない形で書く。
- 公開は静的書き出し（`next build` → `out/`）。`actions/configure-pages` が basePath / `output: export` を注入。
